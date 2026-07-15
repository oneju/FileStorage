const API = "https://api.github.com";

export type GhConfig = {
  owner: string;
  repo: string;
  branch: string;
  dir: string;
  token: string;
};

/** One object in the bucket. `key` is relative to cfg.dir, the way an S3 key is relative to the bucket. */
export type S3Object = {
  key: string;
  path: string;
  sha: string;
  size: number;
};

export type Listing = {
  objects: S3Object[];
  truncated: boolean;
};

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GitHubError";
  }
}

/**
 * GitHub answers an unauthorised write with 404, not 403 — a 403 would confirm
 * the resource exists to someone who isn't allowed to know. The upshot is that
 * "Not Found" means "missing OR you lack permission", and the bare message is
 * useless on its own. Say which call failed and what both branches imply.
 */
function explain(err: unknown, step: string, cfg: GhConfig): Error {
  if (!(err instanceof GitHubError)) return err as Error;
  if (err.status === 404) {
    return new GitHubError(
      404,
      `${step} returned 404. Either it doesn't exist, or the token can't write to ${cfg.owner}/${cfg.repo}. Check that the token grants Contents: Read and write on this specific repo, and that the branch "${cfg.branch}" exists.`,
    );
  }
  if (err.status === 401) {
    return new GitHubError(401, `${step}: the token is invalid or expired.`);
  }
  if (err.status === 409) {
    return new GitHubError(409, `${step}: the branch moved while committing. Refresh and retry.`);
  }
  return new GitHubError(err.status, `${step}: ${err.message}`);
}

function encodePath(path: string) {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

async function gh<T>(url: string, cfg: GhConfig, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new GitHubError(res.status, body?.message ?? res.statusText);
  }
  return (await res.json()) as T;
}

export function isConfigured(cfg: GhConfig) {
  return Boolean(cfg.owner && cfg.repo && cfg.token);
}

export function bucketUri(cfg: GhConfig, prefix = "") {
  return `${cfg.owner}/${cfg.repo}/${cfg.dir}${prefix ? "/" + prefix : ""}`;
}

export function rawUrl(cfg: GhConfig, obj: S3Object) {
  return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${encodePath(obj.path)}?v=${obj.sha.slice(0, 7)}`;
}

/**
 * github.com renders. raw.githubusercontent.com does not, and never will —
 * it serves every file as text/plain with nosniff, because a domain that let
 * you upload arbitrary HTML and have browsers execute it would be a hole in
 * GitHub, not a feature. So raw is for bytes (previews, embedding) and blob is
 * for reading.
 */
export function blobUrl(cfg: GhConfig, obj: S3Object) {
  return `https://github.com/${cfg.owner}/${cfg.repo}/blob/${cfg.branch}/${encodePath(obj.path)}`;
}

/**
 * The URL a stranger can open. Only exists for objects under public/, because
 * that is the one directory `output: export` copies into the build — and being
 * in the build is what gets a file served with a real Content-Type instead of
 * raw's text/plain. Null means the object is committed but not published.
 */
export function pagesUrl(cfg: GhConfig, obj: S3Object): string | null {
  const m = obj.path.match(/^public\/(.+)$/);
  if (!m) return null;
  const host = `https://${cfg.owner.toLowerCase()}.github.io`;
  const isUserSite = cfg.repo.toLowerCase() === `${cfg.owner.toLowerCase()}.github.io`;
  const base = isUserSite ? host : `${host}/${cfg.repo}`;
  return `${base}/${m[1].split("/").map(encodeURIComponent).join("/")}`;
}

export function historyUrl(cfg: GhConfig, obj: S3Object) {
  return `https://github.com/${cfg.owner}/${cfg.repo}/commits/${cfg.branch}/${encodePath(obj.path)}`;
}

type TreeEntry = { path: string; type: "blob" | "tree"; sha: string; size?: number };

/**
 * The whole bucket in one request. The Contents API needs a GET per directory;
 * the Git Trees API returns every blob with its sha and size in a single call,
 * so prefix navigation costs nothing after this.
 */
export async function listTree(cfg: GhConfig): Promise<Listing> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`;
  const res = await gh<{ tree: TreeEntry[]; truncated: boolean }>(url, cfg);
  const root = cfg.dir.replace(/^\/+|\/+$/g, "");
  const prefix = root ? root + "/" : "";
  const objects = res.tree
    .filter((e) => e.type === "blob" && e.path.startsWith(prefix))
    .map((e) => ({
      key: e.path.slice(prefix.length),
      path: e.path,
      sha: e.sha,
      size: e.size ?? 0,
    }))
    .filter((o) => o.key && !o.key.endsWith(".gitkeep"))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { objects, truncated: res.truncated };
}

/**
 * S3's delimiter listing, done locally. Everything under `prefix` collapses
 * into common prefixes (folders) plus the objects sitting directly in it.
 */
export function listAtPrefix(objects: S3Object[], prefix: string) {
  const p = prefix ? prefix.replace(/\/*$/, "/") : "";
  const inScope = objects.filter((o) => o.key.startsWith(p));
  const folders = new Map<string, { count: number; size: number }>();
  const files: S3Object[] = [];

  for (const o of inScope) {
    const rest = o.key.slice(p.length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      files.push(o);
    } else {
      const name = rest.slice(0, slash);
      const agg = folders.get(name) ?? { count: 0, size: 0 };
      agg.count += 1;
      agg.size += o.size;
      folders.set(name, agg);
    }
  }
  return {
    folders: [...folders.entries()]
      .map(([name, agg]) => ({ name, prefix: p + name, ...agg }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    files,
  };
}

/**
 * git stores no per-file mtime. S3 hands you LastModified for free; here it has
 * to be derived from the commit that last touched the path, which is one request
 * per object. Keyed on the blob sha so it caches forever: same sha, same commit.
 */
export async function lastModified(cfg: GhConfig, path: string): Promise<string | null> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(cfg.branch)}&per_page=1`;
  const commits = await gh<{ commit: { committer: { date: string } } }[]>(url, cfg);
  return commits[0]?.commit.committer.date ?? null;
}

export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Couldn't read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export type CommitResult = { commit: { sha: string; html_url: string } };

export type Upload = { key: string; file: File };
export type CommitPhase =
  | { step: "blobs"; done: number; total: number }
  | { step: "tree" }
  | { step: "commit" }
  | { step: "ref" };

/**
 * Write N objects as ONE commit, using git's own plumbing:
 *
 *   blob* -> tree -> commit -> ref
 *
 * The Contents API can only do one file per call, which means N files is N
 * commits and a half-finished upload leaves the branch in a state nobody asked
 * for. Here nothing is visible until the ref moves, so it either all lands or
 * none of it does. Blobs also go up as their own POST, which lifts the ~1 MB
 * base64-in-JSON ceiling the Contents API imposes.
 */
export async function commitObjects(
  cfg: GhConfig,
  uploads: Upload[],
  message: string,
  onPhase?: (p: CommitPhase) => void,
): Promise<CommitResult> {
  const base = `${API}/repos/${cfg.owner}/${cfg.repo}/git`;
  const root = cfg.dir.replace(/^\/+|\/+$/g, "");

  const at = async <T>(step: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      throw explain(err, step, cfg);
    }
  };

  // Resolve the branch first. If it doesn't exist there is no point uploading
  // megabytes of blobs, and a 404 here has a much narrower meaning than one on a
  // write: reads of a public repo work without any permission at all.
  const ref = await at(`Reading branch "${cfg.branch}"`, () =>
    gh<{ object: { sha: string } }>(`${base}/ref/heads/${encodeURIComponent(cfg.branch)}`, cfg),
  );
  const parent = ref.object.sha;
  const parentCommit = await at("Reading the parent commit", () =>
    gh<{ tree: { sha: string } }>(`${base}/commits/${parent}`, cfg),
  );

  let done = 0;
  onPhase?.({ step: "blobs", done, total: uploads.length });

  const blobs = await at("Writing blobs", () =>
    Promise.all(
      uploads.map(async (u) => {
        const content = await toBase64(u.file);
        const blob = await gh<{ sha: string }>(`${base}/blobs`, cfg, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, encoding: "base64" }),
        });
        done += 1;
        onPhase?.({ step: "blobs", done, total: uploads.length });
        return {
          path: `${root}/${u.key.replace(/^\/+/, "")}`,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.sha,
        };
      }),
    ),
  );

  onPhase?.({ step: "tree" });
  const tree = await at("Building the tree", () =>
    gh<{ sha: string }>(`${base}/trees`, cfg, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: blobs }),
    }),
  );

  onPhase?.({ step: "commit" });
  const commit = await at("Creating the commit", () =>
    gh<{ sha: string; html_url: string }>(`${base}/commits`, cfg, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }),
    }),
  );

  onPhase?.({ step: "ref" });
  await at(`Moving "${cfg.branch}" to the new commit`, () =>
    gh(`${base}/refs/heads/${encodeURIComponent(cfg.branch)}`, cfg, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha }),
    }),
  );

  return { commit };
}

/**
 * git cannot represent an empty directory, so an empty prefix needs a carrier
 * object. The S3 console does the same thing — "create folder" there writes a
 * zero-byte key ending in a slash. Here it is a .gitkeep, hidden from listings.
 */
export async function createFolder(cfg: GhConfig, prefix: string) {
  const clean = prefix.replace(/^\/+|\/+$/g, "");
  const file = new File([""], ".gitkeep", { type: "text/plain" });
  return commitObjects(cfg, [{ key: `${clean}/.gitkeep`, file }], `Create ${cfg.dir}/${clean}/`);
}

export async function deleteObject(cfg: GhConfig, obj: S3Object) {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(obj.path)}`;
  return gh<CommitResult>(url, cfg, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: `Delete ${obj.path}`, sha: obj.sha, branch: cfg.branch }),
  });
}

export type Access = {
  pushReported: boolean | undefined;
  isPrivate: boolean;
  branchExists: boolean;
};

/**
 * Check the two things that actually stop a commit, and don't pretend to know
 * more than the API says.
 *
 * `permissions.push` describes the repository role, not what a fine-grained
 * token was granted, so it can't be read as "this token may write" — treating
 * it that way produced a confident false negative. It stays here as a hint and
 * nothing more. The branch, on the other hand, is the first hard requirement:
 * commitObjects resolves the ref before anything else, and a missing branch is
 * indistinguishable from a permission failure once GitHub masks 403 as 404.
 */
export async function verifyAccess(cfg: GhConfig): Promise<Access> {
  const repo = await gh<{ permissions?: { push?: boolean }; private: boolean }>(
    `${API}/repos/${cfg.owner}/${cfg.repo}`,
    cfg,
  );

  let branchExists = true;
  try {
    await gh(`${API}/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, cfg);
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) branchExists = false;
    else throw err;
  }

  return {
    pushReported: repo.permissions?.push,
    isPrivate: repo.private,
    branchExists,
  };
}
