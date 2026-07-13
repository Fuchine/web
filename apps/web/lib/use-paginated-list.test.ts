import { describe, it, expect } from "vitest";
import { mergeById } from "./use-paginated-list";

const key = (x: { id: string }) => x.id;

describe("mergeById", () => {
  it("appends new items in order", () => {
    const out = mergeById([{ id: "a" }, { id: "b" }], [{ id: "c" }, { id: "d" }], key);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("drops items already present (overlapping pages)", () => {
    const out = mergeById([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }], key);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("returns the same reference when nothing new arrives", () => {
    const existing = [{ id: "a" }, { id: "b" }];
    expect(mergeById(existing, [{ id: "a" }], key)).toBe(existing);
    expect(mergeById(existing, [], key)).toBe(existing);
  });
});

describe("toLibraryVideo", () => {
  it("maps a row and derives the level band", async () => {
    const { toLibraryVideo } = await import("./library");
    const row = {
      id: "v1", title: "T", channel: "C", source: "youtube", sourceId: "yt1",
      durationS: 100, status: "done" as const, statusReason: null,
      levelEstimate: "intermediate", embeddable: true, category: "Gaming",
    };
    expect(toLibraryVideo(row, 0.42)).toMatchObject({ id: "v1", level: 3, comprehension: 0.42 });
    expect(toLibraryVideo({ ...row, levelEstimate: null }, null)).toMatchObject({
      level: null,
      comprehension: null,
    });
  });
});
