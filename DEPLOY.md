# Deploying the admin SPA to S3

Target: the bucket **`vpsi-school-admin`**, `ap-southeast-1`, account
`020429478361`, served by S3's own static website hosting over plain HTTP. The
API it talks to is the EC2 box in [../vpsischool-api/DEPLOY.md](../vpsischool-api/DEPLOY.md).

```text
  browser ──http──► vpsi-school-admin.s3-website-ap-southeast-1.amazonaws.com
                    (static files only)
        └───────http──► 3.26.219.236:3000/api/v1   (the API, CORS-whitelisted)
```

There are two ways through: the terminal (below) or the Console (further down).
They do the same thing; take whichever you would rather look at.

---

## 0. The `vpsi` profile — set up once, then never thought about

`aws` on this machine defaults to account **211125529137**. The school's account
is **020429478361**. Nothing warns about the mismatch: a `sync` just fails with
`AccessDenied` on a bucket that is plainly there in the Console.

The fix is a named profile of its own, holding an IAM user that can reach this
one bucket and nothing else. Two reasons to do it this way rather than reaching
for the keys in `vpsischool-api/.env`: those are the account's **root** keys, so
a deploy script that goes wrong can do anything to anything; and a profile ends
the "which account am I in" question permanently.

### Create the user (once, and it needs root — so use the Console or the root
keys for these four commands only)

```bash
cd ~/Desktop/VPSI-SCHOOL

# root, borrowed for the length of these four commands
export AWS_ACCESS_KEY_ID=$(grep '^S3_ACCESS_KEY=' vpsischool-api/.env | cut -d= -f2)
export AWS_SECRET_ACCESS_KEY=$(grep '^S3_SECRET_KEY=' vpsischool-api/.env | cut -d= -f2-)
export AWS_DEFAULT_REGION=ap-southeast-1
aws sts get-caller-identity                      # 020429478361, .../root

aws iam create-user --user-name vpsi-admin-deploy

aws iam put-user-policy --user-name vpsi-admin-deploy \
  --policy-name vpsi-admin-bucket \
  --policy-document file://vpsischool-admin/deploy-user-policy.json

aws iam create-access-key --user-name vpsi-admin-deploy
```

The policy is [deploy-user-policy.json](deploy-user-policy.json), kept in the
repo so the next person can read what this user is allowed to do: configure and
write to `vpsi-school-admin`, and nothing else in the account. Not
`vpsi-school-images` — the school's photos are not this user's business.

`create-access-key` prints the secret **once**, and never again.

### Hand the keys to a profile

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY    # put root down again

aws configure --profile vpsi
#   AWS Access Key ID     → the AccessKeyId just printed
#   AWS Secret Access Key → the SecretAccessKey just printed
#   Default region name   → ap-southeast-1
#   Default output format → json

aws sts get-caller-identity --profile vpsi       # .../vpsi-admin-deploy
```

### Using it

```bash
export AWS_PROFILE=vpsi        # once per terminal tab
```

or `--profile vpsi` on each command. Everything below assumes one or the other.
If a command returns `AccessDenied`, check `aws sts get-caller-identity` before
changing anything else — it is nearly always this.

### Still to do, separately

The **API's** own keys, in `.env` here and in `.env.production` on the EC2 box,
are also root. They want the same treatment: a `vpsi-api` user scoped to
`vpsi-school-images`, new keys into both files, then a container restart. That
is a live-service change, so it is its own job rather than a step in this one.

---

## Why HTTP, and why not CloudFront yet

The API is plain HTTP on port 3000. A page served over **HTTPS** may not call an
**HTTP** API — the browser blocks it as mixed content, silently, with nothing in
the UI to explain why. So the admin has to be served over HTTP too, which is
what the S3 *website endpoint* does, and putting CloudFront in front of it now
would break every request the moment it issued a certificate.

This is a testing arrangement, not a go-live one: the login request and every
bearer token after it cross the network in the clear. Fixing it properly means a
domain name, then TLS on both sides at once — an ACM certificate on CloudFront
for this bucket, and an ALB or Caddy in front of the API. Neither half works
alone.

---

## 1. Build

```bash
cd vpsischool-admin
cat .env            # VITE_API_BASE_URL must be http://3.26.219.236:3000/api/v1
npm run build       # prebuild bumps the patch version in package.json
```

`VITE_*` values are compiled **into** the bundle. Pointing the admin somewhere
else is a rebuild, never an edit on the bucket.

`npm run build:norelease` does the same without the version bump — use it for a
re-upload of a release that already has a number.

The result is `dist/`: `index.html`, `favicon.svg` and `assets/`. Roughly 15 MB,
about half of which is `.map` files — see step 3.

## 2. Bucket settings (once)

### From the terminal

Three calls, each safe to repeat:

```bash
# SPA routing: every unknown path serves the app, not a 404
aws s3api put-bucket-website --bucket vpsi-school-admin \
  --website-configuration '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"index.html"}}'

# let a bucket policy make objects public
aws s3api put-public-access-block --bucket vpsi-school-admin \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# read the files, and nothing else
aws s3api put-bucket-policy --bucket vpsi-school-admin --policy '{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadForWebsite",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::vpsi-school-admin/*"
  }]
}'
```

Then read them back — `put` succeeds on a bucket that is still blocked:

```bash
aws s3api get-bucket-website --bucket vpsi-school-admin
aws s3api get-bucket-policy --bucket vpsi-school-admin
```

### From the Console

Console → **S3** → `vpsi-school-admin`.

**Properties → Static website hosting** — Enable, and set **both** boxes:

| Field | Value |
| --- | --- |
| Index document | `index.html` |
| Error document | `index.html` |

The error document is not a nicety. The admin is a single-page app: every route
below `/` — `/students`, `/teaching-observations` — is a path S3 has no object
for. Without the error document, a refresh on any page but the root returns 404;
with it, S3 serves the app and the router reads the path itself.

Note the **Bucket website endpoint** printed under that panel. It is the URL
staff use, and it is the origin the API must whitelist in step 4.

**Permissions → Block public access** — all four boxes off.

**Permissions → Bucket policy** — this is the piece that was missing:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadForWebsite",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::vpsi-school-admin/*"
    }
  ]
}
```

`"Principal": "*"` with `s3:GetObject` only. Anonymous visitors may read the
files and nothing else — no listing, no writing. Uploads keep going through the
console as a signed-in user.

This bucket is the built SPA and nothing else. The school's photos and documents
live in `vpsi-school-images`, which stays **private** — its access mechanism is
the signed URLs the API mints, and a public bucket would make them pointless.

## 3. Upload

### From the terminal

```bash
cd ~/Desktop/VPSI-SCHOOL/vpsischool-admin

# hashed filenames, so they can be cached forever
aws s3 sync dist/assets/ s3://vpsi-school-admin/assets/ \
  --exclude "*.map" \
  --cache-control "public, max-age=31536000, immutable"

# the two files that keep their names must never be served stale
aws s3 cp dist/index.html s3://vpsi-school-admin/index.html --cache-control "no-cache"
aws s3 cp dist/favicon.svg s3://vpsi-school-admin/favicon.svg --cache-control "no-cache"
```

**No `--delete`.** It would clear the previous build's assets out from under
anyone who has the page open, and they are what makes a rollback possible. The
bucket grows by a few MB a release; that is the trade.

`--exclude "*.map"` leaves out 106 source maps, about half the upload. They are
read only when somebody opens devtools, and they publish the readable source of
the whole admin.

### From the Console

Console → `vpsi-school-admin` → **Upload**.

- **Add files** → everything at the top of `dist/` (`index.html`, `favicon.svg`)
- **Add folder** → `dist/assets`

Drag `dist/assets` as a *folder* so the keys land as `assets/index-<hash>.js`.
Uploading the files loose puts them at the root, where `index.html` will not
find them and the screen stays blank.

Filenames carry a content hash, so a new upload never overwrites the old
bundle's assets — only `index.html` is replaced, and it is what points at the new
hashes. **Do not tick "Delete existing objects"**: a viewer who has the page open
is still loading chunks from the previous build.

Optional, under **Properties → Metadata** during the upload: set
`Cache-Control: no-cache` on `index.html` and `Cache-Control: public, max-age=31536000, immutable`
on the contents of `assets/`. Hashed filenames make the long cache safe, and
`index.html` is the one file that must never be served stale.

The `.map` files may be left out — 106 of them, about half the upload. They are
only read when someone opens devtools, and they publish the readable source of
the whole admin. Skipping them costs nothing but a less readable stack trace.
(`sourcemap: true` in `vite.config.ts` is what produces them.)

## 4. Whitelist the origin on the API

The API rejects a browser request from an origin it does not know, and
`CORS_ORIGINS` on the box still names the **old** bucket. On the server:

```bash
ssh -i vpsi-api.pem ubuntu@3.26.219.236
cd ~/vpsischool-api
grep CORS_ORIGINS .env.production
```

It must contain the website endpoint exactly — scheme, no trailing slash:

```
CORS_ORIGINS=http://vpsi-school-admin.s3-website-ap-southeast-1.amazonaws.com
```

Then restart, with `--env-file` as every compose command here needs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart api
```

A wrong or missing origin looks like every request failing at once while the API
logs show nothing — the browser never sends the call.

## 5. Check it

Open the website endpoint. The login screen is Lao, and the school name comes
from `VITE_SCHOOL_NAME_LO`, which proves the built env was the right one.

Then, with devtools open on the Network tab:

1. Log in. The request goes to `http://3.26.219.236:3000/api/v1/auth/login`.
2. A page below the root — `/students` — then **refresh it**. Still the app, not
   a 404: that is the error document doing its job.
3. Open a student photo. A broken image here is `vpsi-school-images`, not this
   bucket — the signed URL, its 900-second TTL, or the S3 credentials.

A blank white page with `Failed to load module script` in the console means the
`assets/` folder did not land as a folder. Re-upload it.

---

## Deploying a change

```bash
./deploy.sh
```

[deploy.sh](deploy.sh) is steps 0, 1 and 3 with the checks that are easy to
forget: that the shell is on the school's account rather than the default one,
which API the bundle was built against, and — afterwards — that the site is
really serving the build that was just made. It asks before uploading;
`--yes` skips that, `--skip-build` uploads the `dist/` already there, and
`--no-release` builds without bumping the version.

By hand it is the credentials, the build and the upload. The bucket settings and
the CORS line stay as they are.

```bash
export AWS_PROFILE=vpsi
aws sts get-caller-identity        # .../vpsi-admin-deploy

cd ~/Desktop/VPSI-SCHOOL/vpsischool-admin
npm run build
aws s3 sync dist/assets/ s3://vpsi-school-admin/assets/ --exclude "*.map" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 cp dist/index.html s3://vpsi-school-admin/index.html --cache-control "no-cache"
```

There is no rollback here beyond keeping the previous `dist/` on your machine
and re-uploading its `index.html` — the old asset files are still in the bucket
under their own hashes, which is exactly why nothing is deleted on upload.
