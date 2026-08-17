"""Agente local do Portão IA — Garagem do Ka.

O vídeo nunca é enviado para a nuvem. Um modelo YOLO leve detecta e acompanha
veículos no computador local; somente os eventos ENTER/EXIT chegam ao CRM.
"""

from __future__ import annotations

import base64
import json
import os
import re
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
PROCESS_FPS = max(1.0, float(os.getenv("GATE_PROCESS_FPS", "5")))
CAMERA_WIDTH = max(640, int(os.getenv("GATE_CAMERA_WIDTH", "1920")))
CAMERA_HEIGHT = max(480, int(os.getenv("GATE_CAMERA_HEIGHT", "1080")))
HEARTBEAT_SECONDS = max(30.0, float(os.getenv("GATE_HEARTBEAT_SECONDS", "60")))
TRACK_TTL_SECONDS = max(2.0, float(os.getenv("GATE_TRACK_TTL_SECONDS", "6")))
EVENT_COOLDOWN_SECONDS = max(10.0, float(os.getenv("GATE_EVENT_COOLDOWN_SECONDS", "25")))
SHOW_PREVIEW = os.getenv("GATE_SHOW_PREVIEW", "true").lower() == "true"
SEND_SNAPSHOTS = os.getenv("GATE_SEND_SNAPSHOTS", "false").lower() == "true"
FLIP_VERTICAL = os.getenv("GATE_FLIP_VERTICAL", "false").lower() == "true"
PLATE_OCR_ENABLED = os.getenv("GATE_PLATE_OCR_ENABLED", "true").lower() == "true"
PLATE_OCR_MIN_CONFIDENCE = float(os.getenv("GATE_PLATE_OCR_MIN_CONFIDENCE", "0.55"))
PLATE_SCAN_INTERVAL = max(0.25, float(os.getenv("GATE_PLATE_SCAN_INTERVAL", "0.8")))
PLATE_EVENT_WAIT_SECONDS = max(2.0, float(os.getenv("GATE_PLATE_EVENT_WAIT_SECONDS", "5")))
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
    candidate = normalize_plate(value)
    if len(candidate) != 7:
        return None
    patterns = ("LLLDDDD", "LLLDLDD")
    options: list[tuple[str, int]] = []
    for pattern in patterns:
        corrected: list[str] = []
        changes = 0
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
        if possible and changes <= 1 and valid_plate(plate):
            options.append((plate, changes))
    return min(options, key=lambda item: item[1]) if options else None


@dataclass
class TrackMemory:
    first_zone: str | None = None
    last_seen: float = field(default_factory=time.monotonic)
    positions: deque[float] = field(default_factory=lambda: deque(maxlen=40))
    emitted: bool = False
    confidence: float = 0.0
    plate: str = ""
    plate_confidence: float = 0.0
    last_ocr_at: float = 0.0
    last_box: tuple[int, int, int, int] | None = None
    ocr_future: Future[tuple[str, float] | None] | None = None
    pending_crossing: str | None = None
    pending_frame: Any | None = None
    pending_since: float = 0.0

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
        self.model = YOLO(MODEL_NAME)
        self.ocr = None
        self.ocr_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gate-plate-ocr")
        if PLATE_OCR_ENABLED:
            try:
                import easyocr

                self.ocr = easyocr.Reader(["en"], gpu=False, verbose=False)
            except Exception as error:
                print(f"[Portao IA] OCR de placa indisponivel: {error}")
        self.capture = cv2.VideoCapture(camera_source())
        self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
        self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
        self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not self.capture.isOpened():
            raise RuntimeError("Não foi possível abrir a webcam. Revise GATE_CAMERA_SOURCE.")
        self.tracks: dict[int, TrackMemory] = {}
        self.state = load_json(STATE_FILE, {"occupied": False, "lastEvent": None})
        self.last_event_at = 0.0
        self.last_heartbeat_at = 0.0
        self.last_process_at = 0.0
        self.frame_width = int(self.capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        self.frame_height = int(self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    @property
    def headers(self) -> dict[str, str]:
        return {"Content-Type": "application/json", "x-gate-vision-token": DEVICE_TOKEN}

    def post(self, payload: dict[str, Any], queue_on_failure: bool = False) -> bool:
        try:
            response = requests.post(API_URL, headers=self.headers, json=payload, timeout=15)
            response.raise_for_status()
            body = response.json()
            if not body.get("success"):
                raise RuntimeError(body.get("error", "Resposta inválida do CRM"))
            return True
        except (requests.RequestException, ValueError, RuntimeError) as error:
            print(f"[Portão IA] Falha ao enviar {payload.get('action')}: {error}")
            if queue_on_failure:
                queue = load_json(QUEUE_FILE, [])
                if not any(item.get("eventId") == payload.get("eventId") for item in queue):
                    queue.append(payload)
                    atomic_json_write(QUEUE_FILE, queue[-100:])
            return False

    def flush_queue(self) -> None:
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

    def encode_snapshot(self, frame: Any) -> str | None:
        if not SEND_SNAPSHOTS:
            return None
        height, width = frame.shape[:2]
        if width > 1280:
            frame = cv2.resize(frame, (1280, int(height * 1280 / width)))
        success, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
        if not success:
            return None
        return "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii")

    def read_plate(self, frame: Any, box: tuple[int, int, int, int]) -> tuple[str, float] | None:
        if self.ocr is None:
            return None
        frame_height, frame_width = frame.shape[:2]
        x1, y1, x2, y2 = box
        box_width, box_height = x2 - x1, y2 - y1
        if box_width < 110 or box_height < 70:
            return None
        margin_x = int(box_width * .10)
        crop_x1 = max(0, x1 + margin_x)
        crop_x2 = min(frame_width, x2 - margin_x)
        crop_y1 = max(0, y1 + int(box_height * .34))
        crop_y2 = min(frame_height, y2)
        crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
        if crop.size == 0:
            return None
        scale = max(1.0, min(2.2, 760 / max(1, crop.shape[1])))
        enlarged = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
        enhanced = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(gray)
        _threshold, otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants = [otsu, enhanced]
        adaptive: np.ndarray | None = None
        best: tuple[str, float] | None = None
        for index, variant in enumerate(variants):
            try:
                readings = self.ocr.readtext(
                    variant,
                    detail=1,
                    paragraph=False,
                    allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                    decoder="greedy",
                    canvas_size=768,
                    mag_ratio=1.0,
                )
            except Exception as error:
                print(f"[Portao IA] Falha temporaria no OCR: {error}")
                return best
            for _bounds, text, confidence in readings:
                coerced = coerce_plate_candidate(str(text))
                if not coerced:
                    continue
                plate, corrections = coerced
                score = max(0.0, float(confidence) - corrections * .04)
                if score >= PLATE_OCR_MIN_CONFIDENCE and (best is None or score > best[1]):
                    best = (plate, score)
            if best:
                return best
            if index == 0:
                adaptive = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 9)
                variants.append(adaptive)
        return best

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
        if reading and reading[1] > memory.plate_confidence:
            memory.plate, memory.plate_confidence = reading
            print(f"[Portao IA] Placa lida: {memory.plate} ({memory.plate_confidence:.0%})")

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
        if not force and now - memory.last_ocr_at < PLATE_SCAN_INTERVAL:
            return
        memory.last_ocr_at = now
        memory.ocr_future = self.ocr_executor.submit(self.read_plate, frame.copy(), box)

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
        if not memory.plate and now - memory.pending_since < PLATE_EVENT_WAIT_SECONDS:
            return
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
        snapshot = self.encode_snapshot(frame)
        if snapshot:
            payload["snapshotDataUrl"] = snapshot
        sent = self.post(payload, queue_on_failure=True)
        self.state = {
            "occupied": event_type == "ENTER",
            "lastEvent": event_type,
            "currentPlate": memory.plate if event_type == "ENTER" else None,
            "updatedAt": utc_now(),
        }
        atomic_json_write(STATE_FILE, self.state)
        self.last_event_at = now
        print(f"[Portão IA] {event_type} detectado · track {track_id} · enviado={sent}")

    def heartbeat(self, measured_fps: float) -> None:
        now = time.monotonic()
        if now - self.last_heartbeat_at < HEARTBEAT_SECONDS:
            return
        self.last_heartbeat_at = now
        self.post({
            "action": "heartbeat",
            "eventId": str(uuid.uuid4()),
            "deviceId": DEVICE_ID,
            "capturedAt": utc_now(),
            "cameraName": CAMERA_NAME,
            "fps": round(measured_fps, 2),
            "model": MODEL_NAME,
            "width": self.frame_width,
            "height": self.frame_height,
        })
        self.flush_queue()

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
            now = time.monotonic()
            detections: list[tuple[int, tuple[int, int, int, int], float]] = []
            if now - self.last_process_at >= 1 / PROCESS_FPS:
                self.last_process_at = now
                result = self.model.track(frame, persist=True, classes=VEHICLE_CLASSES, conf=CONFIDENCE, verbose=False, tracker="bytetrack.yaml")[0]
                if result.boxes is not None and result.boxes.id is not None:
                    boxes = result.boxes.xyxy.cpu().tolist()
                    ids = result.boxes.id.int().cpu().tolist()
                    confidences = result.boxes.conf.cpu().tolist()
                    height = frame.shape[0]
                    for box, track_id, confidence in zip(boxes, ids, confidences):
                        x1, y1, x2, y2 = map(int, box)
                        center_y = ((y1 + y2) / 2) / height
                        memory = self.tracks.setdefault(track_id, TrackMemory())
                        self.schedule_plate_read(frame, (x1, y1, x2, y2), memory, now)
                        crossing = memory.observe(center_y, float(confidence), (x1, y1, x2, y2))
                        detections.append((track_id, (x1, y1, x2, y2), float(confidence)))
                        if crossing:
                            self.queue_crossing(crossing, track_id, memory, frame, now)
                for track_id, memory in self.tracks.items():
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
            frame_counter += 1
            elapsed = max(.001, now - fps_started)
            measured_fps = frame_counter / elapsed
            if elapsed >= 10:
                frame_counter, fps_started = 0, now
            self.heartbeat(measured_fps)
            if SHOW_PREVIEW:
                self.draw_overlay(frame, detections)
                cv2.imshow("Portao IA - Garagem do Ka", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
        self.capture.release()
        self.ocr_executor.shutdown(wait=False, cancel_futures=True)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    GateVisionAgent().run()
