"use client";

import { signIn } from "next-auth/react";
import { Login } from "@fuchine/ui";

export default function LoginPage() {
  return (
    <div className="h-dvh">
      <Login
        onGoogle={() => signIn("google", { callbackUrl: "/" })}
        onSubmit={(values) => {
          // Email magic link (the Nodemailer provider, when SMTP is configured).
          void signIn("nodemailer", { email: values.email, callbackUrl: "/" });
        }}
      />
    </div>
  );
}
