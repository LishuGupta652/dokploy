#!/usr/bin/env sh
set -eu

PACKAGE_MANAGER="npm"
PUBLISH="0"
ACCESS="public"
BUMP="patch"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/publish.sh [npm|pnpm] [--publish] [--access public|restricted] [--bump patch|minor|major|none]

Examples:
  ./scripts/publish.sh npm
  ./scripts/publish.sh npm --publish
  ./scripts/publish.sh npm --publish --bump minor
  ./scripts/publish.sh pnpm
  ./scripts/publish.sh pnpm --publish

Default mode is safe: it runs checks and pack dry-run only.
Pass --publish to publish @lishugupta652/dokploy to npm.
In publish mode, if the current version already exists on npm, the script bumps patch by default.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    npm|pnpm)
      PACKAGE_MANAGER="$1"
      shift
      ;;
    --publish)
      PUBLISH="1"
      shift
      ;;
    --dry-run)
      PUBLISH="0"
      shift
      ;;
    --access)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --access" >&2
        exit 1
      fi
      ACCESS="$2"
      shift 2
      ;;
    --bump)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --bump" >&2
        exit 1
      fi
      case "$2" in
        patch|minor|major|none)
          BUMP="$2"
          ;;
        *)
          echo "--bump must be patch, minor, major, or none" >&2
          exit 1
          ;;
      esac
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

cd "$(dirname "$0")/.."

if ! command -v "$PACKAGE_MANAGER" >/dev/null 2>&1; then
  if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
    echo "pnpm is not installed. Try: corepack enable && corepack prepare pnpm@latest --activate" >&2
  else
    echo "$PACKAGE_MANAGER is not installed." >&2
  fi
  exit 1
fi

if [ "$PACKAGE_MANAGER" = "npm" ]; then
  export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/dokploy-npm-cache}"
fi

if [ "$PACKAGE_MANAGER" = "pnpm" ] && [ ! -f "pnpm-lock.yaml" ] && [ -f "package-lock.json" ]; then
  echo "Note: package-lock.json exists and pnpm-lock.yaml does not."
  echo "To fully switch this package to pnpm, run: rm package-lock.json && pnpm install"
  echo ""
fi

echo "Package manager: $PACKAGE_MANAGER"
echo "Publish mode:    $PUBLISH"
echo "Access:          $ACCESS"
echo "Version bump:    $BUMP"
echo ""

if [ "$PUBLISH" = "1" ]; then
  if ! "$PACKAGE_MANAGER" whoami >/dev/null 2>&1; then
    echo "Not logged in to npm. Run: $PACKAGE_MANAGER login" >&2
    exit 1
  fi
  echo "Logged in as: $("$PACKAGE_MANAGER" whoami)"
  echo ""

  echo "Checking npm version availability..."
  node scripts/ensure-publish-version.mjs --package-manager "$PACKAGE_MANAGER" --bump "$BUMP"
  echo ""
fi

echo "Checking package..."
"$PACKAGE_MANAGER" run check

echo ""
echo "Building package..."
"$PACKAGE_MANAGER" run build

echo ""
echo "CLI smoke test..."
node dist/index.js --version
node dist/index.js --help >/dev/null

echo ""
if [ "$PUBLISH" = "1" ]; then
  echo "Generating changelog..."
  "$PACKAGE_MANAGER" run changelog
else
  echo "Changelog dry-run..."
  "$PACKAGE_MANAGER" run changelog -- --dry-run
fi

echo ""
echo "Pack dry-run..."
"$PACKAGE_MANAGER" pack --dry-run

if [ "$PUBLISH" != "1" ]; then
  echo ""
  echo "Dry run complete. Publish with:"
  echo "  ./scripts/publish.sh $PACKAGE_MANAGER --publish"
  exit 0
fi

echo ""
echo "Publishing @lishugupta652/dokploy..."
"$PACKAGE_MANAGER" publish --access "$ACCESS"

echo ""
echo "Published. Verify with:"
echo "  npm view @lishugupta652/dokploy version"
echo "  npm install -g @lishugupta652/dokploy"
echo "  dokploy --help"
