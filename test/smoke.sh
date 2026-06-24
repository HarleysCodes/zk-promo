#!/usr/bin/env bash
# End-to-end smoke test: compile, build, run tests.
# This is what a reviewer runs to verify the dapp builds from a
# fresh clone.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$PATH"

# 1. Compile the contract
echo "=== compile ==="
cd contract
~/.local/bin/compact compile src/zk_promo.compact managed
cd ..
cp -r contract/managed cli/managed

# 2. Install and build the CLI
echo "=== build ==="
cd cli
npm install --silent
npm run build

# 3. Run the test suite
echo "=== test ==="
node dist/test-cli.js
