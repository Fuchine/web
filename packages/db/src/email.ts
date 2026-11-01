// E-mail normalization shared by the web app (registration policy) and the
// worker (invite CLI). Mirrors Auth.js' defaultNormalizer for the magic-link
// identifier (NFKC before validation, lowercase, trim, exactly one "@", no
// quotes), so an address compares equal however it reached us.

/** Normalized address, or null when it is not a single plausible address. */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.normalize("NFKC").toLowerCase().trim();
  if (s.includes('"') || /\s/.test(s)) return null;
  const parts = s.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || !domain || !domain.includes(".")) return null;
  return `${local}@${domain}`;
}
