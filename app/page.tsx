"use client";

import { useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ObjectPanel } from "@/components/ObjectPanel";
import { ObjectTable } from "@/components/ObjectTable";
import { PrefixTree } from "@/components/PrefixTree";
import { Settings } from "@/components/Settings";
import { Uploader } from "@/components/Uploader";
import { isConfigured, type S3Object } from "@/lib/github";
import { useHydrated } from "@/lib/hooks";
import { useConfig } from "@/lib/store";

export default function Page() {
  const hydrated = useHydrated();
  const cfg = useConfig();
  const [prefix, setPrefix] = useState("");
  const [selected, setSelected] = useState<S3Object | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  if (!hydrated) return null;
  const ready = isConfigured(cfg);

  function openPrefix(p: string) {
    setPrefix(p);
    setSelected(null);
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {ready && <PrefixTree cfg={cfg} prefix={prefix} onOpen={openPrefix} />}

      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-4 border-b border-rule bg-panel px-6 py-3">
          {ready ? (
            <Breadcrumb cfg={cfg} prefix={prefix} onOpen={openPrefix} />
          ) : (
            <h1 className="font-mono text-sm font-medium">drop</h1>
          )}
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="shrink-0 font-mono text-xs text-muted hover:text-ink"
          >
            {showSettings ? "hide bucket" : "bucket"}
          </button>
        </header>

        <div className="mx-auto max-w-4xl space-y-4 p-6">
          {(showSettings || !ready) && (
            <Settings cfg={cfg} onClose={() => setShowSettings(false)} />
          )}

          {ready && (
            <>
              <Uploader cfg={cfg} prefix={prefix} />
              <ObjectTable
                cfg={cfg}
                prefix={prefix}
                selected={selected}
                onOpenPrefix={openPrefix}
                onSelect={setSelected}
              />
              {selected && (
                <ObjectPanel cfg={cfg} object={selected} onClosed={() => setSelected(null)} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
