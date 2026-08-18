"""Teste local do WebRTC sem usar a webcam e sem disparar mensagens."""

from __future__ import annotations

import argparse
import os
import time

import cv2
import numpy as np
from dotenv import load_dotenv

from webrtc_live import GateWebRtcPublisher


def frame_at(elapsed: float) -> np.ndarray:
    height, width = 540, 960
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = (16, 29, 23)
    for x in range(0, width, 80):
        cv2.line(frame, (x, 0), (x, height), (26, 48, 38), 1)
    for y in range(0, height, 60):
        cv2.line(frame, (0, y), (width, y), (26, 48, 38), 1)
    position = int((width - 180) * ((elapsed % 8) / 8)) + 90
    cv2.rectangle(frame, (position - 78, 300), (position + 78, 390), (45, 70, 58), -1)
    cv2.circle(frame, (position - 48, 398), 18, (10, 14, 12), -1)
    cv2.circle(frame, (position + 48, 398), 18, (10, 14, 12), -1)
    cv2.putText(frame, "GARAGEM DO KA", (48, 78), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (65, 210, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, "TRANSMISSAO WEBRTC DE TESTE", (48, 120), cv2.FONT_HERSHEY_SIMPLEX, .62, (230, 235, 232), 1, cv2.LINE_AA)
    cv2.putText(frame, f"Ao vivo  {elapsed:05.1f}s", (48, 490), cv2.FONT_HERSHEY_SIMPLEX, .7, (110, 230, 155), 2, cv2.LINE_AA)
    return frame


def main() -> None:
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=int, default=90)
    parser.add_argument("--device-id", default="portao-teste-codex")
    parser.add_argument("--api-url", default="http://localhost:3000/api/gate-live/device")
    args = parser.parse_args()
    token = os.getenv("GATE_DEVICE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("GATE_DEVICE_TOKEN ausente")
    publisher = GateWebRtcPublisher(args.api_url, args.device_id, token, fps=8, width=960)
    publisher.start()
    started = time.monotonic()
    try:
        while time.monotonic() - started < args.seconds:
            publisher.update_frame(frame_at(time.monotonic() - started))
            time.sleep(1 / 20)
    finally:
        publisher.stop()


if __name__ == "__main__":
    main()
