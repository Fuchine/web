import { describe, it, expect } from "vitest";
import { curatedNotes, groupByVideo, nextActiveAfter } from "./curate";

describe("groupByVideo", () => {
  it("groups by video in newest-first order of each group's first card", () => {
    const items = [
      { id: "a", videoId: "v1" },
      { id: "b", videoId: "v2" },
      { id: "c", videoId: "v1" },
      { id: "d", videoId: "v3" },
    ];
    expect(groupByVideo(items)).toEqual([
      { videoId: "v1", items: [items[0], items[2]] },
      { videoId: "v2", items: [items[1]] },
      { videoId: "v3", items: [items[3]] },
    ]);
  });

  it("returns no groups for no cards", () => {
    expect(groupByVideo([])).toEqual([]);
  });
});

describe("nextActiveAfter", () => {
  it("moves to the next card, else the previous, else nothing", () => {
    expect(nextActiveAfter(["a", "b", "c"], "b")).toBe("c");
    expect(nextActiveAfter(["a", "b", "c"], "c")).toBe("b");
    expect(nextActiveAfter(["a"], "a")).toBeNull();
  });

  it("falls back to the first card when the removed one isn't listed", () => {
    expect(nextActiveAfter(["a", "b"], "z")).toBe("a");
    expect(nextActiveAfter([], "z")).toBeNull();
  });
});

describe("curatedNotes", () => {
  it("keeps real notes as typed", () => {
    expect(curatedNotes("  te-iru = habit ")).toBe("  te-iru = habit ");
  });

  it("turns empty or whitespace-only into the '' sentinel", () => {
    expect(curatedNotes("")).toBe("");
    expect(curatedNotes(" \n\t")).toBe("");
  });
});
