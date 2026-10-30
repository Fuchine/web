import { ACCESS_DENIED_MESSAGE, parseRegistrationEnv } from "@/lib/registration";
import { LoginView } from "./login-view";

// Server wrapper: maps Auth.js' ?error= to a user-facing message and tells the
// view whether this instance is invite-only (the mode is not a secret). Every
// denial reason shows the same text (no account enumeration — T2.3 spec).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const env = parseRegistrationEnv(process.env, process.env.NODE_ENV);
  const inviteOnly = !env.ok || env.mode !== "open";

  const message =
    error === "AccessDenied"
      ? ACCESS_DENIED_MESSAGE
      : error
        ? "Sign-in failed. Please try again."
        : undefined;

  return (
    <LoginView
      error={message}
      footnote={inviteOnly ? "Invite-only instance. Existing members can sign in." : undefined}
    />
  );
}
