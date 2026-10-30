"use client";

// In-memory voice recorder for "Shadow this line" (T3.11).
// - The take is a Blob behind an object URL, local to this tab. Nothing is
//   uploaded or stored; the URL is revoked on re-record, discard and unmount.
// - The mic stream is opened per take and its tracks are stopped as soon as the
//   take ends (and on unmount), so the browser's mic indicator goes away.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_TAKE_MS,
  browserRecorderEnv,
  classifyMicError,
  pickRecorderMime,
  recorderSupported,
  type RecorderStatus,
} from "./recorder";

export interface VoiceRecorder {
  status: RecorderStatus;
  /** Object URL of the latest take, or null. */
  url: string | null;
  elapsedMs: number;
  start: () => Promise<void>;
  stop: () => void;
  discard: () => void;
}

export function useVoiceRecorder(): VoiceRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    if (capRef.current) clearTimeout(capRef.current);
    timerRef.current = null;
    capRef.current = null;
  }, []);

  const revoke = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop(); // onstop builds the take
    else releaseStream();
  }, [releaseStream]);

  const start = useCallback(async () => {
    const env = browserRecorderEnv();
    if (!recorderSupported(env)) {
      setStatus("unsupported");
      return;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") return;

    setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (aliveRef.current) setStatus(classifyMicError(err));
      return;
    }
    if (!aliveRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;

    let rec: MediaRecorder;
    try {
      const mimeType = pickRecorderMime(
        typeof MediaRecorder.isTypeSupported === "function" ? (t) => MediaRecorder.isTypeSupported(t) : undefined,
      );
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      releaseStream();
      setStatus(classifyMicError(err));
      return;
    }

    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      releaseStream();
      recorderRef.current = null;
      if (!aliveRef.current) return;
      if (chunks.length === 0) {
        setStatus(urlRef.current ? "ready" : "idle");
        return;
      }
      const blob = new Blob(chunks, { type: rec.mimeType || chunks[0]!.type });
      revoke();
      const next = URL.createObjectURL(blob);
      urlRef.current = next;
      setUrl(next);
      setStatus("ready");
    };
    rec.onerror = () => {
      releaseStream();
      if (aliveRef.current) setStatus("error");
    };

    recorderRef.current = rec;
    const startedAt = Date.now();
    setElapsedMs(0);
    rec.start();
    setStatus("recording");
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    capRef.current = setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
    }, MAX_TAKE_MS);
  }, [releaseStream, revoke]);

  const discard = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.ondataavailable = null;
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        // already stopped
      }
    }
    recorderRef.current = null;
    releaseStream();
    revoke();
    setUrl(null);
    setElapsedMs(0);
    setStatus((s) => (s === "denied" || s === "unsupported" || s === "no-device" ? s : "idle"));
  }, [releaseStream, revoke]);

  // Unmount (card change, mode change, leaving the session): stop everything.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.ondataavailable = null;
        rec.onstop = null;
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
      recorderRef.current = null;
      releaseStream();
      revoke();
    };
  }, [releaseStream, revoke]);

  return { status, url, elapsedMs, start, stop, discard };
}
