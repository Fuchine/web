"use client";

import { type FormEvent, useState } from "react";
import { Button } from "../Button/Button";
import { TextField } from "../Field/TextField";
import { BrandPanel } from "../BrandPanel/BrandPanel";

export type LoginMode = "signin" | "signup";
export interface LoginValues { name?: string; email: string; password: string }

export interface LoginProps {
  mode?: LoginMode;
  defaultMode?: LoginMode;
  onModeChange?: (mode: LoginMode) => void;
  loading?: boolean;
  error?: string;
  onSubmit?: (values: LoginValues, mode: LoginMode) => void;
  onGoogle?: () => void;
  onForgotPassword?: () => void;
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21 12.2c0-.6-.05-1.2-.15-1.7H12v3.4h5.05a4.3 4.3 0 0 1-1.87 2.8v2.3h3.02C19.96 17.3 21 15 21 12.2z" fill="currentColor" opacity="0.9" />
    <path d="M12 21c2.43 0 4.47-.8 5.96-2.18l-3.02-2.3c-.84.56-1.92.9-2.94.9-2.26 0-4.18-1.53-4.86-3.58H3.96v2.37A9 9 0 0 0 12 21z" fill="currentColor" opacity="0.55" />
    <path d="M7.14 13.84a5.4 5.4 0 0 1 0-3.46V8.01H3.96a9 9 0 0 0 0 8.2l3.18-2.37z" fill="currentColor" opacity="0.4" />
    <path d="M12 6.96c1.32 0 2.5.46 3.43 1.35l2.57-2.57C16.46 4.3 14.42 3.5 12 3.5A9 9 0 0 0 3.96 8l3.18 2.37C7.82 8.49 9.74 6.96 12 6.96z" fill="currentColor" opacity="0.7" />
  </svg>
);

/** The split-panel sign in / create account screen. */
export function Login({
  mode: controlledMode,
  defaultMode = "signin",
  onModeChange,
  loading,
  error,
  onSubmit,
  onGoogle,
  onForgotPassword,
}: LoginProps) {
  const [internalMode, setInternalMode] = useState<LoginMode>(defaultMode);
  const mode = controlledMode ?? internalMode;
  const isSignup = mode === "signup";

  const setMode = (m: LoginMode) => {
    onModeChange?.(m);
    if (controlledMode === undefined) setInternalMode(m);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    onSubmit?.(
      {
        name: (data.get("name") as string) || undefined,
        email: (data.get("email") as string) || "",
        password: (data.get("password") as string) || "",
      },
      mode,
    );
  };

  return (
    <div className="grid h-full grid-cols-1 bg-bg md:grid-cols-2">
      <div className="flex flex-col overflow-auto px-12 py-10">
        {/* wordmark */}
        <div className="flex items-center gap-[10px]">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent pb-px font-['Noto_Serif_JP',serif] text-[16px] leading-none text-on-accent">淵</span>
          <span className="text-[16px] font-[600] -tracking-[0.01em] text-fg">Fuchine</span>
        </div>

        <div className="flex flex-1 flex-col justify-center py-8">
          <form className="mx-auto w-full max-w-[380px]" onSubmit={handleSubmit}>
            <div className="mb-8">
              <h1 className="m-0 mb-2 text-[26px] font-[600] -tracking-[0.02em] leading-[1.15] text-fg">
                {isSignup ? "Create account" : "Sign in"}
              </h1>
              <p className="m-0 text-[14.5px] leading-[1.5] text-muted">
                {isSignup ? "Start studying Japanese through video immersion." : "Welcome back — dive back in."}
              </p>
            </div>

            {isSignup && <TextField name="name" label="Name" placeholder="Your name" autoComplete="name" />}
            <TextField name="email" type="email" label="Email" placeholder="you@example.com" autoComplete="email" />
            <TextField
              name="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              autoComplete={isSignup ? "new-password" : "current-password"}
              labelAction={
                !isSignup ? (
                  <button type="button" onClick={onForgotPassword} className="text-[12.5px] font-medium text-muted transition-colors hover:text-link">
                    Forgot password?
                  </button>
                ) : undefined
              }
            />

            {error && <p className="mb-3 mt-[-4px] text-[13px] text-error">{error}</p>}

            <Button type="submit" fullWidth loading={loading} className="mt-[6px]">
              {isSignup ? "Create account" : "Sign in"}
            </Button>

            <div className="my-[26px] flex items-center gap-[14px] text-[12px] text-faint before:h-px before:flex-1 before:bg-border before:content-[''] after:h-px after:flex-1 after:bg-border after:content-['']">
              or
            </div>

            <Button type="button" variant="ghost" fullWidth icon={<GoogleIcon />} onClick={onGoogle}>
              Continue with Google
            </Button>

            <p className="mt-7 text-center text-[13.5px] text-muted">
              {isSignup ? "Already have an account? " : "No account? "}
              <button
                type="button"
                onClick={() => setMode(isSignup ? "signin" : "signup")}
                className="font-medium text-link transition-colors hover:text-[var(--link-hover)]"
              >
                {isSignup ? "Sign in" : "Create one"}
              </button>
            </p>
          </form>
        </div>
      </div>

      <BrandPanel className="hidden md:flex" />
    </div>
  );
}
