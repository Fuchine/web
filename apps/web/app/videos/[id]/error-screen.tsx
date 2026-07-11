import Link from "next/link";

export function ErrorScreen({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-[16px] px-[24px] text-center">
      <div className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-[var(--error)]/10">
        <span className="text-[20px] text-[var(--error)]">!</span>
      </div>
      <h1 className="text-[18px] font-[600] text-fg">Import failed</h1>
      <p className="max-w-[400px] text-[14px] text-muted">{title}</p>
      {reason && (
        <div className="mt-[4px] max-w-[400px] rounded-[8px] bg-[var(--error)]/5 px-[16px] py-[10px] text-[13px] text-[var(--error)]">
          {reason}
        </div>
      )}
      <Link
        href="/"
        className="mt-[8px] inline-flex items-center gap-[6px] rounded-[8px] bg-fg px-[16px] py-[8px] text-[13px] font-[500] text-bg transition-opacity hover:opacity-80"
      >
        Back to library
      </Link>
    </div>
  );
}
