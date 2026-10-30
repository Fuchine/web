import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  const m = manifest();

  it("installs as a standalone app that opens the review queue", () => {
    expect(m.start_url).toBe("/review");
    expect(m.display).toBe("standalone");
    expect(m.name).toBe("Fuchine");
    expect(m.short_name).toBeTruthy();
  });

  it("ships 192/512 PNG icons plus a maskable one, all present in public/", () => {
    const icons = m.icons ?? [];
    const sizes = icons.filter((i) => i.type === "image/png").map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      expect(existsSync(new URL(`../public${icon.src}`, import.meta.url)), icon.src).toBe(true);
    }
  });
});
