// @fuchine/ui — design system (Claude Design handoff → Tailwind v4 components).

export { Button } from "./components/Button/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./components/Button/Button";

export { Input } from "./components/Field/Input";
export type { InputProps } from "./components/Field/Input";
export { TextField } from "./components/Field/TextField";
export type { TextFieldProps } from "./components/Field/TextField";

export { Badge } from "./components/Badge/Badge";
export type { BadgeProps, BadgeVariant } from "./components/Badge/Badge";

export { Card } from "./components/Card/Card";
export type { CardProps } from "./components/Card/Card";

export { Avatar } from "./components/Avatar/Avatar";
export type { AvatarProps } from "./components/Avatar/Avatar";

export { SectionHeading } from "./components/SectionHeading/SectionHeading";
export type { SectionHeadingProps } from "./components/SectionHeading/SectionHeading";

export { AppShell } from "./components/AppShell/AppShell";
export type { AppShellProps, AppShellAccount, NavItem } from "./components/AppShell/AppShell";
export { buildAppNav, NAV_ICONS } from "./components/AppShell/nav";
export type { BuildAppNavOptions } from "./components/AppShell/nav";

export { BrandPanel } from "./components/BrandPanel/BrandPanel";
export type { BrandPanelProps } from "./components/BrandPanel/BrandPanel";

export { VideoCard } from "./components/VideoCard/VideoCard";
export type { VideoCardProps } from "./components/VideoCard/VideoCard";

export { Skeleton } from "./components/Skeleton/Skeleton";
export type { SkeletonProps } from "./components/Skeleton/Skeleton";

export { Login } from "./components/Login/Login";
export type { LoginProps, LoginMode, LoginValues } from "./components/Login/Login";

// Player (T1.3 — rest state)
export { Player } from "./components/Player/Player";
export type {
  PlayerProps,
  PlayerVideo as PlayerVideoData,
  PlayerSubtitleLine,
  LineTokensUpdate,
} from "./components/Player/Player";
export { PlayerExplain } from "./components/Player/PlayerExplain";
export type {
  PlayerExplainProps,
  ExplainFocal,
} from "./components/Player/PlayerExplain";
export { RATES } from "./components/Player/PlayerControlBar";
export type { PlaybackRate, PlayerControlBarProps } from "./components/Player/PlayerControlBar";
// T3.8 — listening modes + known-word signals
export { PRIMED_PREVIEW_MS, PRIMED_REVEAL_MS } from "./lib/listening";
export type { ListeningMode, FuriganaMode, WordStatus } from "./lib/listening";
// T3.9 — token-weighted coverage + confidence band
export { COVERAGE_ZONES, coverageZone, coverageTooltip, formatCoverage, formatCoverageBand } from "./lib/coverage";
export type { CoverageInfo } from "./lib/coverage";

// T1.4 — dict popup + T1.6 — sentence mining
export { DictPopup } from "./components/DictPopup/DictPopup";
// T3.2 — pitch accent (Kanjium)
export { PitchAccent, PitchPatternMarks, pitchSourceLabel } from "./components/PitchAccent/PitchAccent";
export type { PitchInfo, PitchAccentProps } from "./components/PitchAccent/PitchAccent";
export { MinedCard } from "./components/MinedCard/MinedCard";
// T3.7 — per-user token correction (the popup's "Fix")
export { TokenFixEditor } from "./components/TokenFix/TokenFixEditor";
export type {
  TokenFixEditorProps, TokenFixOverride, TokenFixInput, FixToken, FixEntryHit,
} from "./components/TokenFix/TokenFixEditor";

// T3.6 — mine now, curate later
export { CurateCard } from "./components/Curate/CurateCard";
export type {
  CurateCardProps, CurateCardStatus, CurateToken, CurateWordEntry, CurateExplanation,
} from "./components/Curate/CurateCard";
// Clip-only embed (start/end), reused by the curation screen's "Replay clip".
export { ReviewEmbed } from "./components/Review/ReviewEmbed";
export type { ReviewEmbedHandle } from "./components/Review/ReviewEmbed";

// T1.7 — Review Session
export { ReviewSession } from "./components/Review/ReviewSession";
export type { ReviewSessionProps, ReviewItem } from "./components/Review/ReviewSession";
// T3.11 — review variants on the exact clip
export { REVIEW_MODES } from "./components/Review/review-modes";
export type { ReviewMode } from "./components/Review/review-modes";

// T3.13 — review PWA: install affordance + screen wake lock
export { InstallAppButton, InstallAppPrompt } from "./components/Pwa/InstallApp";
export type { InstallAppButtonProps, InstallAppPromptProps } from "./components/Pwa/InstallApp";
export { useInstallPrompt, useWakeLock } from "./components/Pwa/usePwa";
export type { InstallPromptState } from "./components/Pwa/usePwa";

export { cn } from "./lib/cn";
export { UserFacingError } from "./lib/errors";
export { posLabel } from "./lib/pos";
