"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { splitSentence } from "./cloze";
import { ReviewDetails } from "./ReviewDetails";
import { ReviewEmbed, type ReviewEmbedHandle } from "./ReviewEmbed";
import type { TargetWord } from "./ReviewCard";
import { browserRecorderEnv, formatTakeTime, MAX_TAKE_MS, recorderMessage, recorderSupported } from "./recorder";
import { useVoiceRecorder, type VoiceRecorder } from "./useVoiceRecorder";
import { LoopIcon, MicIcon, PlayIcon, StopIcon } from "./icons";

export interface ShadowCardProps {
  clip: { sourceId: string; startMs: number; endMs: number };
  sentence: { text: string; translation: string | null };
  target: TargetWord | null;
  source: { channel: string; videoTitle: string; thumbnailUrl: string };
  notes: string | null;
  onEditNotes?: (notes: string) => void;
  /** Start the clip as soon as it's ready (default true). */
  autoplay?: boolean;
  /** Inject a recorder (stories/tests). Defaults to the in-memory MediaRecorder hook. */
  recorder?: VoiceRecorder;
}

type AbPhase = "idle" | "clip" | "take";

/**
 * "Shadow this line" (T3.11): loop the clip, record yourself, compare A/B.
 * The take never leaves the tab (Blob + object URL, revoked on exit) and there
 * is deliberately no pronunciation score — the evidence is for the practice.
 */
export function ShadowCard({ clip, sentence, target, source, notes, onEditNotes, autoplay = true, recorder }: ShadowCardProps) {
  const live = useVoiceRecorder();
  const rec = recorder ?? live;

  const embedRef = useRef<ReviewEmbedHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loop, setLoop] = useState(true);
  const [ab, setAb] = useState<AbPhase>("idle");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!recorder) setSupported(recorderSupported(browserRecorderEnv()));
  }, [recorder]);

  // Leaving the card: silence the take (the hook revokes its URL itself).
  useEffect(() => () => audioRef.current?.pause(), []);

  const status = supported ? rec.status : "unsupported";
  const message = recorderMessage(status);
  const canRecord = supported && status !== "unsupported" && status !== "requesting";
  const recording = status === "recording";
  const hasTake = rec.url !== null;

  function stopTake() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
  }

  function playClip() {
    stopTake();
    setAb("idle");
    embedRef.current?.play();
  }

  function playTake() {
    embedRef.current?.pause();
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    void a.play().catch(() => setAb("idle"));
    setAb("take");
  }

  function compare() {
    if (!hasTake) return;
    stopTake();
    setAb("clip"); // loop is suspended for this pass, so the clip ends → take plays
    embedRef.current?.play();
  }

  function onClipEnded() {
    if (ab === "clip") playTake();
  }

  async function toggleRecord() {
    if (recording) {
      rec.stop();
      return;
    }
    stopTake();
    setAb("idle");
    await rec.start();
  }

  const parts = target ? splitSentence(sentence.text, target) : null;

  return (
    <div className={cn("card", "rise", "card-shadow")}>
      <div className="card-kicker">Shadow this line</div>

      <div className="shadow-clip">
        <ReviewEmbed
          ref={embedRef}
          videoId={clip.sourceId}
          startMs={clip.startMs}
          endMs={clip.endMs}
          loop={loop && ab !== "clip"}
          autoplay={autoplay}
          onEnded={onClipEnded}
        />
      </div>

      <div className="card-sentence jp">
        {target && parts
          ? parts.map((part, i) =>
              part.isTarget ? (
                <ruby key={i} className="target">
                  {part.text}
                  <rt>{target.reading}</rt>
                </ruby>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )
          : sentence.text}
      </div>
      {sentence.translation && <div className="card-en">{sentence.translation}</div>}

      <div className="shadow-controls" role="group" aria-label="Shadowing controls">
        <button className="shadow-btn" type="button" onClick={playClip} aria-label="Play the clip (A)">
          <PlayIcon />
          <span>A · Clip</span>
        </button>
        <button
          className={cn("shadow-btn", loop && "on")}
          type="button"
          aria-pressed={loop}
          onClick={() => setLoop((l) => !l)}
        >
          <LoopIcon />
          <span>Loop</span>
        </button>
        <button
          className={cn("shadow-btn", "rec", recording && "on")}
          type="button"
          onClick={toggleRecord}
          disabled={!canRecord && !recording}
          aria-pressed={recording}
        >
          {recording ? <StopIcon /> : <MicIcon />}
          <span>
            {recording
              ? `Stop ${formatTakeTime(rec.elapsedMs)} / ${formatTakeTime(MAX_TAKE_MS)}`
              : status === "requesting"
                ? "Allow the mic…"
                : hasTake
                  ? "Record again"
                  : "Record"}
          </span>
        </button>
        <button className="shadow-btn" type="button" onClick={playTake} disabled={!hasTake || recording} aria-label="Play my take (B)">
          <PlayIcon />
          <span>B · My take</span>
        </button>
        <button className={cn("shadow-btn", ab !== "idle" && "on")} type="button" onClick={compare} disabled={!hasTake || recording}>
          <span>A/B</span>
        </button>
      </div>

      {message ? (
        <p className="shadow-msg" role="alert">{message}</p>
      ) : (
        <p className="shadow-note">
          Your recording stays in this tab and is gone when you move on. Wear headphones if you record while the clip plays.
        </p>
      )}

      {rec.url && (
        <audio ref={audioRef} src={rec.url} preload="auto" onEnded={() => setAb("idle")} hidden />
      )}

      <ReviewDetails
        target={target}
        source={source}
        notes={notes}
        onPlayClip={playClip}
        onEditNotes={onEditNotes}
      />
    </div>
  );
}
