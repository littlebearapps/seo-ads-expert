#!/usr/bin/env bash
set -euo pipefail

# ERR trap for safety
trap 'echo "❌ Hook bootstrap failed at line $LINENO" >&2' ERR

echo "🪝 Bootstrap Git Hooks"
echo "======================"
echo ""

# Detect git directory (worktree-safe)
repo_git_dir=$(git rev-parse --git-dir)
common_dir=$(git rev-parse --git-common-dir)

echo "Git directory: $repo_git_dir"
echo "Common directory: $common_dir"
echo ""

# Check if hooks directory exists
if [ ! -d ".git-hooks" ]; then
  echo "❌ .git-hooks directory not found"
  echo "   Expected hooks in repository at: .git-hooks/"
  exit 1
fi

echo "✅ Found .git-hooks directory"
echo ""

# Configure core.hooksPath (repo-local, not global)
echo "Configuring core.hooksPath..."

# Check if already set globally (warn if so)
if git config --global core.hooksPath &> /dev/null; then
  echo "⚠️  WARNING: core.hooksPath set globally"
  echo "   Global: $(git config --global core.hooksPath)"
  echo "   This will override local settings!"
  echo ""
fi

# Set repo-local configuration
git config --local core.hooksPath .git-hooks
echo "✅ Set core.hooksPath = .git-hooks (repo-local)"
echo ""

# Verify hooks are executable
echo "Checking hook permissions..."
for hook in .git-hooks/*; do
  if [ -f "$hook" ] && [ ! -x "$hook" ]; then
    echo "  Making executable: $(basename "$hook")"
    chmod +x "$hook"
  fi
done
echo "✅ All hooks executable"
echo ""

# Create shared directories
echo "Creating shared directories..."
mkdir -p "$common_dir/lba"
mkdir -p "$common_dir/lba/locks"
echo "✅ Shared directories created"
echo ""

# Test hook configuration
echo "Testing hook configuration..."
if test_output=$(git config --local core.hooksPath); then
  echo "✅ core.hooksPath: $test_output"
else
  echo "❌ Failed to read core.hooksPath"
  exit 1
fi

echo ""
echo "✅ Hook bootstrap complete!"
echo ""
echo "Installed hooks:"
ls -1 .git-hooks/ | grep -v '\.sample' | sed 's/^/  - /'
