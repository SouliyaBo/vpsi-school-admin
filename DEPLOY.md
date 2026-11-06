# Deploying the admin SPA

Target: **`https://vpsischool.com`**. The built files live on the API's EC2 box
in `~/vpsischool-api/admin/`, and the Caddy container there serves them over
HTTPS beside the API at `https://api.vpsischool.com`. Both are described in
[../vpsischool-api/DEPLOY.md](../vpsischool-api/DEPLOY.md) section 8, which has
to have been done once before anything here works.

```text
  browser ──https──► vpsischool.com        caddy ──► ~/vpsischool-api/admin/
        └───https──► api.vpsischool.com    caddy ──► api:3000   (CORS-whitelisted)
```

## Why the files moved off S3

The admin used to be served over plain HTTP from the S3 website endpoint
(`vpsi-school-admin.s3-website-ap-southeast-1.amazonaws.com`). It had to be:
the API was plain HTTP, and an HTTPS page may not call an HTTP API — the
browser blocks it as mixed content, silently. With the domain, both halves get
HTTPS at once from the same Caddy, which costs nothing and needs no CloudFront,
no ACM certificate and no AWS profile to deploy.

Since 6 Nov 2026 the bucket's website configuration is a single
`RedirectAllRequestsTo` `https://vpsischool.com`, path kept, so an old bookmark
lands on the same page here. The files still in it are unused. The bucket and
the `vpsi` profile ([deploy-user-policy.json](deploy-user-policy.json)) are kept
only for that redirect; once nobody arrives through it, the bucket can be emptied
and deleted, and the `vpsi-admin-deploy` IAM user with it.

---

## 1. Build

```bash
cd vpsischool-admin
cat .env            # VITE_API_BASE_URL must be https://api.vpsischool.com/api/v1
npm run build       # prebuild bumps the patch version in package.json
```

`VITE_*` values are compiled **into** the bundle. Pointing the admin somewhere
else is a rebuild, never an edit on the server.

`npm run build:norelease` does the same without the version bump — use it for a
re-upload of a release that already has a number.

The result is `dist/`: `index.html`, `favicon.svg` and `assets/`. Roughly 15 MB,
about half of which is `.map` files, which are not uploaded.

## 2. Upload

```bash
./deploy.sh
```

[deploy.sh](deploy.sh) builds, then rsyncs `dist/` into `~/vpsischool-api/admin/`
over SSH with the same key as the API (`../vpsi-api.pem`), and checks that the
site is really serving the build that was just made. It asks before uploading;
`--yes` skips that, `--skip-build` uploads the `dist/` already there, and
`--no-release` builds without bumping the version. `VPSI_HOST=ubuntu@<ip>`
overrides the SSH host, which is `api.vpsischool.com` by default.

What it does, by hand:

```bash
rsync -a --exclude '*.map' -e "ssh -i ../vpsi-api.pem" \
  dist/assets/ ubuntu@api.vpsischool.com:vpsischool-api/admin/assets/
rsync -a -e "ssh -i ../vpsi-api.pem" \
  dist/index.html dist/favicon.svg ubuntu@api.vpsischool.com:vpsischool-api/admin/
```

Assets first, `index.html` last, so the page is never pointed at a chunk that is
not there yet. Nothing is reloaded — the folder is mounted into Caddy, which
serves the new files on the next request.

**No `--delete`.** It would clear the previous build's assets out from under
anyone who has the page open, and they are what makes a rollback possible. The
folder grows by a few MB a release; that is the trade.

**Caching** is set by the Caddyfile, not here: `/assets/*` (content-hashed names)
is cached for a year, everything else — `index.html` above all — is `no-cache`,
so a release reaches everybody on their next load.

## 3. Check it

Open `https://vpsischool.com`. The login screen is Lao, and the school name comes
from `VITE_SCHOOL_NAME_LO`, which proves the built env was the right one.

Then, with devtools open on the Network tab:

1. Log in. The request goes to `https://api.vpsischool.com/api/v1/auth/login`.
2. Open a page below the root — `/students` — then **refresh it**. Still the app,
   not a 404: Caddy's `try_files` hands every unknown path to `index.html`.
3. Open a student photo. A broken image here is `vpsi-school-images` — the
   signed URL, its 900-second TTL, or the S3 credentials — not this deploy.

Every request failing at once while the API logs show nothing is CORS: the API's
`CORS_ORIGINS` must contain `https://vpsischool.com` exactly — scheme, no
trailing slash — and changing it needs the container recreated
(`up -d --no-build --force-recreate api`), not restarted.

A blank white page with `Failed to load module script` in the console means an
`index.html` reached the server without its `assets/`. Run `./deploy.sh
--skip-build` again.

## Rolling back

Keep the previous `dist/` (or rebuild the previous version) and upload its
`index.html` alone — the old asset files are still on the server under their own
hashes, which is exactly why nothing is deleted on upload.
