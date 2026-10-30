import { describe, it, expect } from "vitest";
import { crossSiteBlockReason, type CsrfInput } from "./csrf";

const base: CsrfInput = {
  method: "POST",
  pathname: "/api/cards",
  host: "fuchine.test",
  origin: "https://fuchine.test",
  secFetchSite: "same-origin",
};
const check = (over: Partial<CsrfInput>) => crossSiteBlockReason({ ...base, ...over });

describe("crossSiteBlockReason", () => {
  it("allows same-origin mutations", () => {
    expect(check({})).toBeNull();
    expect(check({ method: "delete", pathname: "/api/albums/x" })).toBeNull();
  });

  it("blocks Sec-Fetch-Site: cross-site", () => {
    expect(check({ secFetchSite: "cross-site" })).not.toBeNull();
    expect(check({ secFetchSite: "cross-site", origin: null })).not.toBeNull();
  });

  it("blocks an Origin that names another host", () => {
    expect(check({ origin: "https://evil.test", secFetchSite: null })).not.toBeNull();
    expect(check({ origin: "https://fuchine.test.evil.test", secFetchSite: null })).not.toBeNull();
    expect(check({ origin: "https://fuchine.test:8443", secFetchSite: null })).not.toBeNull();
  });

  it("blocks an opaque Origin", () => {
    expect(check({ origin: "null", secFetchSite: null })).not.toBeNull();
  });

  it("matches the host case-insensitively, port included", () => {
    expect(check({ host: "FUCHINE.test" })).toBeNull();
    expect(check({ host: "localhost:3000", origin: "http://localhost:3000" })).toBeNull();
  });

  it("lets non-browser clients (no Origin, no Sec-Fetch-Site) through", () => {
    expect(check({ origin: null, secFetchSite: null })).toBeNull();
  });

  it("never touches safe methods or non-API paths", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(check({ method, secFetchSite: "cross-site", origin: "https://evil.test" })).toBeNull();
    }
    expect(check({ pathname: "/videos/abc", secFetchSite: "cross-site" })).toBeNull();
  });

  it("exempts Auth.js and the extension import endpoint", () => {
    const cross = { secFetchSite: "cross-site", origin: "https://accounts.google.com" };
    expect(check({ ...cross, pathname: "/api/auth/callback/google" })).toBeNull();
    expect(check({ ...cross, pathname: "/api/auth/signin/nodemailer" })).toBeNull();
    expect(
      check({ pathname: "/api/import", secFetchSite: "cross-site", origin: "chrome-extension://abcdef" }),
    ).toBeNull();
    // Prefix lookalikes are not exempt.
    expect(check({ ...cross, pathname: "/api/importer" })).not.toBeNull();
    expect(check({ ...cross, pathname: "/api/authx" })).not.toBeNull();
  });
});
