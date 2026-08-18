"""Publicador WebRTC ponto a ponto para o acompanhamento privado da garagem."""

from __future__ import annotations

import asyncio
import threading
import time
from fractions import Fraction
from typing import Any

import cv2
import numpy as np
import requests
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from av import VideoFrame


class LatestFrameHub:
    def __init__(self, target_width: int = 960) -> None:
        self.target_width = max(480, min(1280, target_width))
        self._lock = threading.Lock()
        self._frame: Any | None = None

    def update(self, frame: Any) -> None:
        height, width = frame.shape[:2]
        if width > self.target_width:
            frame = cv2.resize(
                frame,
                (self.target_width, int(height * self.target_width / width)),
                interpolation=cv2.INTER_AREA,
            )
        with self._lock:
            self._frame = frame.copy()

    def current(self) -> Any:
        with self._lock:
            if self._frame is None:
                return None
            return self._frame.copy()


class GarageVideoTrack(VideoStreamTrack):
    def __init__(self, hub: LatestFrameHub, fps: float) -> None:
        super().__init__()
        self.hub = hub
        self.fps = max(2.0, min(15.0, fps))
        self.started = time.monotonic()
        self.counter = 0

    async def recv(self) -> VideoFrame:
        target = self.started + self.counter / self.fps
        self.counter += 1
        delay = target - time.monotonic()
        if delay > 0:
            await asyncio.sleep(delay)
        image = self.hub.current()
        if image is None:
            image = np.zeros((540, 960, 3), dtype=np.uint8)
        frame = VideoFrame.from_ndarray(image, format="bgr24")
        frame.pts = self.counter
        frame.time_base = Fraction(1, round(self.fps))
        return frame


class GateWebRtcPublisher:
    def __init__(
        self,
        api_url: str,
        device_id: str,
        device_token: str,
        fps: float = 8.0,
        width: int = 960,
    ) -> None:
        self.api_url = api_url
        self.device_id = device_id
        self.device_token = device_token
        self.fps = fps
        self.hub = LatestFrameHub(width)
        self.peers: dict[str, RTCPeerConnection] = {}
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._thread_main, name="gate-webrtc", daemon=True)

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "x-gate-vision-token": self.device_token,
        }

    def start(self) -> None:
        self.thread.start()
        print("[Portao IA] WebRTC privado ativado (video direto, sem audio)")

    def update_frame(self, frame: Any) -> None:
        self.hub.update(frame)

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=5)

    def _thread_main(self) -> None:
        try:
            asyncio.run(self._serve())
        except Exception as error:
            print(f"[Portao IA] Publicador WebRTC encerrado: {error}")

    async def _request_sessions(self) -> dict[str, Any]:
        def request() -> dict[str, Any]:
            response = requests.get(
                self.api_url,
                headers=self.headers,
                params={"deviceId": self.device_id},
                timeout=10,
            )
            response.raise_for_status()
            body = response.json()
            if not body.get("success"):
                raise RuntimeError(body.get("error", "Resposta invalida da sinalizacao"))
            return body.get("data") or {}

        return await asyncio.to_thread(request)

    async def _send_answer(self, session_id: str, answer: RTCSessionDescription) -> None:
        def request() -> None:
            response = requests.post(
                self.api_url,
                headers=self.headers,
                json={
                    "sessionId": session_id,
                    "deviceId": self.device_id,
                    "answer": {"type": answer.type, "sdp": answer.sdp},
                },
                timeout=12,
            )
            response.raise_for_status()
            body = response.json()
            if not body.get("success"):
                raise RuntimeError(body.get("error", "Resposta WebRTC recusada"))

        await asyncio.to_thread(request)

    @staticmethod
    async def _wait_for_ice(peer: RTCPeerConnection, timeout: float = 12.0) -> None:
        started = time.monotonic()
        while peer.iceGatheringState != "complete" and time.monotonic() - started < timeout:
            await asyncio.sleep(.1)

    async def _close_peer(self, session_id: str) -> None:
        peer = self.peers.pop(session_id, None)
        if peer is not None:
            await peer.close()

    async def _answer_offer(self, session_id: str, offer_data: dict[str, Any]) -> None:
        if session_id in self.peers:
            await self._close_peer(session_id)
        peer = RTCPeerConnection()
        self.peers[session_id] = peer

        @peer.on("connectionstatechange")
        async def connection_state_changed() -> None:
            if peer.connectionState == "connected":
                print(f"[Portao IA] Cliente conectado ao vivo: {session_id[-6:]}")
            elif peer.connectionState in ("failed", "closed"):
                await self._close_peer(session_id)

        try:
            peer.addTrack(GarageVideoTrack(self.hub, self.fps))
            await peer.setRemoteDescription(
                RTCSessionDescription(sdp=str(offer_data["sdp"]), type=str(offer_data["type"]))
            )
            answer = await peer.createAnswer()
            await peer.setLocalDescription(answer)
            await self._wait_for_ice(peer)
            local = peer.localDescription
            if local is None:
                raise RuntimeError("Resposta WebRTC local ausente")
            await self._send_answer(session_id, local)
            print(f"[Portao IA] Link ao vivo preparado: {session_id[-6:]}")
        except Exception:
            await self._close_peer(session_id)
            raise

    async def _serve(self) -> None:
        failures = 0
        while not self.stop_event.is_set():
            try:
                data = await self._request_sessions()
                failures = 0
                active_ids = {str(value) for value in data.get("activeSessionIds", [])}
                for session_id in list(self.peers):
                    if session_id not in active_ids:
                        await self._close_peer(session_id)
                for session in data.get("sessions", []):
                    session_id = str(session.get("id") or "")
                    offer = session.get("offer")
                    if session_id and isinstance(offer, dict):
                        try:
                            await self._answer_offer(session_id, offer)
                        except Exception as error:
                            print(f"[Portao IA] Falha ao aceitar visualizacao ao vivo: {error}")
            except Exception as error:
                failures += 1
                if failures == 1 or failures % 10 == 0:
                    print(f"[Portao IA] Sinalizacao WebRTC temporariamente indisponivel: {error}")
            await asyncio.sleep(1.5 if failures == 0 else min(15, failures * 2))
        for session_id in list(self.peers):
            await self._close_peer(session_id)
