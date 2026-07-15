"use client";

import { listAtPrefix, type GhConfig, type S3Object } from "@/lib/github";
import { useTree } from "@/lib/hooks";

function Branch({
  objects,
  prefix,
  current,
  depth,
  onOpen,
}: {
  objects: S3Object[];
  prefix: string;
  current: string;
  depth: number;
  onOpen: (p: string) => void;
}) {
  const { folders } = listAtPrefix(objects, prefix);
  if (folders.length === 0) return null;

  return (
    <ul>
      {folders.map((f) => {
        const open = current === f.prefix || current.startsWith(f.prefix + "/");
        return (
          <li key={f.prefix}>
            <button
              onClick={() => onOpen(f.prefix)}
              style={{ paddingLeft: `${depth * 12 + 16}px` }}
              className={`flex w-full items-baseline gap-1.5 border-l-2 py-1.5 pr-3 text-left ${
                current === f.prefix
                  ? "border-l-ink bg-add-soft/60"
                  : "border-l-transparent hover:bg-paper"
              }`}
            >
              <span aria-hidden className="font-mono text-[10px] text-muted">
                {open ? "▾" : "▸"}
              </span>
              <span className="truncate font-mono text-[12px]">{f.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{f.count}</span>
            </button>
            {open && (
              <Branch
                objects={objects}
                prefix={f.prefix}
                current={current}
                depth={depth + 1}
                onOpen={onOpen}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PrefixTree({
  cfg,
  prefix,
  onOpen,
}: {
  cfg: GhConfig;
  prefix: string;
  onOpen: (p: string) => void;
}) {
  const { data } = useTree(cfg);
  const objects = data?.objects ?? [];

  return (
    <aside className="w-full shrink-0 border-rule bg-panel md:w-64 md:border-r">
      <header className="border-b border-rule px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Bucket</p>
        <p className="truncate font-mono text-sm font-medium">
          {cfg.owner || "owner"}/{cfg.repo || "repo"}
        </p>
      </header>

      <nav className="py-1">
        <button
          onClick={() => onOpen("")}
          className={`flex w-full items-baseline gap-1.5 border-l-2 py-1.5 pl-4 pr-3 text-left ${
            prefix === "" ? "border-l-ink bg-add-soft/60" : "border-l-transparent hover:bg-paper"
          }`}
        >
          <span aria-hidden className="font-mono text-[10px] text-muted">
            ▾
          </span>
          <span className="truncate font-mono text-[12px] font-medium">{cfg.dir}/</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
            {objects.length}
          </span>
        </button>
        <Branch objects={objects} prefix="" current={prefix} depth={1} onOpen={onOpen} />
      </nav>
    </aside>
  );
}
