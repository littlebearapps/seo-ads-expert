#!/bin/bash
# Test workflow shell script

set -euo pipefail

echo "Starting workflow test..."

# Function to test file operations
test_files() {
  local dir="$1"
  echo "Testing files in: $dir"

  for file in "$dir"/*; do
    if [ -f "$file" ]; then
      echo "  - Found: $(basename "$file")"
    fi
  done
}

# Run tests
test_files "test-workflow/folder-01"
test_files "test-workflow/folder-02"
test_files "test-workflow/folder-03"

echo "Workflow test complete!"
