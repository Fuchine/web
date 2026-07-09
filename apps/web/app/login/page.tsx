"use client";

import { useEffect, useState } from "react";
import { signIn, getProviders } from "next-auth/react";
import { Login } from "@fuchine/ui";

export default function LoginPage() {
  // Only offer Google when it's actually a registered provider — otherwise the
  // button leads to Auth.js's "Configuration" error (no AUTH_GOOGLE_ID/SECRET).
  const [hasGoogle, setHasGoogle] = useState(false);
  useEffect(() => {
    getProviders()
      .then((providers) => setHasGoogle(Boolean(providers?.google)))
      .catch(() => setHasGoogle(false));
  }, []);

  return (
    <div className="h-dvh">
      <Login
        onGoogle={hasGoogle ? () => signIn("google", { callbackUrl: "/" }) : undefined}
        onSubmit={(values) => {
          // Email magic link (the Nodemailer provider, when SMTP is configured).
          void signIn("nodemailer", { email: values.email, callbackUrl: "/" });
        }}
      />
    </div>
  );
}
