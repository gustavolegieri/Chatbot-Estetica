"""Agente local do Portão IA — Garagem do Ka.

O vídeo nunca é enviado para a nuvem. Um modelo YOLO leve detecta e acompanha
veículos no computador local; somente os eventos ENTER/EXIT chegam ao CRM.
"""

from __future__ import annotations

import base64
import json
import os
import re
import tempfile
import threading
import time
import uuid
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import requests
from dotenv import load_dotenv
from ultralytics import YOLO


ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

API_URL = os.getenv("GATE_API_URL", "http://localhost:3000/api/admin/gate-vision").strip()
DEVICE_TOKEN = os.getenv("GATE_DEVICE_TOKEN", "").strip()
DEVICE_ID = os.getenv("GATE_DEVICE_ID", "portao-principal").strip()
CAMERA_NAME = os.getenv("GATE_CAMERA_NAME", "Webcam do portão").strip()
MODEL_NAME = os.getenv("GATE_MODEL", "yolov8n.pt").strip()
CONFIDENCE = float(os.getenv("GATE_CONFIDENCE", "0.55"))
GATE_LINE = float(os.getenv("GATE_LINE", "0.58"))
GATE_LINE_HYSTERESIS = max(0.01, float(os.getenv("GATE_LINE_HYSTERESIS", "0.025")))
PROCESS_FPS = max(1.0, float(os.getenv("GATE_PROCESS_FPS", "3")))
CAMERA_WIDTH = max(640, int(os.getenv("GATE_CAMERA_WIDTH", "1920")))
CAMERA_HEIGHT = max(480, int(os.getenv("GATE_CAMERA_HEIGHT", "1080")))
CAMERA_FPS = max(10.0, min(60.0, float(os.getenv("GATE_CAMERA_FPS", "30"))))
DETECTION_WIDTH = max(640, min(1280, int(os.getenv("GATE_DETECTION_WIDTH", "768"))))
MODEL_IMAGE_SIZE = max(416, min(960, int(os.getenv("GATE_MODEL_IMAGE_SIZE", "512"))))
CPU_THREADS = max(1, min(8, int(os.getenv("GATE_CPU_THREADS", "4"))))
TORCH_THREADS = max(0, min(32, int(os.getenv("GATE_TORCH_THREADS", "0"))))
HEARTBEAT_SECONDS = max(30.0, float(os.getenv("GATE_HEARTBEAT_SECONDS", "60")))
TRACK_TTL_SECONDS = max(2.0, float(os.getenv("GATE_TRACK_TTL_SECONDS", "6")))
EVENT_COOLDOWN_SECONDS = max(10.0, float(os.getenv("GATE_EVENT_COOLDOWN_SECONDS", "25")))
SHOW_PREVIEW = os.getenv("GATE_SHOW_PREVIEW", "true").lower() == "true"
SEND_SNAPSHOTS = os.getenv("GATE_SEND_SNAPSHOTS", "false").lower() == "true"
FLIP_VERTICAL = os.getenv("GATE_FLIP_VERTICAL", "false").lower() == "true"
PLATE_OCR_ENABLED = os.getenv("GATE_PLATE_OCR_ENABLED", "true").lower() == "true"
PLATE_OCR_MIN_CONFIDENCE = float(os.getenv("GATE_PLATE_OCR_MIN_CONFIDENCE", "0.45"))
PLATE_SCAN_INTERVAL = max(0.25, float(os.getenv("GATE_PLATE_SCAN_INTERVAL", "0.8")))
PLATE_EVENT_WAIT_SECONDS = max(2.0, float(os.getenv("GATE_PLATE_EVENT_WAIT_SECONDS", "10")))
PLATE_CONFIRM_READS = max(2, min(4, int(os.getenv("GATE_PLATE_CONFIRM_READS", "2"))))
PLATE_MAX_READS = max(PLATE_CONFIRM_READS, min(12, int(os.getenv("GATE_PLATE_MAX_READS", "7"))))
PLATE_SINGLE_HIGH_CONFIDENCE = max(
    PLATE_OCR_MIN_CONFIDENCE,
    min(0.99, float(os.getenv("GATE_PLATE_SINGLE_HIGH_CONFIDENCE", "0.88"))),
)
DETECTION_DISPLAY_TTL_SECONDS = max(0.5, float(os.getenv("GATE_DETECTION_DISPLAY_TTL_SECONDS", "5")))
PRESENCE_RECOVERY_SECONDS = max(2.0, float(os.getenv("GATE_PRESENCE_RECOVERY_SECONDS", "4")))
BOX_SMOOTHING_STILL = min(0.8, max(0.05, float(os.getenv("GATE_BOX_SMOOTHING_STILL", "0.12"))))
BOX_SMOOTHING_MOVING = min(0.95, max(BOX_SMOOTHING_STILL, float(os.getenv("GATE_BOX_SMOOTHING_MOVING", "0.42"))))
TIMELAPSE_ENABLED = os.getenv("GATE_TIMELAPSE_ENABLED", "true").lower() == "true"
TIMELAPSE_INTERVAL_SECONDS = max(5.0, float(os.getenv("GATE_TIMELAPSE_INTERVAL_SECONDS", "30")))
TIMELAPSE_MAX_FRAMES = max(24, int(os.getenv("GATE_TIMELAPSE_MAX_FRAMES", "300")))
TIMELAPSE_FPS = max(6.0, float(os.getenv("GATE_TIMELAPSE_FPS", "12")))
TIMELAPSE_MAX_BYTES = min(2_800_000, max(500_000, int(os.getenv("GATE_TIMELAPSE_MAX_BYTES", "2400000"))))
LIVE_ENABLED = os.getenv("GATE_LIVE_ENABLED", "true").lower() == "true"
LIVE_API_URL = os.getenv(
    "GATE_LIVE_API_URL",
    API_URL.replace("/api/admin/gate-vision", "/api/gate-live/device"),
).strip()
LIVE_FPS = max(2.0, min(15.0, float(os.getenv("GATE_LIVE_FPS", "8"))))
LIVE_WIDTH = max(480, min(1280, int(os.getenv("GATE_LIVE_WIDTH", "960"))))
STATE_FILE = ROOT / "gate-state.json"
QUEUE_FILE = ROOT / "pending-events.json"
PLATE_PATTERN = re.compile(r"^[A-Z]{3}(?:\d{4}|\d[A-Z]\d{2})$")
LETTER_EQUIVALENTS = {"0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B"}
DIGIT_EQUIVALENTS = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "T": "1", "Z": "2", "A": "4", "S": "5", "G": "6", "B": "8"}
VEHICLE_CLASSES = [2, 3, 5, 7]  # carro, moto, ônibus e caminhão no COCO


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def camera_source() -> int | str:
    source = os.getenv("GATE_CAMERA_SOURCE", "0").strip()
    return int(source) if source.isdigit() else source


def atomic_json_write(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def load_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return fallback


def zone_for_y(value: float) -> str:
    if value <= GATE_LINE - GATE_LINE_HYSTERESIS:
        return "OUTSIDE"
    if value >= GATE_LINE + GATE_LINE_HYSTERESIS:
        return "INSIDE"
    return "MIDDLE"


def normalize_plate(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def valid_plate(value: str) -> bool:
    return bool(PLATE_PATTERN.fullmatch(normalize_plate(value)))


def coerce_plate_candidate(value: str) -> tuple[str, int] | None:
    raw_candidate = normalize_plate(value)
    if len(raw_candidate) < 7 or len(raw_candidate) > 10:
        return None
    patterns = ("LLLDDDD", "LLLDLDD")
    options: list[tuple[str, int]] = []
    for start in range(len(raw_candidate) - 6):
        candidate = raw_candidate[start:start + 7]
        removed = len(raw_candidate) - 7
        for pattern in patterns:
            corrected: list[str] = []
            changes = removed
            possible = True
            for char, expected in zip(candidate, pattern):
                if expected == "L":
                    replacement = char if char.isalpha() else LETTER_EQUIVALENTS.get(char)
                else:
                    replacement = char if char.isdigit() else DIGIT_EQUIVALENTS.get(char)
                if replacement is None:
                    possible = False
                    break
                corrected.append(replacement)
                changes += int(replacement != char)
            plate = "".join(corrected)
            if possible and changes <= max(1, removed) and valid_plate(plate):
                options.append((plate, changes))
    return min(options, key=lambda item: item[1]) if options else None


def resolve_plate_against_expected(value: str, expected_plates: set[str], max_distance: int = 2) -> str:
    plate = normalize_plate(value)
    if plate in expected_plates or not valid_plate(plate):
        return plate
    ranked = sorted(
        (
            (sum(left != right for left, right in zip(expected, plate)), expected)
            for expected in expected_plates
            if len(expected) == len(plate)
        ),
        key=lambda item: item[0],
    )
    if not ranked or ranked[0][0] > max_distance:
        return plate
    best_distance = ranked[0][0]
    nearest = [expected for distance, expected in ranked if distance == best_distance]
    return nearest[0] if len(nearest) == 1 else plate


@dataclass
class TrackMemory:
    first_seen: float = field(default_factory=time.monotonic)
    first_zone: str | None = None
    last_seen: float = field(default_factory=time.monotonic)
    positions: deque[float] = field(default_factory=lambda: deque(maxlen=40))
    emitted: bool = False
    confidence: float = 0.0
    plate: str = ""
    plate_confidence: float = 0.0
    plate_readings: deque[tuple[str, float]] = field(default_factory=lambda: deque(maxlen=PLATE_MAX_READS))
    last_ocr_at: float = 0.0
    last_box: tuple[int, int, int, int] | None = None
    ocr_future: Future[tuple[str, float] | None] | None = None
    pending_crossing: str | None = None
    pending_frame: Any | None = None
    pending_since: float = 0.0
    stable_box_state: np.ndarray | None = None  # centro x/y, largura e altura
    box_velocity: np.ndarray = field(default_factory=lambda: np.zeros(4, dtype=np.float64))
    box_updated_at: float = 0.0

    def add_plate_read(self, reading: tuple[str, float] | None, allow_single: bool = False) -> bool:
        if reading:
            plate, confidence = normalize_plate(reading[0]), float(reading[1])
            if valid_plate(plate):
                self.plate_readings.append((plate, confidence))
        if self.plate:
            return True
        if not self.plate_readings:
            return False

        grouped: dict[str, list[float]] = {}
        for plate, confidence in self.plate_readings:
            grouped.setdefault(plate, []).append(confidence)
        ranked = sorted(
            grouped.items(),
            key=lambda item: (len(item[1]), sum(item[1]) / len(item[1]), max(item[1])),
            reverse=True,
        )
        candidate, confidences = ranked[0]
        confirmations = len(confidences)
        average = sum(confidences) / confirmations
        runner_confirmations = len(ranked[1][1]) if len(ranked) > 1 else 0
        confirmed = confirmations >= PLATE_CONFIRM_READS and confirmations > runner_confirmations
        high_confidence_single = allow_single and confirmations == 1 and max(confidences) >= PLATE_SINGLE_HIGH_CONFIDENCE
        if not confirmed and not high_confidence_single:
            return False
        self.plate = candidate
        self.plate_confidence = min(0.99, average + min(0.10, (confirmations - 1) * 0.05))
        return True

    def stabilize_box(
        self,
        box: tuple[int, int, int, int],
        now: float,
        frame_width: int,
        frame_height: int,
    ) -> tuple[int, int, int, int]:
        x1, y1, x2, y2 = box
        measured = np.array(((x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1), dtype=np.float64)
        if self.stable_box_state is None:
            self.stable_box_state = measured
            self.box_velocity.fill(0)
        else:
            dt = min(0.75, max(0.04, now - self.box_updated_at))
            predicted = self.stable_box_state + self.box_velocity * dt
            innovation = measured - predicted
            diagonal = max(1.0, float(np.hypot(predicted[2], predicted[3])))
            movement = float(np.hypot(innovation[0], innovation[1]) / diagonal)
            previous = self.stable_box_state.copy()
            if movement <= 0.025:
                # Carro parado: nao transforme o pequeno tremor do detector em movimento.
                self.stable_box_state = previous + (measured - previous) * BOX_SMOOTHING_STILL
                self.box_velocity *= 0.18
            else:
                gain = 0.78 if movement > 0.35 else BOX_SMOOTHING_MOVING
                self.stable_box_state = predicted + innovation * gain
                # Largura/altura oscilam muito mais que o centro nas caixas do YOLO.
                size_gain = min(0.34, gain * 0.62)
                self.stable_box_state[2:] = previous[2:] + (measured[2:] - previous[2:]) * size_gain
                measured_velocity = (self.stable_box_state - previous) / dt
                self.box_velocity = self.box_velocity * 0.72 + measured_velocity * 0.28
                self.box_velocity[2:] *= 0.35
        self.box_updated_at = now
        return self.display_box(now, frame_width, frame_height)

    def display_box(self, now: float, frame_width: int, frame_height: int) -> tuple[int, int, int, int]:
        if self.stable_box_state is None:
            return self.last_box or (0, 0, 0, 0)
        prediction_seconds = min(0.45, max(0.0, now - self.box_updated_at))
        state = self.stable_box_state + self.box_velocity * prediction_seconds
        cx, cy, width, height = state
        width = min(frame_width, max(40.0, width))
        height = min(frame_height, max(40.0, height))
        x1 = int(max(0, min(frame_width - 1, cx - width / 2)))
        y1 = int(max(0, min(frame_height - 1, cy - height / 2)))
        x2 = int(max(x1 + 1, min(frame_width, cx + width / 2)))
        y2 = int(max(y1 + 1, min(frame_height, cy + height / 2)))
        return x1, y1, x2, y2

    def observe(self, y_normalized: float, confidence: float, box: tuple[int, int, int, int]) -> str | None:
        self.positions.append(y_normalized)
        self.last_seen = time.monotonic()
        self.confidence = max(self.confidence, confidence)
        self.last_box = box
        zone = zone_for_y(y_normalized)
        if zone != "MIDDLE" and self.first_zone is None:
            self.first_zone = zone
        if self.emitted or zone == "MIDDLE" or self.first_zone is None or zone == self.first_zone:
            return None
        self.emitted = True
        if self.first_zone == "OUTSIDE" and zone == "INSIDE":
            return "ENTER"
        if self.first_zone == "INSIDE" and zone == "OUTSIDE":
            return "EXIT"
        return None


class GateVisionAgent:
    def __init__(self) -> None:
        if not DEVICE_TOKEN:
            raise RuntimeError("GATE_DEVICE_TOKEN não foi configurado no arquivo camera-agent/.env")
        if not (GATE_LINE_HYSTERESIS < GATE_LINE < 1 - GATE_LINE_HYSTERESIS):
            raise RuntimeError("GATE_LINE deve ficar entre 0 e 1, longe das bordas da imagem")
        cv2.setNumThreads(max(1, min(4, CPU_THREADS)))
        try:
            import torch

            if TORCH_THREADS > 0:
                torch.set_num_threads(TORCH_THREADS)
        except Exception:
            pass
        self.model = YOLO(MODEL_NAME)
        self.ocr = None
        self.ocr_engine = "none"
        self.ocr_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gate-plate-ocr")
        self.detector_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gate-yolo")
        self.network_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="gate-network")
        self.detection_future: Future[tuple[float, float, list[tuple[int, tuple[int, int, int, int], float]]]] | None = None
        self.heartbeat_future: Future[Any] | None = None
        self.network_futures: set[Future[Any]] = set()
        self.queue_lock = threading.Lock()
        self.last_inference_ms = 0.0
        self.last_metrics_at = 0.0
        self.expected_plates: set[str] = set()
        self.expected_plates_loaded = False
        if PLATE_OCR_ENABLED:
            try:
                from rapidocr_onnxruntime import RapidOCR

                self.ocr = RapidOCR()
                self.ocr_engine = "rapid"
                print("[Portao IA] OCR ONNX otimizado pronto")
            except Exception as rapid_error:
                try:
                    import easyocr

                    self.ocr = easyocr.Reader(["en"], gpu=False, verbose=False)
                    self.ocr_engine = "easy"
                    print(f"[Portao IA] OCR ONNX indisponivel; usando contingencia: {rapid_error}")
                except Exception as error:
                    print(f"[Portao IA] OCR de placa indisponivel: {error}")
        source = camera_source()
        self.capture = cv2.VideoCapture(source)
        if isinstance(source, int):
            self.capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
        self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
        self.capture.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
        self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not self.capture.isOpened():
            raise RuntimeError("Não foi possível abrir a webcam. Revise GATE_CAMERA_SOURCE.")
        self.tracks: dict[int, TrackMemory] = {}
        self.state = load_json(STATE_FILE, {"occupied": False, "lastEvent": None})
        self.last_event_at = 0.0
        self.last_heartbeat_at = 0.0
        self.last_process_at = 0.0
        self.last_detections: list[tuple[int, tuple[int, int, int, int], float]] = []
        self.last_detection_at = 0.0
        self.track_aliases: dict[int, int] = {}
        self.timelapse_active = False
        self.timelapse_plate = ""
        self.timelapse_started_at = 0.0
        self.timelapse_last_frame_at = 0.0
        self.timelapse_frames: deque[bytes] = deque(maxlen=TIMELAPSE_MAX_FRAMES)
        self.timelapse_resume_pending = bool(self.state.get("occupied"))
        self.frame_width = int(self.capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        self.frame_height = int(self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        self.live_publisher = None
        if LIVE_ENABLED:
            try:
                from webrtc_live import GateWebRtcPublisher

                self.live_publisher = GateWebRtcPublisher(
                    api_url=LIVE_API_URL,
                    device_id=DEVICE_ID,
                    device_token=DEVICE_TOKEN,
                    fps=LIVE_FPS,
                    width=LIVE_WIDTH,
                )
                self.live_publisher.start()
            except Exception as error:
                print(f"[Portao IA] WebRTC indisponivel; instale as dependencias: {error}")

    def submit_network(self, callback: Any, *args: Any) -> None:
        future = self.network_executor.submit(callback, *args)
        self.network_futures.add(future)
        future.add_done_callback(lambda completed: self.network_futures.discard(completed))

    def prepare_detection_frame(self, frame: Any) -> tuple[Any, int, int]:
        height, width = frame.shape[:2]
        target_width = min(width, DETECTION_WIDTH)
        if target_width == width:
            return frame.copy(), width, height
        target_height = max(2, int(height * target_width / width))
        reduced = cv2.resize(frame, (target_width, target_height), interpolation=cv2.INTER_AREA)
        return reduced, width, height

    def detect_vehicles(
        self,
        frame: Any,
        original_width: int,
        original_height: int,
        captured_at: float,
    ) -> tuple[float, float, list[tuple[int, tuple[int, int, int, int], float]]]:
        started = time.perf_counter()
        result = self.model.track(
            frame,
            persist=True,
            classes=VEHICLE_CLASSES,
            conf=CONFIDENCE,
            verbose=False,
            tracker="bytetrack.yaml",
            imgsz=MODEL_IMAGE_SIZE,
        )[0]
        detections: list[tuple[int, tuple[int, int, int, int], float]] = []
        if result.boxes is not None and result.boxes.id is not None:
            scale_x = original_width / max(1, frame.shape[1])
            scale_y = original_height / max(1, frame.shape[0])
            for box, track_id, confidence in zip(
                result.boxes.xyxy.cpu().tolist(),
                result.boxes.id.int().cpu().tolist(),
                result.boxes.conf.cpu().tolist(),
            ):
                x1, y1, x2, y2 = box
                detections.append((
                    int(track_id),
                    (int(x1 * scale_x), int(y1 * scale_y), int(x2 * scale_x), int(y2 * scale_y)),
                    float(confidence),
                ))
        elapsed_ms = (time.perf_counter() - started) * 1000
        return captured_at, elapsed_ms, detections

    def schedule_detection(self, frame: Any, now: float) -> None:
        if self.detection_future is not None or now - self.last_process_at < 1 / PROCESS_FPS:
            return
        # EasyOCR e YOLO usam a mesma CPU. Dar uma janela exclusiva ao OCR faz
        # a placa terminar em vez de manter os dois modelos disputando núcleos.
        if any(memory.ocr_future is not None and not memory.ocr_future.done() for memory in self.tracks.values()):
            return
        reduced, original_width, original_height = self.prepare_detection_frame(frame)
        self.last_process_at = now
        self.detection_future = self.detector_executor.submit(
            self.detect_vehicles,
            reduced,
            original_width,
            original_height,
            now,
        )

    @staticmethod
    def box_iou(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> float:
        ax1, ay1, ax2, ay2 = first
        bx1, by1, bx2, by2 = second
        intersection = max(0, min(ax2, bx2) - max(ax1, bx1)) * max(0, min(ay2, by2) - max(ay1, by1))
        first_area = max(1, (ax2 - ax1) * (ay2 - ay1))
        second_area = max(1, (bx2 - bx1) * (by2 - by1))
        return intersection / max(1, first_area + second_area - intersection)

    def canonical_track_id(self, raw_track_id: int, box: tuple[int, int, int, int], now: float) -> int:
        aliased = self.track_aliases.get(raw_track_id)
        if aliased is not None and aliased in self.tracks:
            return aliased
        best_id, best_score = raw_track_id, 0.0
        for candidate_id, memory in self.tracks.items():
            if now - memory.last_seen > DETECTION_DISPLAY_TTL_SECONDS or memory.last_box is None:
                continue
            score = self.box_iou(box, memory.last_box)
            if score > best_score:
                best_id, best_score = candidate_id, score
        canonical = best_id if best_score >= 0.28 else raw_track_id
        self.track_aliases[raw_track_id] = canonical
        return canonical

    def visible_detections(self, now: float) -> list[tuple[int, tuple[int, int, int, int], float]]:
        return [
            (track_id, memory.display_box(now, self.frame_width, self.frame_height), memory.confidence)
            for track_id, memory in self.tracks.items()
            if memory.stable_box_state is not None and now - memory.last_seen <= DETECTION_DISPLAY_TTL_SECONDS
        ]

    @property
    def headers(self) -> dict[str, str]:
        return {"Content-Type": "application/json", "x-gate-vision-token": DEVICE_TOKEN}

    def post(self, payload: dict[str, Any], queue_on_failure: bool = False) -> dict[str, Any] | None:
        try:
            timeout = 35 if payload.get("action") == "gate_event" else 15
            response = requests.post(API_URL, headers=self.headers, json=payload, timeout=timeout)
            response.raise_for_status()
            body = response.json()
            if not body.get("success"):
                raise RuntimeError(body.get("error", "Resposta inválida do CRM"))
            data = body.get("data")
            return data if isinstance(data, dict) else {"success": True}
        except (requests.RequestException, ValueError, RuntimeError) as error:
            print(f"[Portão IA] Falha ao enviar {payload.get('action')}: {error}")
            if queue_on_failure:
                with self.queue_lock:
                    queue = load_json(QUEUE_FILE, [])
                    if not any(item.get("eventId") == payload.get("eventId") for item in queue):
                        queue.append(payload)
                        atomic_json_write(QUEUE_FILE, queue[-100:])
            return None

    def flush_queue(self) -> None:
        with self.queue_lock:
            queue = load_json(QUEUE_FILE, [])
            if not queue:
                return
            remaining: list[dict[str, Any]] = []
            failed = False
            for payload in queue:
                if failed:
                    remaining.append(payload)
                elif not self.post(payload, queue_on_failure=False):
                    remaining.append(payload)
                    failed = True
            atomic_json_write(QUEUE_FILE, remaining)

    def encode_snapshot(
        self,
        frame: Any,
        box: tuple[int, int, int, int] | None = None,
        event_type: str | None = None,
        plate: str = "",
    ) -> str | None:
        if not SEND_SNAPSHOTS:
            return None
        if box:
            frame_height, frame_width = frame.shape[:2]
            x1, y1, x2, y2 = box
            padding_x = int((x2 - x1) * .08)
            padding_y = int((y2 - y1) * .08)
            crop_x1 = max(0, x1 - padding_x)
            crop_y1 = max(0, y1 - padding_y)
            crop_x2 = min(frame_width, x2 + padding_x)
            crop_y2 = min(frame_height, y2 + padding_y)
            if crop_x2 - crop_x1 >= 160 and crop_y2 - crop_y1 >= 120:
                frame = frame[crop_y1:crop_y2, crop_x1:crop_x2].copy()
        height, width = frame.shape[:2]
        if width > 1280:
            frame = cv2.resize(frame, (1280, int(height * 1280 / width)))
        if event_type:
            height, width = frame.shape[:2]
            banner_height = max(68, int(height * .12))
            overlay = frame.copy()
            cv2.rectangle(overlay, (0, height - banner_height), (width, height), (12, 14, 18), -1)
            frame = cv2.addWeighted(overlay, .86, frame, .14, 0)
            title = "ENTRADA - LAVAGEM INICIADA" if event_type == "ENTER" else "SAIDA - EM FINALIZACAO"
            detail = f"PLACA {plate or 'NAO LIDA'}  |  {datetime.now().astimezone().strftime('%d/%m/%Y %H:%M')}"
            cv2.putText(frame, title, (20, height - banner_height + 27), cv2.FONT_HERSHEY_SIMPLEX, .62, (60, 205, 255), 2, cv2.LINE_AA)
            cv2.putText(frame, detail, (20, height - 16), cv2.FONT_HERSHEY_SIMPLEX, .48, (235, 235, 235), 1, cv2.LINE_AA)
        success, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
        if not success:
            return None
        return "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii")

    def prepare_timelapse_frame(self, frame: Any) -> Any:
        safe = frame.copy()
        height, width = safe.shape[:2]
        target_width = min(960, width)
        if target_width < width:
            safe = cv2.resize(safe, (target_width, int(height * target_width / width)), interpolation=cv2.INTER_AREA)
        height, width = safe.shape[:2]
        overlay = safe.copy()
        cv2.rectangle(overlay, (0, height - 52), (width, height), (12, 14, 18), -1)
        safe = cv2.addWeighted(overlay, .82, safe, .18, 0)
        label = f"GARAGEM DO KA  |  {self.timelapse_plate or 'VEICULO EM ATENDIMENTO'}"
        captured = datetime.now().astimezone().strftime("%d/%m/%Y %H:%M")
        cv2.putText(safe, label, (16, height - 29), cv2.FONT_HERSHEY_SIMPLEX, .48, (60, 205, 255), 1, cv2.LINE_AA)
        cv2.putText(safe, captured, (16, height - 10), cv2.FONT_HERSHEY_SIMPLEX, .38, (235, 235, 235), 1, cv2.LINE_AA)
        return safe

    def capture_timelapse_frame(self, frame: Any, now: float, force: bool = False) -> None:
        if not self.timelapse_active or (not force and now - self.timelapse_last_frame_at < TIMELAPSE_INTERVAL_SECONDS):
            return
        self.timelapse_last_frame_at = now
        safe = self.prepare_timelapse_frame(frame)
        success, encoded = cv2.imencode(".jpg", safe, [cv2.IMWRITE_JPEG_QUALITY, 68])
        if success:
            self.timelapse_frames.append(encoded.tobytes())

    def start_timelapse(self, frame: Any, plate: str, now: float) -> None:
        if not TIMELAPSE_ENABLED:
            return
        self.timelapse_frames.clear()
        self.timelapse_plate = plate
        self.timelapse_started_at = now
        self.timelapse_last_frame_at = 0.0
        self.timelapse_active = True
        self.capture_timelapse_frame(frame, now, force=True)
        print(f"[Portao IA] Timelapse iniciado para {plate or 'veiculo'}")

    @staticmethod
    def encode_timelapse_video(frames: list[bytes], width: int, fps: float) -> bytes | None:
        decoded = [cv2.imdecode(np.frombuffer(item, np.uint8), cv2.IMREAD_COLOR) for item in frames]
        decoded = [item for item in decoded if item is not None]
        if len(decoded) < 2:
            return None
        first_height, first_width = decoded[0].shape[:2]
        height = max(2, int(first_height * width / first_width))
        if height % 2:
            height += 1
        temporary_path = ""
        writer = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temporary:
                temporary_path = temporary.name
            writer = cv2.VideoWriter(temporary_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
            if not writer.isOpened():
                return None
            for item in decoded:
                writer.write(cv2.resize(item, (width, height), interpolation=cv2.INTER_AREA))
            writer.release()
            writer = None
            return Path(temporary_path).read_bytes()
        finally:
            if writer is not None:
                writer.release()
            if temporary_path:
                Path(temporary_path).unlink(missing_ok=True)

    def finish_timelapse(self, frame: Any, now: float) -> str | None:
        if not self.timelapse_active:
            return None
        self.capture_timelapse_frame(frame, now, force=True)
        frames = list(self.timelapse_frames)
        self.timelapse_active = False
        self.timelapse_frames.clear()
        for stride, width in ((1, 640), (2, 560), (3, 480)):
            video = self.encode_timelapse_video(frames[::stride], width, TIMELAPSE_FPS)
            if video and len(video) <= TIMELAPSE_MAX_BYTES:
                print(f"[Portao IA] Timelapse finalizado: {len(frames[::stride])} quadros, {len(video) // 1024} KB")
                return "data:video/mp4;base64," + base64.b64encode(video).decode("ascii")
        print("[Portao IA] Timelapse descartado: arquivo acima do limite seguro")
        return None

    @staticmethod
    def plate_search_crop(frame: Any, box: tuple[int, int, int, int]) -> Any | None:
        frame_height, frame_width = frame.shape[:2]
        x1, y1, x2, y2 = box
        box_width, box_height = x2 - x1, y2 - y1
        if box_width < 110 or box_height < 70:
            return None
        margin_x = int(box_width * .08)
        crop_x1 = max(0, x1 + margin_x)
        crop_x2 = min(frame_width, x2 - margin_x)
        crop_y1 = max(0, y1 + int(box_height * .38))
        crop_y2 = min(frame_height, y1 + int(box_height * .94))
        crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
        if crop.size == 0:
            return None
        return crop.copy()

    def read_plate_region(self, crop: Any) -> tuple[str, float] | None:
        if self.ocr is None or crop is None or crop.size == 0:
            return None
        scale = max(1.0, min(1.8, 680 / max(1, crop.shape[1])))
        enlarged = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
        enhanced = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(gray)
        blurred = cv2.GaussianBlur(enhanced, (0, 0), 2.0)
        enhanced = cv2.addWeighted(enhanced, 1.65, blurred, -0.65, 0)
        best: tuple[str, float] | None = None

        # Procura primeiro o retângulo da placa por geometria. A etapa
        # recognize pula o detector de texto do EasyOCR e costuma ser mais de
        # dez vezes mais rápida em uma placa frontal nítida.
        edges = cv2.Canny(enhanced, 45, 145)
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (17, 5)), iterations=2)
        contours, _hierarchy = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        height, width = enhanced.shape[:2]
        candidates: list[tuple[float, tuple[int, int, int, int]]] = []
        for contour in contours:
            x, y, candidate_width, candidate_height = cv2.boundingRect(contour)
            aspect = candidate_width / max(1, candidate_height)
            area_ratio = (candidate_width * candidate_height) / max(1, width * height)
            if not (2.0 <= aspect <= 6.2 and .008 <= area_ratio <= .28):
                continue
            if candidate_width < 70 or candidate_height < 18 or y < height * .12:
                continue
            center_distance = abs((x + candidate_width / 2) - width / 2) / max(1, width / 2)
            aspect_score = max(0.0, 1 - abs(aspect - 3.5) / 3.5)
            score = aspect_score * .55 + (1 - min(1.0, center_distance)) * .30 + min(.15, area_ratio)
            candidates.append((score, (x, y, candidate_width, candidate_height)))

        for _score, (x, y, candidate_width, candidate_height) in sorted(candidates, reverse=True)[:3]:
            inner_x1 = max(0, x + int(candidate_width * .025))
            inner_x2 = min(width, x + candidate_width - int(candidate_width * .025))
            inner_y1 = max(0, y + int(candidate_height * .18))
            inner_y2 = min(height, y + candidate_height - int(candidate_height * .04))
            plate_region = enhanced[inner_y1:inner_y2, inner_x1:inner_x2]
            if plate_region.size == 0:
                continue
            try:
                readings = self.ocr.recognize(
                    plate_region,
                    detail=1,
                    paragraph=False,
                    allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                    decoder="greedy",
                )
            except Exception as error:
                print(f"[Portao IA] Falha temporaria no OCR: {error}")
                break
            for _bounds, text, confidence in readings:
                coerced = coerce_plate_candidate(str(text))
                if not coerced:
                    continue
                plate, corrections = coerced
                score = max(0.0, float(confidence) - corrections * .04)
                if score >= PLATE_OCR_MIN_CONFIDENCE and (best is None or score > best[1]):
                    best = (plate, score)
            if best and best[1] >= .90:
                return best
            if best:
                resolved = resolve_plate_against_expected(best[0], getattr(self, "expected_plates", set()))
                if resolved != best[0]:
                    return resolved, min(.99, best[1] + .12)

        # Fallback para placas sem contorno visível, muito inclinadas ou com
        # reflexo. Executa uma única detecção de texto, sempre fora da thread da
        # prévia da webcam.
        try:
            readings = self.ocr.readtext(
                enhanced,
                detail=1,
                paragraph=False,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                decoder="greedy",
                canvas_size=640,
                mag_ratio=1.0,
            )
        except Exception as error:
            print(f"[Portao IA] Falha temporaria no OCR: {error}")
            return best
        detected_best: tuple[str, float] | None = None
        for _bounds, text, confidence in readings:
            coerced = coerce_plate_candidate(str(text))
            if not coerced:
                continue
            plate, corrections = coerced
            raw_score = float(confidence)
            score = max(0.0, raw_score - corrections * .04)
            if corrections == 0 and raw_score >= PLATE_OCR_MIN_CONFIDENCE:
                score = max(score, .60)
            if score >= PLATE_OCR_MIN_CONFIDENCE and (detected_best is None or score > detected_best[1]):
                detected_best = (plate, score)
        # O detector de texto encontrou os limites da linha completa. Quando
        # ele discorda do recorte geométrico, esta leitura é mais confiável para
        # o primeiro caractere (caso real F/T observado na webcam).
        if detected_best is not None:
            resolved = resolve_plate_against_expected(detected_best[0], getattr(self, "expected_plates", set()))
            if resolved != detected_best[0]:
                return resolved, min(.99, detected_best[1] + .12)
            return detected_best
        if best is not None:
            return best

        # Último recurso para ângulos fortes: a binarização separa caracteres
        # que se misturam ao para-choque. Só roda quando os caminhos rápidos não
        # encontraram nenhum candidato, portanto não pesa na câmera normal.
        _threshold, otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        try:
            readings = self.ocr.readtext(
                otsu,
                detail=1,
                paragraph=False,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                decoder="greedy",
                canvas_size=768,
                mag_ratio=1.0,
            )
        except Exception as error:
            print(f"[Portao IA] Falha temporaria no OCR de contingencia: {error}")
            return None
        for _bounds, text, confidence in readings:
            coerced = coerce_plate_candidate(str(text))
            if not coerced:
                continue
            plate, corrections = coerced
            score = max(0.0, float(confidence) - corrections * .04)
            if score >= PLATE_OCR_MIN_CONFIDENCE and (best is None or score > best[1]):
                best = (plate, score)
        return best

    def read_plate_rapid(self, crop: Any) -> tuple[str, float] | None:
        if self.ocr is None or crop is None or crop.size == 0:
            return None
        try:
            result, _timing = self.ocr(crop)
        except Exception as error:
            print(f"[Portao IA] Falha temporaria no OCR ONNX: {error}")
            return None
        best: tuple[str, float] | None = None
        for item in result or []:
            if not isinstance(item, (list, tuple)) or len(item) < 3:
                continue
            text, confidence = item[1], item[2]
            coerced = coerce_plate_candidate(str(text))
            if not coerced:
                continue
            plate, corrections = coerced
            score = max(0.0, float(confidence) - corrections * .04)
            resolved = resolve_plate_against_expected(plate, getattr(self, "expected_plates", set()))
            if resolved != plate:
                plate, score = resolved, min(.99, score + .12)
            if score >= PLATE_OCR_MIN_CONFIDENCE and (best is None or score > best[1]):
                best = (plate, score)
        return best

    def read_plate_task(self, crop: Any) -> tuple[str, float] | None:
        if getattr(self, "ocr_engine", "easy") == "rapid":
            return self.read_plate_rapid(crop)
        return self.read_plate_region(crop)

    def read_plate(self, frame: Any, box: tuple[int, int, int, int]) -> tuple[str, float] | None:
        crop = self.plate_search_crop(frame, box)
        return self.read_plate_task(crop) if crop is not None else None

    def collect_plate_read(self, memory: TrackMemory) -> None:
        future = memory.ocr_future
        if future is None or not future.done():
            return
        memory.ocr_future = None
        try:
            reading = future.result()
        except Exception as error:
            print(f"[Portao IA] OCR em segundo plano falhou: {error}")
            return
        if reading:
            raw_plate = reading[0]
            resolved_plate = resolve_plate_against_expected(raw_plate, getattr(self, "expected_plates", set()))
            if resolved_plate != raw_plate:
                print(f"[Portao IA] OCR ajustado pela agenda: {raw_plate} -> {resolved_plate}")
                reading = (resolved_plate, min(.99, reading[1] + .12))
            was_confirmed = bool(memory.plate)
            confirmed = memory.add_plate_read(reading)
            votes = sum(1 for plate, _confidence in memory.plate_readings if plate == reading[0])
            if confirmed and not was_confirmed:
                print(f"[Portao IA] Placa confirmada: {memory.plate} ({memory.plate_confidence:.0%}, {votes} leituras)")
            elif not confirmed:
                print(f"[Portao IA] Candidato de placa: {reading[0]} ({reading[1]:.0%}, {votes}/{PLATE_CONFIRM_READS})")

    def schedule_plate_read(
        self,
        frame: Any,
        box: tuple[int, int, int, int],
        memory: TrackMemory,
        now: float,
        force: bool = False,
    ) -> None:
        self.collect_plate_read(memory)
        if self.ocr is None or memory.plate or memory.ocr_future is not None:
            return
        if not getattr(self, "expected_plates_loaded", True) and now - memory.first_seen < 2.5:
            return
        if len(memory.plate_readings) >= PLATE_MAX_READS:
            memory.add_plate_read(None, allow_single=True)
            return
        if not force and now - memory.last_ocr_at < PLATE_SCAN_INTERVAL:
            return
        memory.last_ocr_at = now
        crop = self.plate_search_crop(frame, box)
        if crop is not None:
            memory.ocr_future = self.ocr_executor.submit(self.read_plate_task, crop)

    def queue_crossing(
        self,
        crossing: str,
        track_id: int,
        memory: TrackMemory,
        frame: Any,
        now: float,
    ) -> None:
        memory.pending_crossing = crossing
        memory.pending_frame = frame.copy()
        memory.pending_since = now
        if memory.last_box:
            self.schedule_plate_read(frame, memory.last_box, memory, now, force=True)
        self.flush_pending_crossing(track_id, memory, now)

    def flush_pending_crossing(self, track_id: int, memory: TrackMemory, now: float) -> None:
        self.collect_plate_read(memory)
        if not memory.pending_crossing:
            return
        if not memory.plate and memory.pending_frame is not None and memory.last_box is not None:
            self.schedule_plate_read(memory.pending_frame, memory.last_box, memory, now)
        if not memory.plate and now - memory.pending_since < PLATE_EVENT_WAIT_SECONDS:
            return
        if not memory.plate:
            memory.add_plate_read(None, allow_single=True)
        crossing = memory.pending_crossing
        frame = memory.pending_frame
        memory.pending_crossing = None
        memory.pending_frame = None
        if frame is not None:
            self.emit_event(crossing, track_id, memory, frame)

    def emit_event(self, event_type: str, track_id: int, memory: TrackMemory, frame: Any) -> None:
        now = time.monotonic()
        if now - self.last_event_at < EVENT_COOLDOWN_SECONDS:
            print(f"[Portão IA] {event_type} ignorado durante cooldown")
            return
        occupied = bool(self.state.get("occupied"))
        if event_type == "ENTER" and occupied:
            print("[Portão IA] Entrada ignorada: garagem já marcada como ocupada")
            return
        if event_type == "EXIT" and not occupied:
            print("[Portão IA] Saída ignorada: garagem já marcada como livre")
            return
        payload: dict[str, Any] = {
            "action": "gate_event",
            "eventId": str(uuid.uuid4()),
            "deviceId": DEVICE_ID,
            "type": event_type,
            "capturedAt": utc_now(),
            "confidence": round(memory.confidence, 4),
            "trackId": str(track_id),
        }
        if memory.plate:
            payload["plate"] = memory.plate
            payload["plateConfidence"] = round(memory.plate_confidence, 4)
        snapshot = self.encode_snapshot(frame, memory.last_box, event_type, memory.plate)
        if snapshot:
            payload["snapshotDataUrl"] = snapshot
        if event_type == "EXIT":
            timelapse = self.finish_timelapse(frame, now)
            if timelapse:
                payload["timelapseDataUrl"] = timelapse
        self.submit_network(self.post, payload, True)
        self.state = {
            "occupied": event_type == "ENTER",
            "lastEvent": event_type,
            "currentPlate": memory.plate if event_type == "ENTER" else None,
            "updatedAt": utc_now(),
        }
        atomic_json_write(STATE_FILE, self.state)
        self.last_event_at = now
        if event_type == "ENTER":
            self.start_timelapse(frame, memory.plate, now)
        print(f"[Portão IA] {event_type} detectado · track {track_id} · envio em segundo plano")

    def heartbeat(self, measured_fps: float) -> None:
        now = time.monotonic()
        if now - self.last_heartbeat_at < HEARTBEAT_SECONDS:
            return
        self.last_heartbeat_at = now
        payload = {
            "action": "heartbeat",
            "eventId": str(uuid.uuid4()),
            "deviceId": DEVICE_ID,
            "capturedAt": utc_now(),
            "cameraName": CAMERA_NAME,
            "fps": round(measured_fps, 2),
            "model": MODEL_NAME,
            "width": self.frame_width,
            "height": self.frame_height,
        }
        if self.heartbeat_future is None or self.heartbeat_future.done():
            def send_heartbeat() -> None:
                response = self.post(payload)
                if response and isinstance(response.get("expectedPlates"), list):
                    self.expected_plates = {
                        normalize_plate(str(plate))
                        for plate in response["expectedPlates"]
                        if valid_plate(str(plate))
                    }
                    self.expected_plates_loaded = True
                self.flush_queue()

            self.heartbeat_future = self.network_executor.submit(send_heartbeat)

    def draw_overlay(self, frame: Any, detections: list[tuple[int, tuple[int, int, int, int], float]]) -> None:
        height, width = frame.shape[:2]
        gate_y = int(height * GATE_LINE)
        cv2.line(frame, (0, gate_y), (width, gate_y), (0, 210, 255), 3)
        cv2.putText(frame, "RISCA DO PORTAO", (12, max(28, gate_y - 12)), cv2.FONT_HERSHEY_SIMPLEX, .7, (0, 210, 255), 2)
        cv2.putText(frame, "RUA", (width - 90, max(28, gate_y - 12)), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 190, 255), 2)
        cv2.putText(frame, "GARAGEM", (width - 130, min(height - 12, gate_y + 28)), cv2.FONT_HERSHEY_SIMPLEX, .6, (70, 220, 100), 2)
        for track_id, (x1, y1, x2, y2), confidence in detections:
            cv2.rectangle(frame, (x1, y1), (x2, y2), (212, 175, 55), 2)
            memory = self.tracks.get(track_id)
            plate_label = f" | {memory.plate}" if memory and memory.plate else " | lendo placa..."
            cv2.putText(frame, f"veiculo #{track_id} {confidence:.0%}{plate_label}", (x1, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, .48, (212, 175, 55), 2)
        state_label = "LAVAGEM" if self.state.get("occupied") else "PORTAO LIVRE"
        cv2.putText(frame, state_label, (width - 220, 30), cv2.FONT_HERSHEY_SIMPLEX, .65, (255, 255, 255), 2)
        cv2.putText(frame, f"IA {self.last_inference_ms:.0f} ms", (12, height - 18), cv2.FONT_HERSHEY_SIMPLEX, .48, (235, 235, 235), 1)

    def run(self) -> None:
        print(
            f"[Portão IA] Agente iniciado em {self.frame_width}x{self.frame_height}. "
            "Pressione Q na prévia para encerrar."
        )
        frame_counter, fps_started = 0, time.monotonic()
        while True:
            ok, frame = self.capture.read()
            if not ok:
                print("[Portão IA] Quadro indisponível; tentando novamente...")
                time.sleep(1)
                continue
            if FLIP_VERTICAL:
                frame = cv2.flip(frame, 0)
            if self.live_publisher is not None:
                self.live_publisher.update_frame(frame)
            now = time.monotonic()
            if self.timelapse_resume_pending and not self.timelapse_active:
                self.timelapse_resume_pending = False
                self.start_timelapse(frame, str(self.state.get("currentPlate") or ""), now)
            detections = self.visible_detections(now)
            if self.detection_future is not None and self.detection_future.done():
                completed = self.detection_future
                self.detection_future = None
                current_detections: list[tuple[int, tuple[int, int, int, int], float]] = []
                try:
                    _captured_at, self.last_inference_ms, raw_detections = completed.result()
                    self.last_process_at = now
                    height = frame.shape[0]
                    for raw_track_id, raw_box, confidence in raw_detections:
                        track_id = self.canonical_track_id(raw_track_id, raw_box, now)
                        memory = self.tracks.setdefault(track_id, TrackMemory())
                        stable_box = memory.stabilize_box(raw_box, now, frame.shape[1], height)
                        center_y = ((stable_box[1] + stable_box[3]) / 2) / height
                        self.schedule_plate_read(frame, raw_box, memory, now)
                        crossing = memory.observe(center_y, float(confidence), stable_box)
                        current_detections.append((track_id, stable_box, float(confidence)))
                        if crossing:
                            self.queue_crossing(crossing, track_id, memory, frame, now)
                        elif (
                            not self.state.get("occupied")
                            and not memory.emitted
                            and memory.first_zone == "INSIDE"
                            and center_y >= GATE_LINE + GATE_LINE_HYSTERESIS
                            and memory.plate
                            and now - memory.first_seen >= PRESENCE_RECOVERY_SECONDS
                        ):
                            memory.emitted = True
                            print(f"[Portao IA] Presenca interna recuperada pela placa {memory.plate}")
                            self.queue_crossing("ENTER", track_id, memory, frame, now)
                except Exception as error:
                    print(f"[Portao IA] Detector em segundo plano falhou: {error}")
                if current_detections:
                    self.last_detections = current_detections
                    self.last_detection_at = now
                    detections = self.visible_detections(now)
                elif now - self.last_detection_at > DETECTION_DISPLAY_TTL_SECONDS:
                    self.last_detections = []
                    detections = []
            self.schedule_detection(frame, now)
            for track_id, memory in list(self.tracks.items()):
                self.collect_plate_read(memory)
                self.flush_pending_crossing(track_id, memory, now)
            expired = [
                track_id
                for track_id, memory in self.tracks.items()
                if now - memory.last_seen > TRACK_TTL_SECONDS
                and not memory.pending_crossing
                and (memory.ocr_future is None or memory.ocr_future.done())
            ]
            for track_id in expired:
                del self.tracks[track_id]
            if expired:
                self.track_aliases = {
                    raw_id: canonical_id
                    for raw_id, canonical_id in self.track_aliases.items()
                    if canonical_id in self.tracks
                }
            frame_counter += 1
            elapsed = max(.001, now - fps_started)
            measured_fps = frame_counter / elapsed
            if elapsed >= 10:
                frame_counter, fps_started = 0, now
            if now - self.last_metrics_at >= 10:
                self.last_metrics_at = now
                ocr_busy = any(memory.ocr_future is not None and not memory.ocr_future.done() for memory in self.tracks.values())
                print(
                    f"[Portao IA] Desempenho: camera {measured_fps:.1f} FPS | "
                    f"YOLO {self.last_inference_ms:.0f} ms | veiculos {len(detections)} | OCR {'ocupado' if ocr_busy else 'livre'}"
                )
            self.capture_timelapse_frame(frame, now)
            self.heartbeat(measured_fps)
            if SHOW_PREVIEW:
                self.draw_overlay(frame, detections)
                cv2.imshow("Portao IA - Garagem do Ka", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
        self.capture.release()
        if self.live_publisher is not None:
            self.live_publisher.stop()
        self.ocr_executor.shutdown(wait=False, cancel_futures=True)
        self.detector_executor.shutdown(wait=False, cancel_futures=True)
        self.network_executor.shutdown(wait=False, cancel_futures=True)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    GateVisionAgent().run()
