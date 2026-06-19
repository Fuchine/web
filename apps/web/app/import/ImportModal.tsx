"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseYouTubeId } from "@/lib/youtube";
import { isExtensionInstalled, requestImport } from "@/lib/extension-bridge";
import styles from "./import-modal.module.css";

type State =
  | "empty"
  | "validating"
  | "valid"
  | "reject"
  | "processing"
  | "done"
  | "failed";

interface VideoPreview {
  id: string;
  title: string;
  channel: string;
  duration: string;
  thumbnailUrl: string;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
      <path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

function CaptionIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M7 11.5h2.5M7 14.5h4M13.5 11.5H17M13.5 14.5h2" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16h.01" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 9.5 12 15.5l6-6" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 4v10M8 10.5l4 4 4-4M5 19.5h14" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 7.5A8 8 0 1 0 21 12M20 4v3.5h-3.5" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

interface ImportModalProps {
  onClose?: () => void;
}

export function ImportModal({ onClose }: ImportModalProps) {
  const [state, setState] = useState<State>("empty");
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<VideoPreview | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedTrack, setSelectedTrack] = useState("ja");
  const [importedVideoId, setImportedVideoId] = useState<string | null>(null);
  const [extReady, setExtReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null!);
  const router = useRouter();

  useEffect(() => {
    setExtReady(isExtensionInstalled());
  }, []);

  const go = (next: State) => setState(next);

  async function handleImport() {
    const id = parseYouTubeId(url);
    if (!id) {
      go("reject");
      return;
    }
    go("validating");
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
      const res = await fetch(oembedUrl);
      if (!res.ok) {
        go("reject");
        return;
      }
      const data = await res.json();
      const thumb = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
      setVideo({
        id,
        title: data.title || "YouTube Video",
        channel: data.author_name || "",
        duration: "",
        thumbnailUrl: thumb,
      });
      go("valid");
    } catch {
      go("reject");
    }
  }

  async function handleStartStudy() {
    if (importedVideoId) {
      router.push(`/videos/${importedVideoId}`);
      return;
    }
    if (!video) return;

    if (!isExtensionInstalled()) {
      setErrorMsg("The Fuchine extension isn't installed.");
      go("failed");
      return;
    }

    go("processing");
    const result = await requestImport(video.id);
    if (result.ok) {
      setImportedVideoId(video.id);
      go("done");
    } else {
      setErrorMsg(result.error ?? "Import failed.");
      go("failed");
    }
  }

  return (
    <div className={styles.stage}>
      <div className={styles.scrim}>
        <div className={styles.modal}>
          {/* Header */}
          <div className={styles.modalHead}>
            <span className={styles.hmark}>
              <YoutubeIcon />
            </span>
            <span className={styles.htitle}>Import video</span>
            <button
              className={styles.hclose}
              aria-label="Close"
              onClick={() => (onClose ? onClose() : router.push("/"))}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Body */}
          <div className={styles.modalBody}>
            {state === "empty" && (
              <Empty
                url={url}
                onChange={setUrl}
                onImport={handleImport}
                inputRef={inputRef}
              />
            )}
            {state === "validating" && <Validating url={url} />}
            {state === "valid" && video && (
              <ValidPreview
                video={video}
                selectedTrack={selectedTrack}
                onTrackChange={setSelectedTrack}
                onStartStudy={handleStartStudy}
                extReady={extReady}
              />
            )}
            {state === "reject" && (
              <Reject video={video} onTryAgain={() => go("empty")} />
            )}
            {state === "processing" && <Processing />}
            {state === "done" && video && (
              <Done video={video} onStartStudy={handleStartStudy} />
            )}
            {state === "failed" && (
              <Failed
                error={errorMsg}
                onRetry={handleStartStudy}
                onCancel={() => go("empty")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- sub-states ---------- */

function Empty({
  url,
  onChange,
  onImport,
  inputRef,
}: {
  url: string;
  onChange: (v: string) => void;
  onImport: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className={styles.stateFade}>
      <p className={styles.pasteLabel}>
        Paste a link to any Japanese YouTube video and we&apos;ll prepare it
        for study.
      </p>
      <div className={styles.pasteField}>
        <span className={styles.ytIcon}>
          <YoutubeIcon />
        </span>
        <input
          ref={inputRef}
          className={styles.pasteInput}
          autoFocus
          value={url}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onImport()}
          placeholder="Paste a YouTube link"
        />
      </div>
      <div className={styles.modalFoot}>
        <button
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
          onClick={onImport}
        >
          Import
        </button>
      </div>
    </div>
  );
}

function Validating({ url }: { url: string }) {
  return (
    <div className={styles.stateFade}>
      <div className={styles.validating}>
        <Spinner className={styles.spinnerLg} />
        <div className={styles.vText}>
          <p className={styles.vTitle}>Checking video…</p>
          <p className={styles.vSub}>Looking for Japanese subtitles.</p>
        </div>
      </div>
      <p className={styles.vUrl}>{url}</p>
    </div>
  );
}

function ValidPreview({
  video,
  selectedTrack,
  onTrackChange,
  onStartStudy,
  extReady,
}: {
  video: VideoPreview;
  selectedTrack: string;
  onTrackChange: (v: string) => void;
  onStartStudy: () => void;
  extReady: boolean;
}) {
  return (
    <div className={styles.stateFade}>
      <div className={styles.preview}>
        <div className={styles.thumb}>
          <img
            src={video.thumbnailUrl}
            alt=""
            className={styles.thumbImg}
          />
        </div>
        <div className={styles.previewMeta}>
          <p className={`${styles.pTitle} jp`}>{video.title}</p>
          <div className={styles.pRow}>
            <span className={styles.pChan}>{video.channel}</span>
          </div>
        </div>
      </div>

      <div className={styles.subsFound}>
        <span className={styles.ic}>
          <CheckIcon />
        </span>
        <span className={styles.sfText}>
          <b>Ready to import.</b> Use the browser extension to capture
          subtitles.
        </span>
      </div>

      <div className={styles.trackSelect}>
        <p className={styles.tsLabel}>Subtitle track</p>
        <div className={styles.trackDd}>
          <select
            value={selectedTrack}
            onChange={(e) => onTrackChange(e.target.value)}
          >
            <option value="ja">Japanese (closed captions)</option>
            <option value="ja-auto">Japanese (auto-generated)</option>
            <option value="en">English (translation)</option>
          </select>
          <span className={styles.chev}>
            <ChevronDown />
          </span>
        </div>
      </div>

      <div className={styles.extensionNote}>
        <p>
          Install the{" "}
          <strong>Fuchine extension</strong> to capture subtitles directly
          from YouTube.
        </p>
        <a
          href="/extension"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.extensionLink}
        >
          <DownloadIcon /> How to install
        </a>
      </div>

      <div className={styles.modalFoot}>
        {extReady ? (
          <button
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
            onClick={onStartStudy}
          >
            <PlayIcon /> Import &amp; study
          </button>
        ) : (
          <a
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
            href="/extension"
            target="_blank"
            rel="noopener noreferrer"
          >
            <DownloadIcon /> Install the extension
          </a>
        )}
      </div>
    </div>
  );
}

function Reject({
  video,
  onTryAgain,
}: {
  video: VideoPreview | null;
  onTryAgain: () => void;
}) {
  return (
    <div className={styles.stateFade}>
      {video && (
        <div className={styles.rejectVid}>
          <div className={`${styles.thumb} ${styles.thumbSm}`}>
            <img src={video.thumbnailUrl} alt="" className={styles.thumbImg} />
          </div>
          <p className={`${styles.rvTitle} jp`}>{video.title}</p>
        </div>
      )}
      <div className={`${styles.notice} ${styles.reject}`}>
        <span className={styles.nIc}>
          <CaptionIcon />
        </span>
        <p className={styles.nTitle}>No Japanese subtitles found</p>
        <p className={styles.nBody}>
          This video doesn&apos;t have Japanese subtitles, so it can&apos;t be
          studied yet. Try another video — most NHK, vlog, and news channels
          include them.
        </p>
      </div>
      <div className={styles.modalFoot}>
        <button
          className={`${styles.btn} ${styles.btnGhost} ${styles.btnBlock}`}
          onClick={onTryAgain}
        >
          Try another video
        </button>
      </div>
    </div>
  );
}

const PIPELINE = [
  { key: "fetch", label: "Fetching subtitles" },
  { key: "analyze", label: "Analyzing words" },
  { key: "translate", label: "Translating" },
];

function Processing() {
  const [step, setStep] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    const interval = setInterval(() => {
      setStep((s) => {
        if (s >= PIPELINE.length) {
          clearInterval(interval);
          return s;
        }
        return s + 1;
      });
    }, 1300);
    return () => clearInterval(interval);
  });

  const pct = Math.min(
    100,
    Math.round(((step + 0.4) / PIPELINE.length) * 100)
  );

  return (
    <div className={`${styles.stateFade} ${styles.processing}`}>
      <p className={styles.procHead}>Preparing your study session…</p>
      <p className={styles.procSub}>
        This usually takes a few seconds. You can keep it open.
      </p>

      <div className={styles.procBar}>
        <i style={{ width: `${pct}%` }} />
      </div>

      <div className={styles.steps}>
        {PIPELINE.map((s, i) => {
          const cls = i < step ? "done" : i === step ? "active" : "pending";
          return (
            <div className={`${styles.step} ${styles[cls as keyof typeof styles]}`} key={s.key}>
              <span className={styles.sIc}>
                {cls === "done" ? (
                  <CheckIcon />
                ) : cls === "active" ? (
                  <Spinner className={styles.spinnerSm} />
                ) : (
                  <span className={styles.sNum}>{i + 1}</span>
                )}
              </span>
              <span className={styles.sLabel}>{s.label}</span>
              {cls === "done" && (
                <span className={styles.sAside}>
                  <CheckIcon />
                </span>
              )}
              {cls === "active" && (
                <span className={styles.sAside}>Working…</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Done({
  video,
  onStartStudy,
}: {
  video: VideoPreview;
  importedVideoId?: string | null;
  onStartStudy: () => void;
}) {
  return (
    <div className={styles.stateFade}>
      <div className={`${styles.notice} ${styles.doneState}`}>
        <span className={`${styles.nIc} ${styles.successPop}`}>
          <CheckIcon />
        </span>
        <p className={styles.nTitle}>Ready!</p>
        <p className={styles.nBody}>
          Your study session is prepared. Subtitles, dictionary, and review
          cards are all set.
        </p>
      </div>
      <div className={styles.doneMeta}>
        <div className={`${styles.thumb} ${styles.thumbSm}`}>
          <img src={video.thumbnailUrl} alt="" className={styles.thumbImg} />
        </div>
        <div>
          <div className={`${styles.dmT} jp`}>{video.title}</div>
          <div className={styles.dmS}>
            {video.channel}
          </div>
        </div>
      </div>
      <div className={styles.modalFoot}>
        <button
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
          onClick={onStartStudy}
        >
          <PlayIcon /> Start studying
        </button>
      </div>
    </div>
  );
}

function Failed({
  error,
  onRetry,
  onCancel,
}: {
  error: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.stateFade}>
      <div className={`${styles.notice} ${styles.fail}`}>
        <span className={styles.nIc}>
          <AlertIcon />
        </span>
        <p className={styles.nTitle}>Something went wrong</p>
        <p className={styles.nBody}>
          We couldn&apos;t finish preparing this video. Please check your
          connection and try again.
        </p>
        {error && <p className={styles.failReason}>{error}</p>}
      </div>
      <div className={styles.modalFoot}>
        <button
          className={`${styles.btn} ${styles.btnGhost} ${styles.btnGrow}`}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnGrow}`}
          onClick={onRetry}
        >
          <RefreshIcon /> Try again
        </button>
      </div>
    </div>
  );
}
