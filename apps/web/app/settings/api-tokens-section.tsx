"use client";

// Settings → Extension & API (T2.11). Per-user API tokens for POST /api/import:
// create with a name (the secret is shown ONCE, with a copy button), list
// (name, prefix, created, last used), revoke. The browser extension pastes the
// token next to the instance URL and sends it as `Authorization: Bearer`.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@fuchine/ui";

type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const MAX_ACTIVE = 10;

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "Never used";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "Used just now";
  if (mins < 60) return `Used ${mins} min ago`;
  if (mins < 48 * 60) return `Used ${Math.round(mins / 60)} h ago`;
  return `Used ${fmtDate(iso)}`;
}

export function ApiTokenRows() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tokens", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { tokens: ApiToken[] };
      setTokens(data.tokens);
    } catch {
      setError("Could not load your tokens.");
      setTokens([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = (tokens ?? []).filter((t) => !t.revokedAt);
  const revoked = (tokens ?? []).filter((t) => t.revokedAt);
  const atCap = active.length >= MAX_ACTIVE;

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setError(data.error ?? "Could not create the token.");
        return;
      }
      setFresh({ name: trimmed, token: data.token });
      setName("");
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: ApiToken) {
    if (!window.confirm(`Revoke "${t.name}"? Clients using it will stop working.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/tokens/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not revoke the token.");
      }
    } catch {
      setError("Could not reach the server.");
    }
    await load();
  }

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.token);
      setCopied(true);
    } catch {
      setError("Copy failed. Select the token and copy it manually.");
    }
  }

  return (
    <div className="border-b border-border px-5 py-4 last:border-b-0">
      <p className="text-[14px] font-[550] text-fg">API tokens</p>
      <p className="mt-0.5 text-[13px] text-muted">
        Paste a token into the Fuchine Importer extension, next to this instance&apos;s URL. A token can
        only import videos; it can&apos;t read or change anything else. Revoke it if a device is lost.
      </p>

      {fresh && (
        <div className="mt-4 rounded-[12px] border border-accent bg-field px-4 py-3" role="status">
          <p className="text-[13px] font-[550] text-fg">
            Token &ldquo;{fresh.name}&rdquo; created. Copy it now: it won&apos;t be shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 flex-1 select-all break-all rounded-[8px] border border-border bg-surface px-3 py-1.5 font-mono text-[12.5px] text-fg"
              aria-label="New API token"
            >
              {fresh.token}
            </code>
            <Button size="sm" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          type="text"
          value={name}
          maxLength={60}
          placeholder="Token name, e.g. Laptop Chrome"
          aria-label="Token name"
          disabled={atCap}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[14px] text-fg"
        />
        <Button size="sm" type="submit" disabled={busy || atCap || name.trim().length === 0}>
          {busy ? "Creating…" : "Create token"}
        </Button>
      </form>
      {atCap && (
        <p className="mt-2 text-[12.5px] text-muted">
          You have {MAX_ACTIVE} active tokens, the maximum. Revoke one to create another.
        </p>
      )}
      {error && <p className="mt-2 text-[13px] text-error">{error}</p>}

      {tokens === null ? (
        <p className="mt-4 text-[13px] text-muted">Loading…</p>
      ) : active.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">No active tokens.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-[12px] border border-border">
          {active.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-[550] text-fg">{t.name}</p>
                <p className="text-[12.5px] text-muted">
                  <code className="font-mono">{t.prefix}…</code> · Created {fmtDate(t.createdAt)} ·{" "}
                  {fmtWhen(t.lastUsedAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-error hover:text-error"
                onClick={() => void revoke(t)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      {revoked.length > 0 && (
        <details className="mt-3 text-[12.5px] text-muted">
          <summary className="cursor-pointer">Revoked tokens ({revoked.length})</summary>
          <ul className="mt-2 grid gap-1">
            {revoked.map((t) => (
              <li key={t.id}>
                {t.name} · <code className="font-mono">{t.prefix}…</code> · revoked {fmtDate(t.revokedAt)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
