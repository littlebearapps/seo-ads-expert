#!/usr/bin/env bash
set -euo pipefail

# Atomic locking using mkdir (not flock - more reliable across filesystems)

resource="${1:?resource name required}"
ttl="${2:-600}"  # 10 minutes default

# Get common git directory (shared across worktrees)
common="$(git rev-parse --git-common-dir)"
lock_root="$common/lba/locks"
lock_dir="$lock_root/$resource"
mkdir -p "$lock_root"

now=$(date +%s)

# Try to acquire lock
if mkdir "$lock_dir" 2>/dev/null; then
  # Lock acquired!
  trap 'rm -rf "$lock_dir"' EXIT

  # Write lock metadata
  echo "$$" > "$lock_dir/pid"
  echo "$now" > "$lock_dir/ts"
  echo "${INST_ID:-unknown}" > "$lock_dir/inst"

  # Return lock directory path (for cleanup)
  echo "$lock_dir"
else
  # Lock busy - check if stale
  if [ -f "$lock_dir/ts" ]; then
    ts=$(cat "$lock_dir/ts" 2>/dev/null || echo 0)
    age=$((now - ts))

    if (( age > ttl )); then
      # Stale lock - force release
      echo "⚠️  Stale lock detected (age: ${age}s, ttl: ${ttl}s). Forcing release." >&2
      rm -rf "$lock_dir"

      # Retry acquisition once
      if mkdir "$lock_dir" 2>/dev/null; then
        trap 'rm -rf "$lock_dir"' EXIT
        echo "$$" > "$lock_dir/pid"
        echo "$now" > "$lock_dir/ts"
        echo "${INST_ID:-unknown}" > "$lock_dir/inst"
        echo "$lock_dir"
      else
        echo "❌ Lock acquisition failed after stale cleanup" >&2
        exit 1
      fi
    else
      # Lock is fresh - someone else has it
      inst=$(cat "$lock_dir/inst" 2>/dev/null || echo "unknown")
      echo "❌ Lock held by: $inst (age: ${age}s)" >&2
      exit 1
    fi
  else
    echo "❌ Lock busy (no timestamp available)" >&2
    exit 1
  fi
fi
