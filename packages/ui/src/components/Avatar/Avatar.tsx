import { cn } from "../../lib/cn";

export interface AvatarProps {
  /** Full name — initials are derived from it when `initials` isn't given. */
  name?: string;
  initials?: string;
  /** Pixel size (square). Default 32. */
  size?: number;
  className?: string;
}

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Round account avatar — deep indigo gradient with initials. */
export function Avatar({ name, initials, size = 32, className }: AvatarProps) {
  const text = initials ?? (name ? deriveInitials(name) : "");
  return (
    <span
      aria-hidden={!name}
      className={cn(
        "inline-grid flex-none place-items-center rounded-full font-[600] text-[var(--on-indigo)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: "linear-gradient(150deg, var(--indigo-2), var(--indigo-deep))",
      }}
    >
      {text}
    </span>
  );
}
