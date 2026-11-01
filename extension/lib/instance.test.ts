import { describe, expect, it } from "vitest";
import {
  DEFAULT_BASE,
  STATUS_URL,
  bridgeMatchPattern,
  isYouTubeWatchUrl,
  isStaticBridgeOrigin,
  isVideoId,
  normalizeBase,
  originPattern,
} from "./instance";

describe("instance helpers", () => {
  it("normalizes the configured base", () => {
    expect(normalizeBase(undefined)).toBe(DEFAULT_BASE);
    expect(normalizeBase("")).toBe(DEFAULT_BASE);
    expect(normalizeBase("https://fuchine.example.com///")).toBe("https://fuchine.example.com");
  });

  it("builds an origin match pattern, dropping path and query", () => {
    expect(originPattern("https://fuchine.example.com/some/path?x=1")).toBe("https://fuchine.example.com/*");
    expect(originPattern("http://localhost:3000")).toBe("http://localhost:3000/*");
    expect(originPattern("not a url")).toBeNull();
  });

  it("only treats the dev origin as statically bridged", () => {
    expect(isStaticBridgeOrigin("http://localhost:3000")).toBe(true);
    expect(isStaticBridgeOrigin("https://localhost:3000")).toBe(true);
    expect(isStaticBridgeOrigin("http://localhost:3001")).toBe(false);
    expect(isStaticBridgeOrigin("https://fuchine.example.com")).toBe(false);
    expect(bridgeMatchPattern("https://fuchine.example.com/")).toBe("https://fuchine.example.com/*");
  });

  it("accepts only bare 11-char video ids", () => {
    expect(isVideoId("dQw4w9WgXcQ")).toBe(true);
    expect(isVideoId("a_b-c_d-e_f")).toBe(true);
    expect(isVideoId("dQw4w9WgXcQ&list=x")).toBe(false);
    expect(isVideoId("short")).toBe(false);
    expect(isVideoId(42)).toBe(false);
  });

  it("defaults the status page to the repo doc", () => {
    expect(STATUS_URL).toMatch(/docs\/EXTENSION_STATUS\.md$/);
  });
});

describe("isYouTubeWatchUrl", () => {
  it("accepts YouTube watch pages only", () => {
    expect(isYouTubeWatchUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeWatchUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });
  it("rejects lookalikes, other paths and junk", () => {
    expect(isYouTubeWatchUrl("https://evil.example/?x=youtube.com/watch")).toBe(false);
    expect(isYouTubeWatchUrl("https://youtube.com.evil.example/watch?v=x")).toBe(false);
    expect(isYouTubeWatchUrl("https://www.youtube.com/shorts/abc")).toBe(false);
    expect(isYouTubeWatchUrl("http://www.youtube.com/watch?v=x")).toBe(false);
    expect(isYouTubeWatchUrl("not a url")).toBe(false);
    expect(isYouTubeWatchUrl(undefined)).toBe(false);
  });
});
