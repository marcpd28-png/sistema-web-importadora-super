"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, X } from "lucide-react";

interface Props {
  disabled: boolean;
  onRecorded: (file: File) => void;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
}

export function AudioRecorder({ disabled, onRecorded, onBusyChange, onError }: Props) {
  const [phase, setPhase] = useState<"idle" | "permission" | "recording" | "stopping">("idle");
  const [seconds, setSeconds] = useState(0);
  const session = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  useEffect(() => () => {
    session.current++;
    if (recorder.current?.state === "recording") recorder.current.stop();
    release();
  }, []);

  function cancel() {
    session.current++;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    release();
    setPhase("idle");
    onBusyChange(false);
  }

  function stop() {
    if (recorder.current?.state !== "recording") return;
    setPhase("stopping");
    recorder.current.stop();
    release();
  }

  async function start() {
    if (disabled || phase !== "idle") return;
    onError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("No se puede grabar aquí. Abre el sitio por HTTPS en un navegador compatible con micrófono.");
      return;
    }
    const id = ++session.current;
    setPhase("permission");
    onBusyChange(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session.current !== id) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const mimeType = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"].find((mime) => MediaRecorder.isTypeSupported(mime));
      if (!mimeType) throw new Error("unsupported");
      const recording = new MediaRecorder(media, { mimeType, audioBitsPerSecond: 64000 });
      recorder.current = recording;
      const chunks: Blob[] = [];
      let bytes = 0;
      recording.ondataavailable = (event) => {
        if (session.current !== id || !event.data.size) return;
        chunks.push(event.data);
        bytes += event.data.size;
        if (bytes >= 15 * 1024 * 1024 && recording.state === "recording") stop();
      };
      recording.onerror = () => {
        if (session.current !== id) return;
        cancel();
        onError("Se interrumpió la grabación. Revisa el micrófono e intenta nuevamente.");
      };
      recording.onstop = () => {
        if (session.current !== id) return;
        release();
        recorder.current = null;
        setPhase("idle");
        onBusyChange(false);
        const type = recording.mimeType.split(";")[0].trim();
        const blob = new Blob(chunks, { type });
        if (!blob.size) { onError("No se capturó audio. Intenta grabar nuevamente."); return; }
        const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
        onRecorded(new File([blob], `audio-${Date.now()}.${extension}`, { type }));
      };
      recording.start(1000);
      setSeconds(0);
      setPhase("recording");
      const started = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 300) stop();
      }, 250);
    } catch (error) {
      if (session.current !== id) return;
      cancel();
      const name = error instanceof Error ? error.name : "";
      onError(name === "NotAllowedError" ? "Permite el acceso al micrófono en tu navegador para grabar audio."
        : name === "NotFoundError" ? "No se encontró un micrófono conectado."
        : "No se pudo iniciar la grabación. Revisa que el micrófono esté disponible y usa un navegador actualizado.");
    }
  }

  if (phase === "idle") return <button type="button" className="icon-btn" aria-label="Grabar audio" title="Grabar audio" disabled={disabled} onClick={() => void start()}><Mic size={18} /></button>;
  return <div className="chat-recording-controls">
    <span role="status">{phase === "permission" ? "Esperando micrófono…" : phase === "stopping" ? "Preparando audio…" : `Grabando ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / 5:00`}</span>
    {phase === "recording" ? <button type="button" className="icon-btn" aria-label="Detener grabación" title="Detener y escuchar" onClick={stop}><Square size={18} /></button> : <Loader2 size={18} className="animate-spin" />}
    <button type="button" className="icon-btn" aria-label="Descartar grabación" title="Descartar grabación" onClick={cancel}><X size={18} /></button>
  </div>;
}
