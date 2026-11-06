#!/usr/bin/env bash
#
# Build the admin SPA and ship it to the EC2 box, where Caddy serves it at
# https://vpsischool.com.
#
#   ./deploy.sh                 build (bumps the patch version) and upload
#   ./deploy.sh --no-release    build without bumping the version
#   ./deploy.sh --skip-build    upload the dist/ that is already there
#   ./deploy.sh --yes           do not ask before uploading
#
# The long-form reasoning behind each step is in DEPLOY.md. This script is the
# same steps with the checks that are easy to forget: that the box is ready to
# receive it, that the build is aimed at the right API, and that what the site
# serves afterwards is what was just built.
set -euo pipefail

HOST=${VPSI_HOST:-ubuntu@api.vpsischool.com}
KEY=../vpsi-api.pem
# Mounted into the caddy container as /srv/admin (vpsischool-api/docker-compose.prod.yml).
REMOTE_DIR='vpsischool-api/admin'
SITE=https://vpsischool.com
EXPECTED_API=https://api.vpsischool.com/api/v1

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
on_server() { ssh -i "$KEY" "$HOST" "$@"; }

[ -f "$KEY" ] || fail "the deploy key is not at $KEY (it belongs in VPSI-SCHOOL/, beside the two project folders)"

# ── Is the box ready for it ─────────────────────────────────────────────────
# The folder is created by the API's deploy (or by hand, DEPLOY.md). If it is
# missing, Caddy is not serving it either, and an upload would land nowhere.
say "1/5  checking the server"
on_server "test -d $REMOTE_DIR && test -w $REMOTE_DIR" \
  || fail "$HOST:~/$REMOTE_DIR is missing or not writable — vpsischool-api/DEPLOY.md section 8 sets it up"
printf '     %s:~/%s\n' "$HOST" "$REMOTE_DIR"

# ── What will it talk to ────────────────────────────────────────────────────
# VITE_* values are compiled into the bundle, so this is decided now and cannot
# be corrected on the server afterwards.
say "2/5  checking which API this build will point at"
api=$(sed -n 's/^VITE_API_BASE_URL=//p' .env 2>/dev/null | head -1)
[ -n "$api" ] || fail "VITE_API_BASE_URL is not set in .env"
printf '     %s\n' "$api"
# An https page may not call an http API — the browser blocks it silently.
case "$api" in
  https://*) ;;
  *) fail "VITE_API_BASE_URL must be https:// — $SITE is served over HTTPS" ;;
esac
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
  printf '\nUpload to %s? [y/N] ' "$SITE"
  read -r reply
  case "$reply" in [yY]*) ;; *) echo "stopped."; exit 1 ;; esac
fi

# ── Upload ──────────────────────────────────────────────────────────────────
# No --delete: the previous build's assets are what a viewer with the page open
# is still loading, and what a rollback re-points index.html at. The folder
# grows by a few MB a release; that is the trade. Source maps stay behind —
# they publish the readable source of the whole admin.
say "4/5  uploading"
ssh_cmd="ssh -i $KEY"
rsync -a --exclude '*.map' -e "$ssh_cmd" dist/assets/ "$HOST:$REMOTE_DIR/assets/"
rsync -a --exclude assets --exclude index.html --exclude '*.map' -e "$ssh_cmd" dist/ "$HOST:$REMOTE_DIR/"
# Last, so the page is never pointed at a chunk that is not there yet.
rsync -a -e "$ssh_cmd" dist/index.html "$HOST:$REMOTE_DIR/index.html"
printf '     done\n'

# ── Check ───────────────────────────────────────────────────────────────────
say "5/5  checking what the site serves now"
served=$(curl -fsS "$SITE" | sed -n 's/.*src="\/assets\/\(index-[^"]*\.js\)".*/\1/p' | head -1)
if [ "$served" = "$entry" ]; then
  printf '     \033[32mlive: %s\033[0m\n' "$entry"
else
  fail "the site is serving '${served}', not $entry
     Check Caddy on the box:  docker compose --env-file .env.production \\
       -f docker-compose.prod.yml logs --tail 50 caddy"
fi

cat <<EOF

  $SITE

  If the screen loads but nothing can log in, it is CORS_ORIGINS on the API box
  rather than anything here — see DEPLOY.md.
EOF
