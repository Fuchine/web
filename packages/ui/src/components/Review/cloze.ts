export interface SentencePart {
  text: string;
  isTarget: boolean;
}

/**
 * Splits a sentence into ordered parts for cloze rendering, blanking ONLY the
 * last occurrence of the target surface. Earlier occurrences stay visible, and
 * concatenating every part's text always reproduces the original sentence (so a
 * repeated target never duplicates the sentence).
 */
export function splitSentence(
  text: string,
  target: { surface: string },
): SentencePart[] {
  const idx = text.lastIndexOf(target.surface);
  if (idx === -1 || target.surface === "") {
    return [{ text, isTarget: false }];
  }

  const parts: SentencePart[] = [];
  if (idx > 0) parts.push({ text: text.slice(0, idx), isTarget: false });
  parts.push({ text: target.surface, isTarget: true });
  const after = text.slice(idx + target.surface.length);
  if (after.length > 0) parts.push({ text: after, isTarget: false });
  return parts;
}
