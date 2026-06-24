import { describe, it, expect } from "vitest";
import { posLabel } from "./pos";

describe("posLabel", () => {
  it("godan + intransitive", () => expect(posLabel("v5k,vi")).toBe("Godan verb · intransitive"));
  it("ichidan + transitive", () => expect(posLabel("v1,vt")).toBe("Ichidan verb · transitive"));
  it("suru", () => expect(posLabel("vs-i")).toBe("Suru verb"));
  it("kuru", () => expect(posLabel("vk,vi")).toBe("Kuru verb · intransitive"));
  it("noun", () => expect(posLabel("n")).toBe("Noun"));
  it("i-adjective", () => expect(posLabel("adj-i")).toBe("I-adjective"));
  it("v5k-s counts as godan", () => expect(posLabel("v5k-s,vi,aux-v")).toBe("Godan verb · intransitive · Auxiliary verb"));
  it("dedupes repeated labels", () => expect(posLabel("v5k,v5s")).toBe("Godan verb"));
  it("keeps unknown codes raw", () => expect(posLabel("xyz")).toBe("xyz"));
  it("null/empty → ''", () => { expect(posLabel(null)).toBe(""); expect(posLabel("")).toBe(""); });
});
