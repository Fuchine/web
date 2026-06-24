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
} from "./components/Player/Player";
export { PlayerExplain } from "./components/Player/PlayerExplain";
export type {
  PlayerExplainProps,
  ExplainFocal,
} from "./components/Player/PlayerExplain";
export { RATES } from "./components/Player/PlayerControlBar";
export type { PlaybackRate, PlayerControlBarProps } from "./components/Player/PlayerControlBar";

// T1.4 — dict popup + T1.6 — sentence mining
export { DictPopup } from "./components/DictPopup/DictPopup";
export { MinedCard } from "./components/MinedCard/MinedCard";

// T1.7 — Review Session
export { ReviewSession } from "./components/Review/ReviewSession";
export type { ReviewSessionProps, ReviewItem } from "./components/Review/ReviewSession";

export { cn } from "./lib/cn";
export { posLabel } from "./lib/pos";
