import { describe, expect, test } from "vitest";
import { selectEngAsset } from "./fetch-jmdict";

// Real asset list from jmdict-simplified release 3.6.2+20260615170427.
const RELEASE_ASSETS = [
  "jmdict-all-3.6.2+20260615170427.json.tgz",
  "jmdict-all-3.6.2+20260615170427.json.zip",
  "jmdict-dut-3.6.2+20260615170427.json.zip",
  "jmdict-eng-3.6.2+20260615170427.json.tgz",
  "jmdict-eng-3.6.2+20260615170427.json.zip",
  "jmdict-eng-common-3.6.2+20260615170427.json.zip",
  "jmdict-examples-eng-3.6.2+20260615170427.json.zip",
  "jmdict-fre-3.6.2+20260615170427.json.zip",
  "jmdict-ger-3.6.2+20260615170427.json.zip",
].map((name) => ({ name }));

describe("selectEngAsset", () => {
  test("picks the full English .zip dictionary", () => {
    const asset = selectEngAsset(RELEASE_ASSETS);
    expect(asset?.name).toBe("jmdict-eng-3.6.2+20260615170427.json.zip");
  });

  test("never picks the common subset, examples, all-languages, other langs, or .tgz", () => {
    const asset = selectEngAsset(RELEASE_ASSETS);
    expect(asset?.name).not.toContain("common");
    expect(asset?.name).not.toContain("examples");
    expect(asset?.name).not.toContain("jmdict-all");
    expect(asset?.name?.endsWith(".zip")).toBe(true);
  });

  test("returns null when no English full dictionary asset is present", () => {
    const assets = [
      { name: "jmdict-eng-common-3.6.2.json.zip" },
      { name: "jmdict-fre-3.6.2.json.zip" },
      { name: "jmdict-eng-3.6.2.json.tgz" },
    ];
    expect(selectEngAsset(assets)).toBeNull();
  });
});
