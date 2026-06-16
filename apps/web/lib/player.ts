export type PlayerLine = {
  id: string;
  idx: number;
  tStartMs: number;
  tEndMs: number;
  textOriginal: string;
  textTranslation: string | null;
  tokens: unknown[];
};

export function pickCurrentLine(lines: PlayerLine[], ms: number): number {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (ms >= l.tStartMs && ms < l.tEndMs) return i;
  }
  return -1;
}

export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function lineHasAudio(line: PlayerLine): boolean {
  return line.tEndMs - line.tStartMs >= 100;
}

export function isSfxLine(line: PlayerLine): boolean {
  return line.textOriginal.trimStart().startsWith("♪");
}
