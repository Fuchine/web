import { describe, it, expect } from "vitest";
import { parseAlbumInput } from "./albums";

describe("parseAlbumInput (create: name required)", () => {
  it("accepts a valid name and trims it", () => {
    const r = parseAlbumInput({ name: "  Cooking vlogs  " }, { requireName: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe("Cooking vlogs");
  });

  it("rejects a missing name", () => {
    expect(parseAlbumInput({}, { requireName: true }).ok).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(parseAlbumInput({ name: "   " }, { requireName: true }).ok).toBe(false);
  });

  it("rejects a non-string name", () => {
    expect(parseAlbumInput({ name: 42 }, { requireName: true }).ok).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(parseAlbumInput({ name: "a".repeat(101) }, { requireName: true }).ok).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(parseAlbumInput(null, { requireName: true }).ok).toBe(false);
    expect(parseAlbumInput("nope", { requireName: true }).ok).toBe(false);
  });

  it("normalizes a blank description to null and trims a real one", () => {
    const blank = parseAlbumInput({ name: "A", description: "   " }, { requireName: true });
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.value.description).toBeNull();

    const real = parseAlbumInput({ name: "A", description: "  Daily immersion  " }, { requireName: true });
    expect(real.ok).toBe(true);
    if (real.ok) expect(real.value.description).toBe("Daily immersion");
  });

  it("rejects a non-string description", () => {
    expect(parseAlbumInput({ name: "A", description: 7 }, { requireName: true }).ok).toBe(false);
  });

  it("rejects a description over 500 chars", () => {
    expect(parseAlbumInput({ name: "A", description: "d".repeat(501) }, { requireName: true }).ok).toBe(false);
  });
});

describe("parseAlbumInput (update: fields optional)", () => {
  it("accepts an empty body as a no-op", () => {
    const r = parseAlbumInput({}, { requireName: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBeUndefined();
    expect(r.value.description).toBeUndefined();
  });

  it("still rejects a blank name when one is provided", () => {
    expect(parseAlbumInput({ name: "  " }, { requireName: false }).ok).toBe(false);
  });

  it("accepts a description-only update", () => {
    const r = parseAlbumInput({ description: "new blurb" }, { requireName: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBeUndefined();
    expect(r.value.description).toBe("new blurb");
  });
});
