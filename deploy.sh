#!/usr/bin/env bash
#
# Build the admin SPA and ship it to the S3 website bucket.
#
#   ./deploy.sh                 build (bumps the patch version) and upload
#   ./deploy.sh --no-release    build without bumping the version
#   ./deploy.sh --skip-build    upload the dist/ that is already there
#   ./deploy.sh --yes           do not ask before uploading
#
# The long-form reasoning behind each step is in DEPLOY.md. This script is the
# same steps with the checks that are easy to forget: that the shell is pointed
# at the school's AWS account and not another one, that the build is aimed at
# the right API, and that what the bucket serves afterwards is what was just
# built.
set -euo pipefail

BUCKET=vpsi-school-admin
PROFILE=${AWS_PROFILE:-vpsi}
ACCOUNT=020429478361
REGION=ap-southeast-1
SITE="http://${BUCKET}.s3-website-${REGION}.amazonaws.com"
EXPECTED_API=http://3.26.219.236:3000/api/v1

release=true
build=true
assume_yes=false
for arg in "$@"; do
  case "$arg" in
    --no-release) release=false ;;
    --skip-build) build=false ;;
    --yes|-y)     assume_yes=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# ── Who am I ────────────────────────────────────────────────────────────────
# First, because the failure it prevents is the confusing one: the default
# profile on this machine is a different AWS account, and a sync run under it
# fails with AccessDenied on a bucket that is plainly there in the Console.
say "1/5  checking the AWS profile"
export AWS_PROFILE=$PROFILE
if ! identity=$(aws sts get-caller-identity --output json 2>&1); then
  fail "profile '$PROFILE' does not work:
$identity

  aws configure --profile $PROFILE      # see DEPLOY.md section 0"
fi
account=$(printf '%s' "$identity" | sed -n 's/.*"Account": "\([0-9]*\)".*/\1/p')
[ "$account" = "$ACCOUNT" ] || fail "profile '$PROFILE' is account $account, not the school's $ACCOUNT"
printf '     %s\n' "$(printf '%s' "$identity" | sed -n 's/.*"Arn": "\(.*\)".*/\1/p')"

# ── What will it talk to ────────────────────────────────────────────────────
# VITE_* values are compiled into the bundle, so this is decided now and cannot
# be corrected on the bucket afterwards.
say "2/5  checking which API this build will point at"
api=$(sed -n 's/^VITE_API_BASE_URL=//p' .env 2>/dev/null | head -1)
[ -n "$api" ] || fail "VITE_API_BASE_URL is not set in .env"
printf '     %s\n' "$api"
if [ "$api" != "$EXPECTED_API" ]; then
  printf '     \033[33mnote: DEPLOY.md expects %s\033[0m\n' "$EXPECTED_API"
fi

# ── Build ───────────────────────────────────────────────────────────────────
if $build; then
  if $release; then
    say "3/5  building (the prebuild step bumps the patch version)"
    npm run build
  else
    say "3/5  building without a version bump"
    npm run build:norelease
  fi
else
  say "3/5  skipping the build, using the dist/ that is here"
fi

[ -f dist/index.html ] || fail "dist/index.html is missing — run without --skip-build"
entry=$(sed -n 's/.*src="\/assets\/\(index-[^"]*\.js\)".*/\1/p' dist/index.html | head -1)
[ -n "$entry" ] || fail "cannot find the entry script in dist/index.html"
version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' package.json | head -1)
printf '     version %s, entry %s\n' "$version" "$entry"

# ── Confirm ─────────────────────────────────────────────────────────────────
if ! $assume_yes; then
  printf '\nUpload to %s? [y/N] ' "$BUCKET"
  read -r reply
  case "$reply" in [yY]*) ;; *) echo "stopped."; exit 1 ;; esac
fi

# ── Upload ──────────────────────────────────────────────────────────────────
# No --delete: the previous build's assets are what a viewer with the page open
# is still loading, and what a rollback re-points index.html at. The bucket
# grows by a few MB a release; that is the trade.
say "4/5  uploading"
aws s3 sync dist/assets/ "s3://$BUCKET/assets/" \
  --exclude "*.map" \
  --cache-control "public, max-age=31536000, immutable" \
  --only-show-errors

# Named files, so they must never be served stale. Uploaded after the assets
# they reference, so the page is never pointed at a chunk that is not there yet.
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "no-cache" --only-show-errors
aws s3 cp dist/favicon.svg "s3://$BUCKET/favicon.svg" \
  --cache-control "no-cache" --only-show-errors
printf '     done\n'

# ── Check ───────────────────────────────────────────────────────────────────
say "5/5  checking what the site serves now"
served=$(curl -fsS "$SITE" | sed -n 's/.*src="\/assets\/\(index-[^"]*\.js\)".*/\1/p' | head -1)
if [ "$served" = "$entry" ]; then
  printf '     \033[32mlive: %s\033[0m\n' "$entry"
else
  fail "the site is still serving $served, not $entry
     S3 is eventually consistent — wait a moment and reload. If it persists,
     check that index.html went up with Cache-Control: no-cache."
fi

cat <<EOF

  $SITE

  If the screen loads but nothing can log in, it is CORS_ORIGINS on the API box
  rather than anything here — see DEPLOY.md step 4.
EOF
