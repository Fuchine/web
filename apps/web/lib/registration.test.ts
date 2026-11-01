import { describe, expect, test } from "vitest";
import {
  decideRegistration,
  parseRegistrationEnv,
  type RegistrationInput,
} from "./registration";
import { normalizeEmail } from "@fuchine/db";

describe("normalizeEmail", () => {
  test("trims and lowercases", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });
  test("NFKC turns a fullwidth @ into a real one", () => {
    expect(normalizeEmail("a＠b.com")).toBe("a@b.com");
  });
  test("rejects zero or several @, quotes and empty", () => {
    expect(normalizeEmail("no-at.com")).toBeNull();
    expect(normalizeEmail("a@b@c.com")).toBeNull();
    expect(normalizeEmail('"x"@b.com')).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("parseRegistrationEnv", () => {
  test("unset → open in dev, invite in production", () => {
    expect(parseRegistrationEnv({}, "development")).toMatchObject({ ok: true, mode: "open" });
    expect(parseRegistrationEnv({}, "production")).toMatchObject({ ok: true, mode: "invite" });
  });
  test("explicit value wins, case-insensitive", () => {
    expect(parseRegistrationEnv({ REGISTRATION: "Closed" }, "production")).toMatchObject({ mode: "closed" });
  });
  test("invalid value is reported", () => {
    expect(parseRegistrationEnv({ REGISTRATION: "maybe" }, "production").ok).toBe(false);
  });
  test("lists are split, trimmed, lowercased; empties and leading @ dropped", () => {
    const r = parseRegistrationEnv(
      { AUTH_ALLOWED_EMAILS: " A@x.com, ,b@y.com ", AUTH_ALLOWED_DOMAINS: "@Example.com,team.io" },
      "production",
    );
    expect(r).toMatchObject({
      ok: true,
      allowEmails: ["a@x.com", "b@y.com"],
      allowDomains: ["example.com", "team.io"],
    });
  });
});

const base: RegistrationInput = {
  mode: "invite",
  email: "new@example.test",
  emailVerified: true,
  isExistingUser: false,
  hasActiveInvite: false,
  allowEmails: [],
  allowDomains: [],
};
const d = (over: Partial<RegistrationInput>) => decideRegistration({ ...base, ...over });

describe("decideRegistration", () => {
  test.each([
    ["open allows anyone", { mode: "open" as const, emailVerified: false }, { allow: true, via: "open" }],
    ["invite: existing user", { isExistingUser: true }, { allow: true, via: "existing" }],
    ["invite: existing user even unverified", { isExistingUser: true, emailVerified: false }, { allow: true, via: "existing" }],
    ["invite: env e-mail", { allowEmails: ["new@example.test"] }, { allow: true, via: "env-email" }],
    ["invite: env domain", { allowDomains: ["example.test"] }, { allow: true, via: "env-domain" }],
    ["invite: env domain unverified", { allowDomains: ["example.test"], emailVerified: false }, { allow: false, reason: "unverified" }],
    ["invite: active invite", { hasActiveInvite: true }, { allow: true, via: "invite" }],
    ["invite: invite unverified", { hasActiveInvite: true, emailVerified: false }, { allow: false, reason: "unverified" }],
    ["invite: nobody", {}, { allow: false, reason: "not-invited" }],
    ["closed: existing user", { mode: "closed" as const, isExistingUser: true }, { allow: true, via: "existing" }],
    ["closed: env e-mail", { mode: "closed" as const, allowEmails: ["new@example.test"] }, { allow: true, via: "env-email" }],
    ["closed: invite is not enough", { mode: "closed" as const, hasActiveInvite: true }, { allow: false, reason: "closed" }],
    ["bad e-mail", { email: null }, { allow: false, reason: "bad-email" }],
    ["bad e-mail even when open", { mode: "open" as const, email: null }, { allow: false, reason: "bad-email" }],
  ])("%s", (_name, over, expected) => {
    expect(d(over)).toEqual(expected);
  });

  test("domain match is exact", () => {
    const allowDomains = ["example.com"];
    expect(d({ email: "a@example.com", allowDomains }).allow).toBe(true);
    expect(d({ email: "a@sub.example.com", allowDomains }).allow).toBe(false);
    expect(d({ email: "a@evilexample.com", allowDomains }).allow).toBe(false);
  });
});
