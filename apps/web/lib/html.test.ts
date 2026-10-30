import { describe, it, expect } from "vitest";
import { escapeHtml } from "./html";

describe("escapeHtml", () => {
  it("escapes the HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("keeps a URL usable inside a quoted attribute", () => {
    const url = 'https://ok.test/api/auth/callback/nodemailer?token=a&email=b"><script>';
    expect(escapeHtml(url)).toBe(
      "https://ok.test/api/auth/callback/nodemailer?token=a&amp;email=b&quot;&gt;&lt;script&gt;",
    );
  });

  it("leaves plain text alone", () => {
    expect(escapeHtml("日本語 text")).toBe("日本語 text");
  });
});
