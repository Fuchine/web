import { describe, it, expect } from "vitest";
import { classifyCategory } from "./category";

describe("classifyCategory", () => {
  it("matches Japanese keywords in the title", () => {
    expect(classifyCategory("マイクラ実況 part3", null)).toBe("Gaming");
    expect(classifyCategory("【歌ってみた】夜に駆ける", null)).toBe("Music");
    expect(classifyCategory("簡単レシピ 肉じゃが", "料理ちゃんねる")).toBe("Food");
  });

  it("matches English keywords case-insensitively", () => {
    expect(classifyCategory("Daily VLOG in Tokyo", null)).toBe("Vlog");
    expect(classifyCategory("Japanese grammar LESSON N4", null)).toBe("Education");
  });

  it("uses the channel name as a signal", () => {
    expect(classifyCategory("朝の準備", "hololive")).toBe("VTuber");
  });

  it("returns null when nothing matches (never a wrong guess)", () => {
    expect(classifyCategory("あああ", null)).toBeNull();
    expect(classifyCategory("", "")).toBeNull();
  });

  it("respects rule order — VTuber before Gaming", () => {
    // A hololive gaming stream is bucketed as VTuber (more specific).
    expect(classifyCategory("ゲーム実況", "hololive")).toBe("VTuber");
  });
});
