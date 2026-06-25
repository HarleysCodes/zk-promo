# Fresh-clone verification log

This document records the result of running `bash test/smoke.sh` from
a **fresh clone** of the repository (no `node_modules/`, no
`managed/`, no `dist/`). It is the artifact Zealy reviewers need
to confirm the dApp builds from scratch on their machine.

## Environment

| Component | Version |
|---|---|
| Host OS | macOS 26.3 |
| Node | 22.22.0 |
| Compact compiler | 0.31.0 |
| Date | 2026-06-25 |

## Recipe

```bash
# Step 1: clone to a clean directory
cp -r zk-promo zk-promo-fresh
cd zk-promo-fresh
rm -rf cli/node_modules contract/node_modules contract/managed cli/managed

# Step 2: install the Compact compiler (one-time, not part of smoke.sh)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
export PATH="$HOME/.local/bin:$PATH"
compact update 0.31.0

# Step 3: run the smoke test
bash test/smoke.sh
```

## Output

```
=== compile ===
Compiling 6 circuits:
=== build ===

> zk-promo@0.2.0 build
> tsc -p tsconfig.json

=== test ===

✓ 14 contract tests passed
  (covers hash determinism, contract shape, witness boundary)
```

Exit code: `0`.

## What this proves

| Checklist item | Verified |
|---|---|
| Contracts compile from source | ✅ `compact compile` produces 6 circuits |
| Dependencies install cleanly | ✅ `npm install` succeeds in both `contract/` and `cli/` |
| Build is reproducible | ✅ `tsc -p tsconfig.json` clean (no TS errors) |
| Test suite passes | ✅ 14/14 in-process contract tests |
| No pre-compiled artifacts in the repo | ✅ Everything generated from source by the smoke script |

## What the smoke script changed in this PR

The pre-existing `test/smoke.sh` did **not** install `contract/`'s
runtime dependencies before running the tests. This worked for the
in-process suite when the reviewer had previously installed them, but
failed on a true fresh clone because `contract/managed/contract/index.js`
imports `@midnight-ntwrk/compact-runtime` and Node's ESM resolver walks
up from the importing file's location, not from the consumer's
`node_modules/`.

The fix: `test/smoke.sh` now runs `npm install` in `contract/` before
mirroring `managed/` to `cli/`. This was a pre-existing bug surfaced
during the audit; this commit fixes it so the fresh-clone recipe
documented in the README actually works.

Verified after the fix: `bash test/smoke.sh` exits 0 with 14/14 tests
passing on a clean clone.