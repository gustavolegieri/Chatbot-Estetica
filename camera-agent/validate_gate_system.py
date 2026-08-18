"""Validação offline do Portão IA: OCR, direção e webcam, sem chamar a Vercel."""

from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from easyocr import Reader
from ultralytics import YOLO

from gate_vision_agent import (
    CAMERA_HEIGHT,
    CAMERA_WIDTH,
    CONFIDENCE,
    MODEL_NAME,
    TrackMemory,
    VEHICLE_CLASSES,
    GateVisionAgent,
    coerce_plate_candidate,
    resolve_plate_against_expected,
)


@dataclass(frozen=True)
class OcrScenario:
    name: str
    plate: str
    angle: float = 0
    perspective: float = 0
    brightness: float = 1
    blur: int = 0
    noise: float = 0
    scale: float = 1


OCR_SCENARIOS = [
    OcrScenario("mercosul_frontal", "BRA2E19"),
    OcrScenario("antiga_frontal", "ABC1234"),
    OcrScenario("inclinada_esquerda_8", "BRA2E19", angle=-8),
    OcrScenario("inclinada_direita_8", "BRA2E19", angle=8),
    OcrScenario("inclinada_esquerda_15", "BRA2E19", angle=-15),
    OcrScenario("inclinada_direita_15", "BRA2E19", angle=15),
    OcrScenario("perspectiva_esquerda", "BRA2E19", perspective=-0.13),
    OcrScenario("perspectiva_direita", "BRA2E19", perspective=0.13),
    OcrScenario("pouca_luz", "BRA2E19", brightness=0.45),
    OcrScenario("muita_luz", "BRA2E19", brightness=1.55),
    OcrScenario("desfoque_movimento", "BRA2E19", blur=7),
    OcrScenario("ruido_camera", "BRA2E19", noise=18),
    OcrScenario("distante", "BRA2E19", scale=0.55),
    OcrScenario("rampa_combinado", "BRA2E19", angle=10, perspective=0.08, brightness=0.62, blur=3, scale=0.72),
]


TRACK_SCENARIOS: list[tuple[str, list[float], str | None]] = [
    ("entrada_normal", [0.28, 0.38, 0.49, 0.56, 0.61, 0.70], "ENTER"),
    ("entrada_lenta_na_rampa", [0.30, 0.40, 0.50, 0.54, 0.56, 0.575, 0.59, 0.61, 0.65], "ENTER"),
    ("entrada_rapida", [0.31, 0.66], "ENTER"),
    ("entrada_com_pausa", [0.32, 0.48, 0.55, 0.55, 0.55, 0.62, 0.68], "ENTER"),
    ("saida_normal", [0.72, 0.65, 0.61, 0.57, 0.51, 0.39], "EXIT"),
    ("saida_rapida", [0.70, 0.48], "EXIT"),
    ("fora_sem_entrar", [0.30, 0.41, 0.50, 0.54, 0.50], None),
    ("dentro_sem_sair", [0.76, 0.69, 0.64, 0.62, 0.65], None),
    ("oscilacao_na_risca", [0.56, 0.58, 0.57, 0.59, 0.575, 0.585], None),
    ("aproxima_e_desiste", [0.30, 0.45, 0.54, 0.50, 0.38], None),
]

NEGATIVE_PLATE_CANDIDATES = ["BRASIL1", "COROLLA", "PORTAO1", "GARAGEM", "1234567", "AAAAAAA"]
NOISY_VALID_PLATE_CANDIDATES = ["FFEG4B58", "FEG4B58B"]


def plate_canvas(text: str) -> np.ndarray:
    image = np.full((126, 440, 3), 245, dtype=np.uint8)
    cv2.rectangle(image, (0, 0), (439, 125), (35, 35, 35), 4)
    cv2.rectangle(image, (4, 4), (435, 25), (185, 78, 15), -1)
    cv2.putText(image, "BRASIL", (177, 20), cv2.FONT_HERSHEY_SIMPLEX, .42, (255, 255, 255), 1, cv2.LINE_AA)
    font = cv2.FONT_HERSHEY_DUPLEX
    scale, thickness = 2.35, 4
    size = cv2.getTextSize(text, font, scale, thickness)[0]
    origin = ((image.shape[1] - size[0]) // 2, 96)
    cv2.putText(image, text, origin, font, scale, (18, 18, 18), thickness, cv2.LINE_AA)
    return image


def transform_plate(image: np.ndarray, scenario: OcrScenario) -> np.ndarray:
    height, width = image.shape[:2]
    transformed = image.copy()
    if scenario.perspective:
        shift = int(abs(scenario.perspective) * height)
        source = np.float32([[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]])
        if scenario.perspective > 0:
            target = np.float32([[shift, 0], [width - 1, shift], [0, height - 1], [width - 1 - shift, height - 1 - shift]])
        else:
            target = np.float32([[0, shift], [width - 1 - shift, 0], [shift, height - 1 - shift], [width - 1, height - 1]])
        transformed = cv2.warpPerspective(transformed, cv2.getPerspectiveTransform(source, target), (width, height), borderValue=(230, 230, 230))
    if scenario.angle:
        matrix = cv2.getRotationMatrix2D((width / 2, height / 2), scenario.angle, 1)
        transformed = cv2.warpAffine(transformed, matrix, (width, height), borderValue=(210, 210, 210))
    if scenario.scale != 1:
        transformed = cv2.resize(transformed, None, fx=scenario.scale, fy=scenario.scale, interpolation=cv2.INTER_AREA)
    transformed = np.clip(transformed.astype(np.float32) * scenario.brightness, 0, 255).astype(np.uint8)
    if scenario.blur:
        kernel = scenario.blur if scenario.blur % 2 else scenario.blur + 1
        transformed = cv2.GaussianBlur(transformed, (kernel, kernel), 0)
    if scenario.noise:
        noise = np.random.default_rng(42).normal(0, scenario.noise, transformed.shape).astype(np.float32)
        transformed = np.clip(transformed.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    return transformed


def vehicle_frame(scenario: OcrScenario) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    frame = np.full((720, 1280, 3), (72, 75, 78), dtype=np.uint8)
    box = (190, 95, 1090, 680)
    cv2.rectangle(frame, (box[0], box[1]), (box[2], box[3]), (45, 47, 50), -1)
    cv2.ellipse(frame, (640, 390), (395, 250), 0, 180, 360, (84, 87, 92), -1)
    plate = transform_plate(plate_canvas(scenario.plate), scenario)
    ph, pw = plate.shape[:2]
    x1, y1 = 640 - pw // 2, 525 - ph // 2
    x2, y2 = x1 + pw, y1 + ph
    frame[max(0, y1):min(720, y2), max(0, x1):min(1280, x2)] = plate[
        max(0, -y1):ph - max(0, y2 - 720),
        max(0, -x1):pw - max(0, x2 - 1280),
    ]
    return frame, box


def run_ocr_validation(reader: Reader) -> list[dict[str, Any]]:
    agent = object.__new__(GateVisionAgent)
    agent.ocr = reader
    results = []
    for scenario in OCR_SCENARIOS:
        frame, box = vehicle_frame(scenario)
        started = time.perf_counter()
        reading = agent.read_plate(frame, box)
        detected = reading[0] if reading else None
        confidence = reading[1] if reading else 0
        results.append({
            "name": scenario.name,
            "expected": scenario.plate,
            "detected": detected,
            "confidence": round(confidence, 3),
            "passed": detected == scenario.plate,
            "milliseconds": round((time.perf_counter() - started) * 1000),
        })
    return results


def run_tracking_validation() -> list[dict[str, Any]]:
    results = []
    for name, positions, expected in TRACK_SCENARIOS:
        memory = TrackMemory()
        detected = None
        for position in positions:
            detected = memory.observe(position, .92, (100, 100, 500, 500)) or detected
        results.append({"name": name, "expected": expected, "detected": detected, "passed": detected == expected})
    return results


def run_box_stability_validation() -> dict[str, Any]:
    jitter_boxes = [
        (520, 410, 1215, 945),
        (538, 393, 1192, 958),
        (508, 425, 1230, 925),
        (532, 400, 1198, 952),
        (515, 418, 1222, 934),
        (536, 397, 1195, 956),
        (510, 422, 1228, 929),
        (530, 402, 1201, 950),
    ]
    memory = TrackMemory()
    stable_boxes = []
    for index, box in enumerate(jitter_boxes):
        stable = memory.stabilize_box(box, 100 + index * .2, 1920, 1080)
        memory.observe(((stable[1] + stable[3]) / 2) / 1080, .92, stable)
        stable_boxes.append(stable)
    raw_jitter = float(np.std(np.array(jitter_boxes), axis=0).mean())
    stable_jitter = float(np.std(np.array(stable_boxes), axis=0).mean())
    reduction = 1 - stable_jitter / raw_jitter

    agent = object.__new__(GateVisionAgent)
    agent.tracks = {1: memory}
    agent.track_aliases = {}
    reassociated = agent.canonical_track_id(17, (525, 405, 1210, 946), 101.7) == 1

    moving = TrackMemory()
    centers = []
    for index, center_x in enumerate(range(400, 1001, 60)):
        stable = moving.stabilize_box((center_x - 180, 350, center_x + 180, 700), 200 + index * .2, 1920, 1080)
        centers.append((stable[0] + stable[2]) / 2)
    follows_motion = all(second >= first for first, second in zip(centers, centers[1:])) and centers[-1] >= 900
    return {
        "passed": reduction >= .75 and reassociated and follows_motion,
        "jitterReduction": round(reduction, 3),
        "sameCarAfterYoloIdChange": reassociated,
        "followsRealMotion": follows_motion,
    }


def run_false_positive_validation() -> list[dict[str, Any]]:
    return [
        {"candidate": candidate, "detected": coerce_plate_candidate(candidate), "passed": coerce_plate_candidate(candidate) is None}
        for candidate in NEGATIVE_PLATE_CANDIDATES
    ]


def run_noisy_candidate_validation() -> list[dict[str, Any]]:
    return [
        {"candidate": candidate, "detected": coerce_plate_candidate(candidate), "passed": coerce_plate_candidate(candidate)[0] == "FEG4B58" if coerce_plate_candidate(candidate) else False}
        for candidate in NOISY_VALID_PLATE_CANDIDATES
    ]


def run_async_ocr_validation() -> dict[str, Any]:
    agent = object.__new__(GateVisionAgent)
    agent.ocr = object()
    agent.ocr_executor = ThreadPoolExecutor(max_workers=1)
    emitted: list[tuple[str, str]] = []

    def slow_read(_crop: Any) -> tuple[str, float]:
        time.sleep(.25)
        return "BRA2E19", .91

    agent.read_plate_region = slow_read
    agent.emit_event = lambda crossing, track_id, _memory, _frame: emitted.append((crossing, str(track_id)))
    memory = TrackMemory(last_box=(0, 0, 120, 80))
    frame = np.zeros((100, 140, 3), dtype=np.uint8)
    started = time.perf_counter()
    agent.queue_crossing("ENTER", 7, memory, frame, time.monotonic())
    scheduling_ms = (time.perf_counter() - started) * 1000
    pending_before_ocr = not emitted and memory.pending_crossing == "ENTER"
    time.sleep(.65)
    agent.flush_pending_crossing(7, memory, time.monotonic())
    time.sleep(.32)
    agent.flush_pending_crossing(7, memory, time.monotonic())
    agent.ocr_executor.shutdown(wait=True)
    passed = scheduling_ms < 100 and pending_before_ocr and emitted == [("ENTER", "7")] and memory.plate == "BRA2E19"
    return {
        "passed": passed,
        "schedulingMilliseconds": round(scheduling_ms, 2),
        "pendingBeforeOcr": pending_before_ocr,
        "emitted": emitted,
        "plate": memory.plate,
    }


def run_plate_consensus_validation() -> dict[str, Any]:
    memory = TrackMemory()
    wrong_rejected = not memory.add_plate_read(("FEG4B59", .74)) and not memory.plate
    first_correct_waits = not memory.add_plate_read(("FEG4B58", .83)) and not memory.plate
    second_correct_confirms = memory.add_plate_read(("FEG4B58", .87)) and memory.plate == "FEG4B58"

    high = TrackMemory()
    high.add_plate_read(("BRA2E19", .93))
    high_confidence_fallback = high.add_plate_read(None, allow_single=True) and high.plate == "BRA2E19"
    agenda_correction = resolve_plate_against_expected("TEG4B58", {"FEG4B58", "BRA2E19"}) == "FEG4B58"
    ambiguous_not_changed = resolve_plate_against_expected("TEG4B58", {"FEG4B58", "GEG4B58"}) == "TEG4B58"
    return {
        "passed": wrong_rejected and first_correct_waits and second_correct_confirms and high_confidence_fallback and agenda_correction and ambiguous_not_changed,
        "wrongSingleRejected": wrong_rejected,
        "correctRequiredConsensus": first_correct_waits and second_correct_confirms,
        "highConfidenceFallback": high_confidence_fallback,
        "agendaCorrection": agenda_correction,
        "ambiguousPlateNotChanged": ambiguous_not_changed,
        "plate": memory.plate,
    }


def run_camera_validation(reader: Reader, seconds: float) -> dict[str, Any]:
    capture = cv2.VideoCapture(0)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
    capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not capture.isOpened():
        return {"opened": False, "error": "camera unavailable"}
    model = YOLO(MODEL_NAME)
    agent = object.__new__(GateVisionAgent)
    agent.ocr = reader
    frames = detections = plate_attempts = 0
    plates: list[dict[str, Any]] = []
    width = height = 0
    started = time.monotonic()
    while time.monotonic() - started < seconds:
        ok, frame = capture.read()
        if not ok:
            continue
        frames += 1
        height, width = frame.shape[:2]
        if frames % 5:
            continue
        result = model.predict(frame, classes=VEHICLE_CLASSES, conf=CONFIDENCE, verbose=False)[0]
        if result.boxes is None:
            continue
        for raw_box, raw_confidence in zip(result.boxes.xyxy.cpu().tolist(), result.boxes.conf.cpu().tolist()):
            detections += 1
            box = tuple(map(int, raw_box))
            plate_attempts += 1
            reading = agent.read_plate(frame, box)
            if reading:
                plates.append({"plate": reading[0], "confidence": round(reading[1], 3), "vehicleConfidence": round(float(raw_confidence), 3)})
    capture.release()
    return {
        "opened": True,
        "resolution": f"{width}x{height}",
        "seconds": seconds,
        "frames": frames,
        "vehicleDetections": detections,
        "plateAttempts": plate_attempts,
        "plates": plates,
        "note": "No server event was sent.",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--camera-seconds", type=float, default=5)
    parser.add_argument("--skip-camera", action="store_true")
    args = parser.parse_args()
    reader = Reader(["en"], gpu=False, verbose=False)
    ocr = run_ocr_validation(reader)
    tracking = run_tracking_validation()
    false_positives = run_false_positive_validation()
    noisy_candidates = run_noisy_candidate_validation()
    async_ocr = run_async_ocr_validation()
    plate_consensus = run_plate_consensus_validation()
    box_stability = run_box_stability_validation()
    camera = None if args.skip_camera else run_camera_validation(reader, max(1, args.camera_seconds))
    report = {
        "ocr": {"passed": sum(item["passed"] for item in ocr), "total": len(ocr), "scenarios": ocr},
        "tracking": {"passed": sum(item["passed"] for item in tracking), "total": len(tracking), "scenarios": tracking},
        "falsePositives": {"passed": sum(item["passed"] for item in false_positives), "total": len(false_positives), "scenarios": false_positives},
        "noisyPlateCandidates": {"passed": sum(item["passed"] for item in noisy_candidates), "total": len(noisy_candidates), "scenarios": noisy_candidates},
        "asyncOcr": async_ocr,
        "plateConsensus": plate_consensus,
        "boxStability": box_stability,
        "camera": camera,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(item["passed"] for item in ocr + tracking + false_positives + noisy_candidates) and async_ocr["passed"] and plate_consensus["passed"] and box_stability["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
