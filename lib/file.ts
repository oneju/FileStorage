export type Kind = "image" | "text" | "pdf" | "video" | "audio" | "binary";

const IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"];
const TEXT = [
  "txt", "md", "json", "ts", "tsx", "js", "jsx", "css", "scss", "html", "xml",
  "yml", "yaml", "csv", "toml", "sh", "py", "go", "rs", "java", "sql", "env", "log",
];
const VIDEO = ["mp4", "webm", "mov"];
const AUDIO = ["mp3", "wav", "ogg", "m4a"];

export function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function basename(key: string) {
  const i = key.lastIndexOf("/");
  return i < 0 ? key : key.slice(i + 1);
}

export function kindOf(name: string): Kind {
  const e = ext(name);
  if (IMAGE.includes(e)) return "image";
  if (TEXT.includes(e)) return "text";
  if (e === "pdf") return "pdf";
  if (VIDEO.includes(e)) return "video";
  if (AUDIO.includes(e)) return "audio";
  return "binary";
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * The Git Data API accepts blobs up to 100 MB, but base64-in-JSON from a browser
 * means the whole file sits in memory twice. 25 MB is where that stops being free.
 */
export const MAX_BYTES = 25 * 1024 * 1024;
