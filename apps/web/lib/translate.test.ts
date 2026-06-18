import { describe, it, expect } from "vitest";
import { isTranslationFailure } from "./translate";

const line = (textOriginal: string) => ({ textOriginal });

describe("isTranslationFailure", () => {
  it("is failure when all null but real dialogue exists", () => {
    expect(
      isTranslationFailure([line("布巾。"), line("よく拭きます。")], [null, null]),
    ).toBe(true);
  });
  it("is NOT failure when at least one line translated", () => {
    expect(
      isTranslationFailure([line("布巾。"), line("♪ BGM ♪")], ["Cloth.", null]),
    ).toBe(false);
  });
  it("is NOT failure when every line is SFX/blank (null is legitimate)", () => {
    expect(isTranslationFailure([line("♪ BGM ♪"), line("   ")], [null, null])).toBe(
      false,
    );
  });
});
