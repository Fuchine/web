/** Convert katakana to hiragana — kuromoji readings come back in katakana. */
export function kataToHira(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}
