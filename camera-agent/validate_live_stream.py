"""Valida uma sessão privada WebRTC e confirma o recebimento de vídeo real."""

from __future__ import annotations

import argparse
import asyncio
import time

import requests
from aiortc import RTCPeerConnection, RTCSessionDescription


async def wait_for_ice(peer: RTCPeerConnection, timeout: float = 12.0) -> None:
    started = time.monotonic()
    while peer.iceGatheringState != "complete" and time.monotonic() - started < timeout:
        await asyncio.sleep(0.1)


async def validate(url: str, timeout: float) -> None:
    page_url = url.rstrip("/")
    token = page_url.rsplit("/", 1)[-1]
    base_url = page_url.split("/acompanhar/", 1)[0]
    api_url = f"{base_url}/api/gate-live/client/{token}"
    metadata = requests.get(api_url, timeout=15).json()
    if not metadata.get("success") or metadata.get("data", {}).get("status") != "ACTIVE":
        raise RuntimeError(f"Sessão ao vivo indisponível: {metadata}")

    peer = RTCPeerConnection()
    track_ready: asyncio.Future = asyncio.get_running_loop().create_future()

    @peer.on("track")
    def on_track(track) -> None:
        if track.kind == "video" and not track_ready.done():
            track_ready.set_result(track)

    try:
        peer.addTransceiver("video", direction="recvonly")
        await peer.setLocalDescription(await peer.createOffer())
        await wait_for_ice(peer)
        local = peer.localDescription
        if local is None:
            raise RuntimeError("Oferta WebRTC não foi criada")
        sent = requests.post(
            api_url,
            json={"type": local.type, "sdp": local.sdp},
            timeout=15,
        ).json()
        if not sent.get("success"):
            raise RuntimeError(f"Oferta recusada: {sent}")

        answer = None
        started = time.monotonic()
        while time.monotonic() - started < timeout:
            current = requests.get(api_url, timeout=15).json()
            answer = current.get("data", {}).get("answer")
            if isinstance(answer, dict):
                break
            await asyncio.sleep(0.5)
        if not isinstance(answer, dict):
            raise TimeoutError("A câmera não respondeu à sinalização WebRTC")

        await peer.setRemoteDescription(
            RTCSessionDescription(type=str(answer["type"]), sdp=str(answer["sdp"]))
        )
        track = await asyncio.wait_for(track_ready, timeout=timeout)
        frame = await asyncio.wait_for(track.recv(), timeout=timeout)
        image = frame.to_ndarray(format="bgr24")
        if image.size == 0 or float(image.std()) < 2:
            raise RuntimeError("O WebRTC conectou, mas não recebeu uma imagem válida")
        data = metadata["data"]
        print(
            "LIVE_OK "
            f"session={str(data.get('id', ''))[-6:]} "
            f"plate={data.get('plate')} "
            f"vehicle={data.get('vehicle')} "
            f"frame={image.shape[1]}x{image.shape[0]} "
            f"variation={float(image.std()):.1f}"
        )
    finally:
        await peer.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--timeout", type=float, default=25.0)
    args = parser.parse_args()
    asyncio.run(validate(args.url, max(5.0, args.timeout)))


if __name__ == "__main__":
    main()
