#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="${1:-}"
CUSTOM_DOMAIN="${2:-socalnmotorsports.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! "$REPOSITORY" =~ ^[^/]+/[^/]+$ ]]; then
  echo "Usage: $0 OWNER/REPOSITORY [CUSTOM_DOMAIN]" >&2
  echo "Example: $0 michaelwdube-a11y/socal-n-motorsports-site socalnmotorsports.com" >&2
  exit 2
fi

for command_name in git gh; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

gh auth status --hostname github.com >/dev/null

if ! gh api "repos/$REPOSITORY" >/dev/null 2>&1; then
  gh repo create "$REPOSITORY" \
    --public \
    --description "SoCal N Motorsports marketing website" \
    --disable-issues \
    --disable-wiki
fi

VISIBILITY="$(gh api "repos/$REPOSITORY" --jq .visibility)"
if [[ "$VISIBILITY" != "public" ]]; then
  echo "GitHub Pages on GitHub Free requires this repository to be public." >&2
  echo "Repository visibility is currently: $VISIBILITY" >&2
  exit 1
fi

cd "$PROJECT_DIR"

if [[ ! -d .git ]]; then
  git init
fi

git checkout -B main

REMOTE_URL="https://github.com/$REPOSITORY.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

git add .
if ! git diff --cached --quiet; then
  git commit -m "Publish SoCal N Motorsports website"
fi
git push --set-upstream origin main

if gh api "repos/$REPOSITORY/pages" >/dev/null 2>&1; then
  gh api --method PUT "repos/$REPOSITORY/pages" \
    -f build_type=workflow \
    -f cname="$CUSTOM_DOMAIN" >/dev/null
else
  gh api --method POST "repos/$REPOSITORY/pages" \
    -f build_type=workflow >/dev/null
  gh api --method PUT "repos/$REPOSITORY/pages" \
    -f build_type=workflow \
    -f cname="$CUSTOM_DOMAIN" >/dev/null
fi

gh workflow run "Deploy GitHub Pages" --repo "$REPOSITORY"

OWNER="${REPOSITORY%%/*}"
echo
echo "Publish started."
echo "Temporary GitHub URL: https://$OWNER.github.io/${REPOSITORY#*/}/"
echo "Custom URL after DNS is ready: https://$CUSTOM_DOMAIN/"
echo "Deployment status: https://github.com/$REPOSITORY/actions"
echo
echo "After DNS resolves and GitHub issues the certificate, enable HTTPS with:"
echo "gh api --method PUT repos/$REPOSITORY/pages -F https_enforced=true"
