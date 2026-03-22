#!/usr/bin/env bash
# Sync the version from root package.json to all other locations.
# Usage:
#   pnpm version:sync          — sync current version everywhere
#   pnpm version:bump patch    — bump patch, then sync
#   pnpm version:bump minor    — bump minor, then sync

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUMP_TYPE="${1:-}"

# If a bump type is given (patch, minor, major), bump root package.json first
if [[ -n "$BUMP_TYPE" ]]; then
  cd "$ROOT_DIR"
  npm version "$BUMP_TYPE" --no-git-tag-version --no-workspaces-update >/dev/null
  echo "Bumped root package.json ($BUMP_TYPE)"
fi

# Read the current version from root package.json
VERSION=$(node -p "require('$ROOT_DIR/package.json').version")

echo "Syncing version $VERSION ..."

# 1. wiki/package.json
node -e "
  const fs = require('fs');
  const path = '$ROOT_DIR/wiki/package.json';
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"
echo "  ✓ wiki/package.json"

# 2. public/openapi.yaml
sed -i '' "s/^  version: .*/  version: $VERSION/" "$ROOT_DIR/public/openapi.yaml"
echo "  ✓ public/openapi.yaml"

# 3. api-docs/openapi.yaml
sed -i '' "s/^  version: .*/  version: $VERSION/" "$ROOT_DIR/api-docs/openapi.yaml"
echo "  ✓ api-docs/openapi.yaml"

echo "Done — all files at v$VERSION"
