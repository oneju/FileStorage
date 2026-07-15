"use client";

import { basename, formatDate, formatSize, kindOf } from "@/lib/file";
import { listAtPrefix, type GhConfig, type S3Object } from "@/lib/github";
import { useCreateFolder, useLastModified, useTree } from "@/lib/hooks";
import { useState } from "react";

const GLYPH: Record<string, string> = {
  html: "◈",
  image: "◼",
  text: "≡",
  pdf: "▤",
  video: "▶",
  audio: "∿",
  binary: "◻",
};

type Props = {
  cfg: GhConfig;
  prefix: string;
  selected: S3Object | null;
  onOpenPrefix: (p: string) => void;
  onSelect: (o: S3Object) => void;
};

export function ObjectTable({ cfg, prefix, selected, onOpenPrefix, onSelect }: Props) {
  const { data, isLoading, error } = useTree(cfg);
  const objects = data?.objects ?? [];
  const { folders, files } = listAtPrefix(objects, prefix);
  const mtimes = useLastModified(cfg, files);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const mkdir = useCreateFolder(cfg);

  function create() {
    const clean = name.trim().replace(/^\/+|\/+$/g, "");
    if (!clean) return;
    mkdir.mutate(prefix ? `${prefix}/${clean}` : clean, {
      onSuccess: () => {
        setNaming(false);
        setName("");
      },
    });
  }

  if (isLoading) {
    return <p className="px-4 py-6 font-mono text-xs text-muted">listing objects…</p>;
  }
  if (error) {
    return (
      <p className="border-l-2 border-warn bg-panel px-4 py-3 font-mono text-xs text-warn">
        {(error as Error).message}
      </p>
    );
  }

  const empty = folders.length === 0 && files.length === 0;

  return (
    <div className="border border-rule bg-panel">
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-2.5">
        <p className="font-mono text-xs text-muted">
          Objects ({files.length})
          {folders.length > 0 && ` · ${folders.length} prefix${folders.length === 1 ? "" : "es"}`}
        </p>
        <div className="flex items-baseline gap-3">
          {data?.truncated && (
            <p className="font-mono text-[11px] text-warn">tree truncated by the API</p>
          )}
          {naming ? (
            <span className="flex items-baseline gap-2">
              <input
                autoFocus
                value={name}
                placeholder="folder name"
                disabled={mkdir.isPending}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") setNaming(false);
                }}
                className="w-32 border-b border-rule bg-transparent py-0.5 font-mono text-xs outline-none focus:border-ink"
              />
              <button
                onClick={create}
                disabled={mkdir.isPending}
                className="font-mono text-xs text-add hover:underline disabled:opacity-40"
              >
                {mkdir.isPending ? "creating…" : "create"}
              </button>
              <button
                onClick={() => setNaming(false)}
                className="font-mono text-xs text-muted hover:text-ink"
              >
                cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setNaming(true)}
              className="font-mono text-xs text-muted hover:text-ink"
            >
              + folder
            </button>
          )}
        </div>
      </header>

      {mkdir.error && (
        <p className="border-b border-rule px-4 py-2 font-mono text-xs text-warn">
          {(mkdir.error as Error).message}
        </p>
      )}

      {empty ? (
        <p className="px-4 py-10 text-center text-sm text-muted">
          This prefix is empty. Upload an object to create it.
        </p>
      ) : (
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-rule font-mono text-[11px] uppercase tracking-wider text-muted">
              <th className="w-[46%] px-4 py-2 font-normal">Name</th>
              <th className="w-[14%] px-2 py-2 font-normal">Type</th>
              <th className="hidden w-[26%] px-2 py-2 font-normal sm:table-cell">Last modified</th>
              <th className="w-[14%] px-4 py-2 text-right font-normal">Size</th>
            </tr>
          </thead>
          <tbody>
            {folders.map((f) => (
              <tr
                key={f.prefix}
                onClick={() => onOpenPrefix(f.prefix)}
                className="cursor-pointer border-b border-rule/60 hover:bg-paper"
              >
                <td className="px-4 py-2">
                  <span className="flex items-baseline gap-2">
                    <span aria-hidden className="font-mono text-xs text-muted">
                      ▸
                    </span>
                    <span className="truncate font-mono text-[13px] underline underline-offset-4">
                      {f.name}/
                    </span>
                  </span>
                </td>
                <td className="px-2 py-2 font-mono text-xs text-muted">Folder</td>
                <td className="hidden px-2 py-2 font-mono text-xs text-muted sm:table-cell">—</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-muted">
                  {f.count} obj
                </td>
              </tr>
            ))}

            {files.map((o) => {
              const active = selected?.path === o.path;
              const mtime = mtimes.get(o.sha);
              return (
                <tr
                  key={o.sha + o.path}
                  onClick={() => onSelect(o)}
                  className={`cursor-pointer border-b border-rule/60 ${
                    active ? "bg-add-soft/60" : "hover:bg-paper"
                  }`}
                >
                  <td className="px-4 py-2">
                    <span className="flex items-baseline gap-2">
                      <span aria-hidden className="font-mono text-xs text-muted">
                        {GLYPH[kindOf(o.key)]}
                      </span>
                      <span className="truncate font-mono text-[13px]">{basename(o.key)}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-muted">{kindOf(o.key)}</td>
                  <td className="hidden px-2 py-2 font-mono text-xs text-muted sm:table-cell">
                    {mtime === undefined ? (
                      <span className="text-rule">···</span>
                    ) : mtime === null ? (
                      "—"
                    ) : (
                      formatDate(mtime)
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted">
                    {formatSize(o.size)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
