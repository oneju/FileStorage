"use client";

import { useState } from "react";
import { formatSize, MAX_BYTES } from "@/lib/file";
import type { CommitPhase, GhConfig } from "@/lib/github";
import { useCommit } from "@/lib/hooks";

type Staged = { id: string; file: File; key: string };

function phaseLabel(p: CommitPhase) {
  if (p.step === "blobs") return `writing blobs ${p.done}/${p.total}`;
  if (p.step === "tree") return "building tree";
  if (p.step === "commit") return "creating commit";
  return "moving ref";
}

export function Uploader({ cfg, prefix }: { cfg: GhConfig; prefix: string }) {
  const [queue, setQueue] = useState<Staged[]>([]);
  const [message, setMessage] = useState("");
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<CommitPhase | null>(null);
  const commit = useCommit(cfg);

  const dest = prefix ? `${cfg.dir}/${prefix}/` : `${cfg.dir}/`;
  const oversize = queue.filter((s) => s.file.size > MAX_BYTES);
  const total = queue.reduce((n, s) => n + s.file.size, 0);
  const defaultMessage =
    queue.length === 1
      ? `Add ${dest}${queue[0].file.name}`
      : `Add ${queue.length} objects to ${dest}`;

  function add(list: FileList | null) {
    if (!list) return;
    commit.reset();
    const next = Array.from(list).map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      file,
      key: prefix ? `${prefix}/${file.name}` : file.name,
    }));
    setQueue((q) => [...q, ...next]);
  }

  function send() {
    if (queue.length === 0 || oversize.length > 0) return;
    commit.mutate(
      {
        uploads: queue.map((s) => ({ key: s.key, file: s.file })),
        message: message.trim() || defaultMessage,
        onPhase: setPhase,
      },
      {
        onSettled: () => setPhase(null),
        onSuccess: () => {
          setQueue([]);
          setMessage("");
        },
      },
    );
  }

  return (
    <section className="border border-rule bg-panel">
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
        <p className="font-mono text-xs text-muted">Upload</p>
        <p className="truncate font-mono text-[11px] text-muted">
          Destination <span className="text-ink">{dest}</span>
        </p>
      </header>

      <div className="p-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(e.dataTransfer.files);
          }}
          className={`rounded-sm border-2 border-dashed px-6 py-8 text-center transition-colors ${
            over ? "border-add bg-add-soft" : "border-rule"
          }`}
        >
          <input
            type="file"
            multiple
            id="picker"
            className="sr-only"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-sm text-muted">
            Drag files here, or{" "}
            <label
              htmlFor="picker"
              className="cursor-pointer font-medium text-ink underline underline-offset-4"
            >
              add files
            </label>
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted">
            {formatSize(MAX_BYTES)} max per object · the whole queue lands as one commit
          </p>
        </div>

        {queue.length > 0 && (
          <>
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {queue.map((s) => {
                const big = s.file.size > MAX_BYTES;
                return (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <input
                      value={s.key}
                      disabled={commit.isPending}
                      onChange={(e) =>
                        setQueue((q) =>
                          q.map((x) => (x.id === s.id ? { ...x, key: e.target.value } : x)),
                        )
                      }
                      aria-label={`Key for ${s.file.name}`}
                      className="min-w-0 flex-1 border-b border-transparent bg-transparent py-0.5 font-mono text-[13px] outline-none hover:border-rule focus:border-ink disabled:text-muted"
                    />
                    <span
                      className={`shrink-0 font-mono text-[11px] ${big ? "text-warn" : "text-muted"}`}
                    >
                      {formatSize(s.file.size)}
                    </span>
                    {!commit.isPending && (
                      <button
                        onClick={() => setQueue((q) => q.filter((x) => x.id !== s.id))}
                        aria-label={`Remove ${s.file.name}`}
                        className="shrink-0 font-mono text-xs text-muted hover:text-ink"
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-3">
              <label
                htmlFor="msg"
                className="block font-mono text-[11px] uppercase tracking-wider text-muted"
              >
                commit message
              </label>
              <input
                id="msg"
                value={message}
                placeholder={defaultMessage}
                disabled={commit.isPending}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                className="mt-1 w-full border-b border-rule bg-transparent py-1 font-mono text-sm outline-none focus:border-ink"
              />
            </div>

            {oversize.length > 0 && (
              <p className="mt-3 font-mono text-xs text-warn">
                {oversize.length} object{oversize.length === 1 ? " is" : "s are"} over{" "}
                {formatSize(MAX_BYTES)}. Remove {oversize.length === 1 ? "it" : "them"} to continue.
              </p>
            )}
            {commit.error && (
              <p className="mt-3 font-mono text-xs text-warn">{(commit.error as Error).message}</p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={send}
                disabled={commit.isPending || oversize.length > 0}
                className="bg-ink px-3 py-1.5 font-mono text-xs text-paper disabled:opacity-40"
              >
                {commit.isPending
                  ? "committing…"
                  : `Commit ${queue.length} object${queue.length === 1 ? "" : "s"} · ${formatSize(total)}`}
              </button>
              {!commit.isPending && (
                <button
                  onClick={() => setQueue([])}
                  className="font-mono text-xs text-muted hover:text-ink"
                >
                  clear
                </button>
              )}
              {phase && (
                <span className="font-mono text-[11px] text-muted" aria-live="polite">
                  {phaseLabel(phase)}
                </span>
              )}
            </div>
          </>
        )}

        {commit.isSuccess && queue.length === 0 && (
          <p className="mt-4 border-l-2 border-add bg-add-soft px-3 py-2 font-mono text-xs text-add">
            committed {commit.data.commit.sha.slice(0, 7)} —{" "}
            <a
              href={commit.data.commit.html_url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              view on GitHub
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
