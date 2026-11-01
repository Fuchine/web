"use client";

import { cn } from "../../lib/cn";
import { useInstallPrompt } from "./usePwa";

function InstallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export interface InstallAppPromptProps {
  /** Chromium install prompt is available. */
  canInstall: boolean;
  /** Show the iOS "Share → Add to Home Screen" hint (only used when `allowIosHint`). */
  showIosHint: boolean;
  onInstall: () => void;
  onDismissIosHint: () => void;
  /** Icon-only button (e.g. inside the review top bar). */
  compact?: boolean;
  /** Render the iOS hint at all (it needs a full line; off in tight bars). */
  allowIosHint?: boolean;
  className?: string;
}

/**
 * Presentational install affordance (T3.13): a discreet "Install app" button
 * where the browser offers a prompt, or a one-line, dismissible hint on iOS.
 * Renders nothing when neither applies (desktop without a prompt, or already
 * installed).
 */
export function InstallAppPrompt({
  canInstall,
  showIosHint,
  onInstall,
  onDismissIosHint,
  compact = false,
  allowIosHint = true,
  className,
}: InstallAppPromptProps) {
  if (canInstall) {
    return (
      <button
        type="button"
        onClick={onInstall}
        aria-label={compact ? "Install app" : undefined}
        title="Install Fuchine on this device"
        className={cn(
          "inline-flex flex-none items-center justify-center gap-[7px] rounded-full border border-border bg-surface text-[13px] font-[550] text-muted",
          "transition-colors hover:border-border-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
          "[&_svg]:h-[16px] [&_svg]:w-[16px]",
          compact ? "h-[34px] w-[34px]" : "h-9 px-3.5",
          className,
        )}
      >
        <InstallIcon />
        {!compact && "Install app"}
      </button>
    );
  }
  if (allowIosHint && showIosHint) {
    return (
      <p
        role="note"
        className={cn(
          "m-0 flex items-center gap-2 rounded-[14px] border border-border bg-bg-2 py-[5px] pl-3.5 pr-[5px] text-[12.5px] leading-[1.35] text-muted",
          className,
        )}
      >
        <span className="min-w-0 flex-1">
          Install: <b className="font-[600] text-fg">Share</b> → <b className="font-[600] text-fg">Add to Home Screen</b>
        </span>
        <button
          type="button"
          onClick={onDismissIosHint}
          aria-label="Dismiss install hint"
          className="grid h-7 w-7 flex-none place-items-center rounded-full text-faint transition-colors hover:bg-bg hover:text-fg [&_svg]:h-[14px] [&_svg]:w-[14px]"
        >
          <CloseIcon />
        </button>
      </p>
    );
  }
  return null;
}

export type InstallAppButtonProps = Pick<InstallAppPromptProps, "compact" | "allowIosHint" | "className">;

/** The install affordance wired to the browser (beforeinstallprompt / iOS detection). */
export function InstallAppButton(props: InstallAppButtonProps) {
  const { canInstall, showIosHint, install, dismissIosHint } = useInstallPrompt();
  return (
    <InstallAppPrompt
      {...props}
      canInstall={canInstall}
      showIosHint={showIosHint}
      onInstall={() => void install()}
      onDismissIosHint={dismissIosHint}
    />
  );
}
