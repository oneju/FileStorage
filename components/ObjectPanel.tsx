"use client";

import { useEffect, useState } from "react";
import { basename, formatDate, formatSize, kindOf } from "@/lib/file";
import { blobUrl, historyUrl, rawUrl, type GhConfig, type S3Object } from "@/lib/github";
import { useDelete, useLastModified } from "@/lib/hooks";

export function ObjectPanel({
  cfg,
  object,
  onClosed,
}: {
  cfg: GhConfig;
  object: S3Object;
  onClosed: () => void;
}) {
  const url = rawUrl(cfg, object);
  const kind = kindOf(object.key);
  const del = useDelete(cfg);
  const mtime = useLastModified(cfg, [object]).get(object.sha);
  const [copied, setCopied] = useState(false);

  const props: [string, React.ReactNode][] = [
    ["Key", object.key],
    ["Size", formatSize(object.size)],
    ["Type", kind],
    ["Last modified", mtime ? formatDate(mtime) : "—"],
    ["ETag", <span key="etag">{object.sha}</span>],
  ];

  return (
    <section className="border border-rule bg-panel">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
        <p className="min-w-0 truncate font-mono text-sm font-medium">{basename(object.key)}</p>
        <div className="flex shrink-0 items-center gap-3 font-mono text-xs">
          <button
            onClick={() => {
              navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            className="underline underline-offset-2"
          >
            {copied ? "copied" : "copy url"}
          </button>
          <a
            href={blobUrl(cfg, object)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            open
          </a>
          <a
            href={historyUrl(cfg, object)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            history
          </a>
          <button
            onClick={() => {
              if (confirm(`Delete ${object.key}?`)) del.mutate(object, { onSuccess: onClosed });
            }}
            className="text-warn hover:underline"
          >
            {del.isPending ? "deleting…" : "delete"}
          </button>
          <button onClick={onClosed} aria-label="Close" className="text-muted hover:text-ink">
            ×
          </button>
        </div>
      </header>

      <dl className="grid gap-x-6 gap-y-2 border-b border-rule px-4 py-3 sm:grid-cols-2">
        {props.map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-baseline gap-2">
            <dt className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted">
              {label}
            </dt>
            <dd className="min-w-0 truncate font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="p-4">
        <Body kind={kind} url={url} name={basename(object.key)} />
      </div>
    </section>
  );
}

function Body({ kind, url, name }: { kind: string; url: string; name: string }) {
  if (kind === "image") {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={url} alt={name} className="mx-auto max-h-[26rem] object-contain" />;
  }
  if (kind === "pdf") {
    return <iframe src={url} title={name} className="h-[30rem] w-full border border-rule" />;
  }
  if (kind === "video") {
    return <video src={url} controls className="mx-auto max-h-[26rem] w-full" />;
  }
  if (kind === "audio") return <audio src={url} controls className="w-full" />;
  if (kind === "text") return <TextBody url={url} />;
  return (
    <p className="py-6 text-center text-sm text-muted">
      No inline preview for this type.{" "}
      <a href={url} download={name} className="text-ink underline underline-offset-4">
        Download it
      </a>
      .
    </p>
  );
}

function TextBody({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setText(null);
    setFailed(false);
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => alive && setText(t))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [url]);

  if (failed)
    return <p className="font-mono text-xs text-warn">Couldn&apos;t fetch the raw bytes.</p>;
  if (text === null) return <p className="font-mono text-xs text-muted">loading…</p>;
  return (
    <pre className="max-h-[26rem] overflow-auto bg-paper p-3 font-mono text-xs leading-relaxed">
      {text}
    </pre>
  );
}
