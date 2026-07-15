"use client";

import type { GhConfig } from "@/lib/github";

export function Breadcrumb({
  cfg,
  prefix,
  onOpen,
}: {
  cfg: GhConfig;
  prefix: string;
  onOpen: (p: string) => void;
}) {
  const parts = prefix.split("/").filter(Boolean);

  return (
    <nav aria-label="Prefix" className="flex flex-wrap items-baseline gap-1 font-mono text-xs">
      <button
        onClick={() => onOpen("")}
        className="text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        {cfg.dir}
      </button>
      {parts.map((part, i) => {
        const target = parts.slice(0, i + 1).join("/");
        const last = i === parts.length - 1;
        return (
          <span key={target} className="flex items-baseline gap-1">
            <span aria-hidden className="text-rule">
              /
            </span>
            {last ? (
              <span className="font-medium">{part}</span>
            ) : (
              <button
                onClick={() => onOpen(target)}
                className="text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
      <span aria-hidden className="text-rule">
        /
      </span>
    </nav>
  );
}
