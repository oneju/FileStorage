"use client";

import { useSettings } from "@/lib/store";
import type { GhConfig } from "@/lib/github";
import { useAccess } from "@/lib/hooks";

const FIELDS: { key: keyof GhConfig; label: string; placeholder: string }[] = [
  { key: "owner", label: "owner", placeholder: "wonju" },
  { key: "repo", label: "repo", placeholder: "wonju.github.io" },
  { key: "branch", label: "branch", placeholder: "main" },
  { key: "dir", label: "bucket root", placeholder: "uploads" },
];

export function Settings({ cfg, onClose }: { cfg: GhConfig; onClose: () => void }) {
  const setConfig = useSettings((s) => s.setConfig);
  const reset = useSettings((s) => s.reset);
  const access = useAccess(cfg);

  return (
    <section className="border border-rule bg-panel">
      <header className="flex items-center justify-between border-b border-rule px-4 py-3">
        <p className="font-mono text-sm font-medium">bucket</p>
        <button onClick={onClose} className="font-mono text-xs text-muted hover:text-ink">
          close
        </button>
      </header>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block font-mono text-[11px] uppercase tracking-wider text-muted">
              {f.label}
            </span>
            <input
              value={cfg[f.key] as string}
              placeholder={f.placeholder}
              onChange={(e) => setConfig({ [f.key]: e.target.value })}
              className="mt-1 w-full border-b border-rule bg-transparent py-1 font-mono text-sm outline-none focus:border-ink"
            />
          </label>
        ))}

        <label className="block sm:col-span-2">
          <span className="block font-mono text-[11px] uppercase tracking-wider text-muted">
            fine-grained token · contents: read and write
          </span>
          <input
            type="password"
            value={cfg.token}
            placeholder="github_pat_…"
            onChange={(e) => setConfig({ token: e.target.value })}
            className="mt-1 w-full border-b border-rule bg-transparent py-1 font-mono text-sm outline-none focus:border-ink"
          />
        </label>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3">
        <p className="font-mono text-[11px] text-muted">
          Stored in this browser&apos;s localStorage only. Never committed.
        </p>
        <div className="flex items-center gap-3 font-mono text-xs">
          {access.data?.canPush && <span className="text-add">write access ok</span>}
          {access.data && !access.data.canPush && (
            <span className="text-warn">read-only token</span>
          )}
          {access.error && <span className="text-warn">{(access.error as Error).message}</span>}
          <button onClick={reset} className="text-muted hover:text-ink">
            clear
          </button>
        </div>
      </footer>
    </section>
  );
}
