import Link from "next/link";

// Shown for unmatched routes and for `notFound()` calls (e.g. the player when a
// video id doesn't exist / isn't owned). Composes the same 淵 error look.
export default function NotFound() {
  return (
    <main className="err-page">
      <div className="err-mark" aria-hidden="true">
        淵
      </div>
      <h1 className="err-title">Page not found</h1>
      <p className="err-msg">
        This page has drifted into the depths. Let&rsquo;s get you back to solid
        ground.
      </p>
      <div className="err-actions">
        <Link className="err-btn err-btn-primary" href="/">
          Back to library
        </Link>
      </div>
    </main>
  );
}
