interface ReviewTopBarProps {
  current: number;
  total: number;
  againCount: number;
  learnCount: number;
  dueCount: number;
  onExit: () => void;
}

export function ReviewTopBar({
  current,
  total,
  againCount,
  learnCount,
  dueCount,
  onExit,
}: ReviewTopBarProps) {
  return (
    <div className="rev-top">
      <button className="rev-exit" onClick={onExit} aria-label="Exit review">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="rev-progress">
        <div className="rev-bar">
          <div
            className="rev-fill"
            style={{ width: `${(current / total) * 100}%` }}
          />
        </div>
        <span className="rev-count">
          <b>{current}</b> / {total}
        </span>
      </div>

      <div className="rev-pills">
        <span className="pill again">
          <i />
          {againCount}
        </span>
        <span className="pill learn">
          <i />
          {learnCount}
        </span>
        <span className="pill due">
          <i />
          {dueCount}
        </span>
      </div>
    </div>
  );
}
