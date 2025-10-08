#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Phase 2: Deploy Hooks to All Projects"
echo "=========================================="
echo ""

# Projects list
projects=(
  "$HOME/claude-code-tools/lba/marketing/brand-copilot"
  "$HOME/claude-code-tools/lba/infrastructure/tools/seo-ads-expert"
  "$HOME/claude-code-tools/homeless-hounds/homelesshounds.com.au"
  "$HOME/claude-code-tools/lba/apps/chrome-extensions/notebridge"
  "$HOME/claude-code-tools/lba/apps/chrome-extensions/palette-kit"
  "$HOME/claude-code-tools/lba/apps/chrome-extensions/convert-my-file"
  "$HOME/claude-code-tools/lba/marketing/littlebearapps.com"
)

success_count=0
fail_count=0
skip_count=0

for project in "${projects[@]}"; do
  if [ ! -d "$project" ]; then
    echo "⚠️  Project not found: $project"
    ((skip_count++))
    continue
  fi

  project_name=$(basename "$project")
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 Processing: $project_name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Check for worktree structure
  if [ ! -d "$project/.bare" ]; then
    echo "⚠️  No worktree structure - skipping"
    ((skip_count++))
    echo ""
    continue
  fi

  # Deploy to dev worktree
  dev_path="$project/dev"
  if [ -d "$dev_path" ]; then
    echo "  📁 Dev worktree:"
    cd "$dev_path"

    # Copy scripts
    echo "    - Copying scripts..."
    mkdir -p scripts/phase-2
    cp "$HOME/claude-code-tools/scripts/phase-2/lock.sh" scripts/phase-2/
    cp "$HOME/claude-code-tools/scripts/phase-2/verify.sh" scripts/phase-2/
    cp "$HOME/claude-code-tools/scripts/phase-2/bootstrap-hooks.sh" scripts/phase-2/
    chmod +x scripts/phase-2/*.sh

    # Copy hooks
    echo "    - Copying hooks..."
    mkdir -p .git-hooks
    cp "$HOME/claude-code-tools/.git-hooks-template/"* .git-hooks/
    chmod +x .git-hooks/*

    # Run bootstrap
    echo "    - Bootstrapping hooks..."
    if bash scripts/phase-2/bootstrap-hooks.sh > /dev/null 2>&1; then
      echo "    ✅ Dev worktree: hooks deployed successfully"
    else
      echo "    ❌ Dev worktree: hook deployment failed"
      ((fail_count++))
      echo ""
      continue
    fi
  else
    echo "  ⚠️  Dev worktree not found"
    ((skip_count++))
    echo ""
    continue
  fi

  # Deploy to main worktree
  main_path="$project/main"
  if [ -d "$main_path" ]; then
    echo "  📁 Main worktree:"
    cd "$main_path"

    # Copy scripts
    echo "    - Copying scripts..."
    mkdir -p scripts/phase-2
    cp "$HOME/claude-code-tools/scripts/phase-2/lock.sh" scripts/phase-2/
    cp "$HOME/claude-code-tools/scripts/phase-2/verify.sh" scripts/phase-2/
    cp "$HOME/claude-code-tools/scripts/phase-2/bootstrap-hooks.sh" scripts/phase-2/
    chmod +x scripts/phase-2/*.sh

    # Copy hooks
    echo "    - Copying hooks..."
    mkdir -p .git-hooks
    cp "$HOME/claude-code-tools/.git-hooks-template/"* .git-hooks/
    chmod +x .git-hooks/*

    # Run bootstrap
    echo "    - Bootstrapping hooks..."
    if bash scripts/phase-2/bootstrap-hooks.sh > /dev/null 2>&1; then
      echo "    ✅ Main worktree: hooks deployed successfully"
      ((success_count++))
    else
      echo "    ❌ Main worktree: hook deployment failed"
      ((fail_count++))
      echo ""
      continue
    fi
  else
    echo "  ⚠️  Main worktree not found"
    ((skip_count++))
  fi

  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Deployment Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Successful: $success_count projects"
echo "❌ Failed: $fail_count projects"
echo "⏭️  Skipped: $skip_count projects"
echo ""

if [ $fail_count -gt 0 ]; then
  echo "⚠️  Some deployments failed - review output above"
  exit 1
else
  echo "🎉 All deployments successful!"
fi
