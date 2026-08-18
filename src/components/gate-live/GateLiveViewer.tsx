"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CarFront, Clock3, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

type LiveSession = {
  id: string;
  status: "ACTIVE" | "ENDED" | "EXPIRED" | string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  plate: string;
  vehicle: string | null;
  clientName: string;
  service: string;
  answer: RTCSessionDescriptionInit | null;
};

type ConnectionState = "loading" | "connecting" | "live" | "ended" | "error";

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function waitForIceGathering(peer: RTCPeerConnection, timeoutMs = 12_000) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, timeoutMs);
    function done() {
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", changed);
      resolve();
    }
    function changed() {
      if (peer.iceGatheringState === "complete") done();
    }
    peer.addEventListener("icegatheringstatechange", changed);
  });
}

function elapsedLabel(startedAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min em atendimento`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min em atendimento`;
}

export function GateLiveViewer({ token }: { token: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const pollRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [state, setState] = useState<ConnectionState>("loading");
  const [message, setMessage] = useState("Preparando seu acompanhamento privado…");
  const [now, setNow] = useState(Date.now());

  const endpoint = `/api/gate-live/client/${encodeURIComponent(token)}`;
  const active = session?.status === "ACTIVE";

  const stop = useCallback(() => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const loadSession = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store", headers: { Accept: "application/json" } });
    const body = await response.json().catch(() => null) as { success?: boolean; data?: LiveSession; error?: string } | null;
    if (!response.ok || !body?.success || !body.data) throw new Error(body?.error || "Não foi possível abrir o acompanhamento");
    if (mountedRef.current) setSession(body.data);
    return body.data;
  }, [endpoint]);

  const connect = useCallback(async () => {
    stop();
    setState("connecting");
    setMessage("Conectando com a câmera da garagem…");
    try {
      const current = await loadSession();
      if (current.status !== "ACTIVE") {
        setState("ended");
        setMessage("A transmissão deste atendimento foi encerrada.");
        return;
      }
      const peer = new RTCPeerConnection({ iceServers: STUN_SERVERS, iceCandidatePoolSize: 4 });
      peerRef.current = peer;
      peer.addTransceiver("video", { direction: "recvonly" });
      peer.ontrack = (event) => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = event.streams[0] || new MediaStream([event.track]);
        void videoRef.current.play().catch(() => undefined);
      };
      peer.onconnectionstatechange = () => {
        if (!mountedRef.current) return;
        if (peer.connectionState === "connected") {
          setState("live");
          setMessage("Ao vivo agora");
        } else if (["failed", "disconnected"].includes(peer.connectionState)) {
          setState("error");
          setMessage("A conexão com a câmera foi interrompida. Tente reconectar.");
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const local = peer.localDescription;
      if (!local) throw new Error("A conexão segura não pôde ser preparada");
      // Alguns navegadores Chromium anunciam candidatos mDNS com componente 0.
      // O RFC ICE e o aiortc esperam componente 1 para RTP com rtcp-mux.
      const compatibleSdp = local.sdp.replace(/^(a=candidate:\S+)\s+0\s+/gm, "$1 1 ");
      const offerResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: local.type, sdp: compatibleSdp }),
      });
      if (!offerResponse.ok) {
        const body = await offerResponse.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "A câmera não aceitou a conexão");
      }

      const started = Date.now();
      const poll = async () => {
        if (!mountedRef.current || peerRef.current !== peer) return;
        try {
          const latest = await loadSession();
          if (latest.status !== "ACTIVE") {
            stop();
            setState("ended");
            setMessage("Atendimento concluído. A transmissão foi encerrada com segurança.");
            return;
          }
          if (latest.answer && !peer.currentRemoteDescription) {
            await peer.setRemoteDescription(latest.answer);
          }
          if (Date.now() - started > 35_000 && !peer.currentRemoteDescription) {
            throw new Error("A câmera está online, mas demorou para responder");
          }
          pollRef.current = window.setTimeout(poll, peer.currentRemoteDescription ? 4_000 : 1_200);
        } catch (error) {
          if (!mountedRef.current) return;
          setState("error");
          setMessage(error instanceof Error ? error.message : "Falha temporária na transmissão");
        }
      };
      await poll();
    } catch (error) {
      stop();
      if (!mountedRef.current) return;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível iniciar a transmissão");
    }
  }, [loadSession, stop, endpoint]);

  useEffect(() => {
    mountedRef.current = true;
    void connect();
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(clock);
      stop();
    };
  }, [connect, stop]);

  return (
    <main className="min-h-[100dvh] bg-[#07110d] text-white">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col">
        <header className="flex items-center justify-between px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-amber-300/20 bg-[#13241c] shadow-lg shadow-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-garagem-do-ka.png" alt="Garagem do Ka" className="h-full w-full object-contain p-1.5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300/70">Acompanhamento exclusivo</p>
              <h1 className="font-serif text-xl text-amber-100">Garagem do Ka</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200">
            <LockKeyhole className="h-3.5 w-3.5" /> Privado
          </div>
        </header>

        <section className="relative mx-3 overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl shadow-black/50 sm:mx-5">
          <div className="relative aspect-video bg-[#101713]">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            {state !== "live" && (
              <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(35,67,51,.72),rgba(5,10,8,.96))] p-8 text-center">
                <div>
                  {state === "ended" ? (
                    <Sparkles className="mx-auto mb-4 h-10 w-10 text-amber-300" />
                  ) : state === "error" ? (
                    <Camera className="mx-auto mb-4 h-10 w-10 text-amber-300" />
                  ) : (
                    <LoaderCircle className="mx-auto mb-4 h-10 w-10 animate-spin text-amber-300" />
                  )}
                  <p className="mx-auto max-w-sm text-sm leading-6 text-slate-200">{message}</p>
                  {state === "error" && (
                    <button onClick={() => void connect()} className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-bold text-[#172018]">
                      <RefreshCw className="h-4 w-4" /> Reconectar
                    </button>
                  )}
                </div>
              </div>
            )}
            {state === "live" && (
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-bold tracking-wide backdrop-blur-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> AO VIVO
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
            <p className="absolute bottom-3 left-4 right-4 text-xs text-white/70">Transmissão direta e sem áudio</p>
          </div>
        </section>

        <section className="grid gap-3 px-4 py-5 sm:grid-cols-2 sm:px-5">
          <div className="rounded-3xl border border-white/[.08] bg-white/[.045] p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400">Olá, {session?.clientName || "cliente"}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Seu veículo está em boas mãos</h2>
              </div>
              <div className="rounded-2xl bg-amber-300/10 p-2.5 text-amber-300"><CarFront className="h-5 w-5" /></div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-400">Veículo</span><strong className="text-right font-medium">{session?.vehicle || "Veículo em atendimento"}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-slate-400">Placa</span><strong className="font-mono tracking-wider text-amber-200">{session?.plate || "—"}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-slate-400">Serviço</span><strong className="text-right font-medium">{session?.service || "—"}</strong></div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/[.08] bg-white/[.045] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-400/10 p-2.5 text-emerald-300"><Clock3 className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-slate-400">Status do atendimento</p>
                <p className="mt-0.5 font-semibold text-emerald-200">{active ? "Lavagem em andamento" : "Atendimento finalizado"}</p>
              </div>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 ${active ? "w-1/2 animate-pulse" : "w-full"}`} />
            </div>
            <p className="mt-3 text-xs text-slate-400">{session ? (active ? elapsedLabel(session.startedAt, now) : "Transmissão encerrada automaticamente") : "Aguardando dados do atendimento"}</p>
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-black/20 p-3 text-xs leading-5 text-slate-400">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              Este link funciona somente durante o seu atendimento e expira automaticamente na saída do veículo.
            </div>
          </div>
        </section>

        <footer className="mt-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-[11px] text-slate-600">
          Vídeo direto da garagem para o seu aparelho · Garagem do Ka
        </footer>
      </div>
    </main>
  );
}
