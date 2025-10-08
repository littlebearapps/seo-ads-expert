#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Comprehensive Verification"
echo "=============================="
echo ""

# Worktree-safe paths
repo_git_dir="$(git rev-parse --git-dir)"
common_dir="$(git rev-parse --git-common-dir)"
work_tree="$(git rev-parse --show-toplevel)"

# Acquire lock (prevent simultaneous verifies)
lock_acquired=0
if lock_dir=$(bash scripts/phase-2/lock.sh "verify" 300 2>/dev/null); then
  lock_acquired=1
  echo "✅ Lock acquired"
else
  echo "⚠️  Another instance is running verify - waiting..."
  sleep 5
  if ! lock_dir=$(bash scripts/phase-2/lock.sh "verify" 300); then
    echo "❌ Could not acquire lock"
    exit 1
  fi
  lock_acquired=1
  echo "✅ Lock acquired"
fi

# Cleanup on exit
cleanup() {
  if [ $lock_acquired -eq 1 ]; then
    rm -rf "$lock_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo ""
echo "1. Running lint..."
if [ -f "package.json" ] && node -e "const p=require('./package.json');process.exit(p?.scripts?.lint?0:1)" 2>/dev/null; then
  if ! npm run lint; then
    echo "❌ Lint failed"
    exit 1
  fi
  echo "✅ Lint passed"
else
  echo "⚠️  No lint script"
fi

echo ""
echo "2. Running type check..."
if [ -f "package.json" ] && node -e "const p=require('./package.json');process.exit(p?.scripts?.typecheck?0:1)" 2>/dev/null; then
  if ! npm run typecheck; then
    echo "❌ Type check failed"
    exit 1
  fi
  echo "✅ Type check passed"
else
  echo "⚠️  No typecheck script"
fi

echo ""
echo "3. Running tests..."
if [ -f "package.json" ] && node -e "const p=require('./package.json');process.exit(p?.scripts?.test?0:1)" 2>/dev/null; then
  if ! npm test; then
    echo "❌ Tests failed"
    exit 1
  fi
  echo "✅ Tests passed"
else
  echo "⚠️  No test script"
fi

echo ""
echo "4. Running build..."
if [ -f "package.json" ] && node -e "const p=require('./package.json');process.exit(p?.scripts?.build?0:1)" 2>/dev/null; then
  if ! npm run build; then
    echo "❌ Build failed"
    exit 1
  fi
  echo "✅ Build passed"
else
  echo "⚠️  No build script"
fi

# Record timestamp (worktree-safe)
verify_ts_path="$common_dir/lba/last_verify_ts"
mkdir -p "$(dirname "$verify_ts_path")"
date +%s > "$verify_ts_path"

echo ""
echo "✅ All verification checks passed!"
echo "   Timestamp recorded: $(date)"
