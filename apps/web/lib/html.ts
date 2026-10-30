// Minimal HTML escaping for strings we interpolate into HTML outside React
// (the magic-link e-mail, the Anki TSV with #html:true). Safe in text content
// and in double- or single-quoted attribute values.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}
