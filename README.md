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
- **The bucket root lives inside `public/`.** That is the only directory
  `output: export` copies into the build, and being in the build is what gets a
  file served by Pages with a real Content-Type. An `.html` under `public/`
  opens as a page; the same file served from raw is `text/plain` forever, because
  a domain that let anyone upload executable HTML would be a hole in GitHub. Move
  the bucket root outside `public/` and objects still commit — they just stop
  being publishable, and the panel says so.
- **Two URLs, two jobs.** Previews read `raw.githubusercontent.com` because it
  is live the instant the commit lands, with the blob SHA as `?v=` to defeat the
  ~5 minute CDN TTL. The shareable link is the Pages URL, which appears ~1–2
  minutes later once Actions redeploys.
- **Uploads trigger a rebuild.** That is the point — Pages has to republish for
  the file to be reachable. Actions is free on public repos, so this costs time,
  not money.
- **Folders are `.gitkeep` carriers.** git can't represent an empty directory, so
  `+ folder` commits a hidden `.gitkeep`. The S3 console does the same thing with
  a zero-byte key. Listings filter it out.

## Where git and S3 disagree

The UI is an object browser, but the store underneath is a git tree. Most of the
mapping is clean, and one part isn't:

| S3                         | here                                   |
| -------------------------- | -------------------------------------- |
| Bucket                     | `owner/repo` at `dir`                  |
| Key                        | path relative to `dir`                 |
| Prefix / delimiter listing | folded from the flat tree, client-side |
| ETag (content hash)        | blob SHA (content hash)                |
| PutObject                  | a commit                               |
| **LastModified**           | **not stored**                         |

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

|                       |                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Max file size         | 25 MB. The API allows 100 MB, but base64-in-JSON holds the file in browser memory twice             |
| Requests per upload   | N blobs + 4. Blobs go up in parallel; the ref moves once                                            |
| Repo visibility       | Public. Private repos need a token on the raw URL, which the `<img>` and `<iframe>` tags can't send |
| Time to a public link | ~1–2 min after commit, once the Actions deploy finishes                                             |
| Rate limit            | 5,000 requests/hour with a token                                                                    |
| Who can upload        | Only someone holding a write token — i.e. you                                                       |
