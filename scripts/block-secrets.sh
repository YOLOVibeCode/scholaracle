#!/usr/bin/env bash
# block-secrets.sh — refuse to commit credential / env files.
# Wired into .husky/pre-commit. Exit 1 = commit blocked.

set -euo pipefail

BLOCKED_PATH_REGEX='(^|/)\.env($|\.)|(^|/)\.env\.companion|(^|/)companion\.env\.local$|(^|/)companionDevSeed\.generated\.ts$|(^|/)credentials[^/]*\.(json|txt|env)$|(^|/)secrets\.(json|txt|env)$|(^|/)id_rsa|(^|/)\.pem$|\.p12$|\.mobileprovision$'
# Allow committed templates only
ALLOW_PATH_REGEX='\.(example|sample|template)$|\.env\.example$|companion\.env\.example$'

STAGED=$(git diff --cached --name-only --diff-filter=ACM)
if [ -z "$STAGED" ]; then
  exit 0
fi

blocked=()
while IFS= read -r file; do
  [ -z "$file" ] && continue
  if echo "$file" | grep -Eq "$ALLOW_PATH_REGEX"; then
    continue
  fi
  if echo "$file" | grep -Eq "$BLOCKED_PATH_REGEX"; then
    blocked+=("$file")
  fi
done <<< "$STAGED"

# Also scan staged content for obvious secret assignment patterns in companion packages
CONTENT_HITS=$(git diff --cached -U0 -- 'packages/mobile/**' 'packages/browser-extension/**' \
  | grep -E '^\+' \
  | grep -Eiv '^\+\+\+|example|placeholder|change-me|yourschool|TODO|test@|fake|mock' \
  | grep -Ei 'password\s*[:=]\s*["'\''][^"'\'']{4,}|PORTAL_PASSWORD\s*=\s*[^#[:space:]]+|EXPO_PUBLIC_.*PASSWORD\s*=' \
  || true)

if [ ${#blocked[@]} -gt 0 ] || [ -n "$CONTENT_HITS" ]; then
  echo ""
  echo "ERROR: Commit blocked — credential / secret material must not enter git."
  echo ""
  if [ ${#blocked[@]} -gt 0 ]; then
    echo "Blocked paths:"
    for f in "${blocked[@]}"; do echo "  - $f"; done
    echo ""
  fi
  if [ -n "$CONTENT_HITS" ]; then
    echo "Blocked content patterns (password-like assignments in companion packages):"
    echo "$CONTENT_HITS" | sed 's/^/  /'
    echo ""
  fi
  echo "Use:"
  echo "  packages/mobile/companion.env.local    (gitignored — local testing only)"
  echo "  Device Keychain / SecureStore          (runtime — never synced to git)"
  echo "  companion.env.example / *.env.example  (placeholders only — safe to commit)"
  echo ""
  exit 1
fi

exit 0
