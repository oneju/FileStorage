# drop

Commit files to a GitHub repo from a static page. No server, no backend.

## How it works

GitHub Pages is static hosting, so there is nothing to POST to. Instead the
browser talks to the GitHub Contents API directly:

```
                       blob  blob  blob        one POST each
                          \   |   /
                           v  v  v
[browser] ---------------> tree ---> commit ---> PATCH ref ---> [main]
                                                                   |
[sidebar + table] <--GET /git/trees/main?recursive=1--------------- |
[preview]         <--raw.githubusercontent.com/.../{key}?v={sha}----+
```

Uploading writes git's plumbing directly: a blob per file, one tree, one commit,
then move the ref. Nothing is visible until that last PATCH, so a queue of files
either all lands or none of it does.

Three decisions worth knowing about:

- **No index.json.** The Git Trees API returns the entire bucket — every blob
  with its sha and size — in one request. Prefix navigation is then pure local
  filtering, so clicking into a folder costs zero requests. There is no index to
  drift out of sync with reality.
- **Preview reads from `raw.githubusercontent.com`, not from the Pages URL.**
  A file committed to `uploads/` is not part of the built site, and even if it
  were, Pages takes ~a minute to redeploy. Raw is live the instant the commit
  lands. The blob SHA rides along as `?v=` because raw sits behind a CDN with a
  ~5 minute TTL.
- **Uploads don't trigger a rebuild.** `deploy.yml` has `paths-ignore: uploads/**`,
  so dropping a file costs zero Actions minutes.
- **Folders are `.gitkeep` carriers.** git can't represent an empty directory, so
  `+ folder` commits a hidden `.gitkeep`. The S3 console does the same thing with
  a zero-byte key. Listings filter it out.

## Where git and S3 disagree

The UI is an object browser, but the store underneath is a git tree. Most of the
mapping is clean, and one part isn't:

| S3 | here |
|---|---|
| Bucket | `owner/repo` at `dir` |
| Key | path relative to `dir` |
| Prefix / delimiter listing | folded from the flat tree, client-side |
| ETag (content hash) | blob SHA (content hash) |
| PutObject | a commit |
| **LastModified** | **not stored** |

git keeps no per-file mtime. A file's "last modified" is a property of history,
not of the file, so it takes one `GET /commits?path=…&per_page=1` per object.
The table fills those in progressively and caches each one against the blob SHA
with no expiry — a sha that hasn't changed cannot have a different last-modified.
If you have hundreds of objects and want the column free, drop it, or maintain a
manifest and accept that it can drift.

## Setup

1. **Create the repo** and push this project to `main`.

2. **Turn on Pages**: Settings → Pages → Source → **GitHub Actions**.

3. **Issue a token**: [Fine-grained PAT](https://github.com/settings/tokens?type=beta)
   → Repository access → **Only select repositories** → pick this one →
   Permissions → Repository permissions → **Contents: Read and write**.
   That is the only permission needed.

4. **Open the site**, click `target`, and fill in owner / repo / branch /
   directory / token.

The token lives in `localStorage` under `gh-file-drop`. It is never committed
and never leaves your browser except to `api.github.com`.

## Local dev

```bash
npm install
npm run dev
```

To test the static output as it will actually be served:

```bash
npm run build && npm run preview
```

## Constraints

| | |
|---|---|
| Max file size | 25 MB. The API allows 100 MB, but base64-in-JSON holds the file in browser memory twice |
| Requests per upload | N blobs + 4. Blobs go up in parallel; the ref moves once |
| Repo visibility | Public. Private repos need a token on the raw URL, which the `<img>` and `<iframe>` tags can't send |
| Rate limit | 5,000 requests/hour with a token |
| Who can upload | Only someone holding a write token — i.e. you |

## If you want more

- **Public uploads** → needs a real backend to hold the token. A Cloudflare
  Worker that proxies the PUT is the smallest version of this.
- **Files served from the Pages URL** → change the directory to `public/uploads`
  and drop the `paths-ignore` from `deploy.yml`. Every upload then triggers a
  redeploy.
