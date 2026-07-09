"use client";

// App Router error boundary: any uncaught exception in a route (a server
// component failing to load, a DB blip) lands here instead of Next's raw
// default screen. Keep it generic — never leak the error message or stack to
// the user; the detail goes to the server log only.

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="err-page">
      <div className="err-mark" aria-hidden="true">
        淵
      </div>
      <h1 className="err-title">Something went wrong</h1>
      <p className="err-msg">
        An unexpected error interrupted this page. You can try again, or head
        back to your library.
      </p>
      <div className="err-actions">
        <button
          type="button"
          className="err-btn err-btn-primary"
          onClick={reset}
        >
          Try again
        </button>
        <a className="err-btn" href="/">
          Back to library
        </a>
      </div>
    </main>
  );
}
