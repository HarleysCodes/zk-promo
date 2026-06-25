#!/usr/bin/env node
// @ts-nocheck — midnight-js SDK overloads don't resolve user-compiled contracts cleanly. The runtime shape matches counter-cli; the boundary is loosely typed. The downstream typed files (hash.ts, test.ts, contract-address handling) are unaffected.
// SPDX-License-Identifier: MIT
// User: claim a high-entropy redemption token by submitting the 32-byte secret.
//
// Usage:
//   WALLET_SEED=<64-hex> npx tsx src/claim-redeem.ts <64-hex>
//
// The secret is provided as 64 hex chars (32 bytes). The witness
// `user_redeem_secret()` returns it to the prover, the prover hashes
// it inside the circuit, the circuit compares against the public
// redemption set, and (if it matches and is unclaimed) flips the
// public redemption flag. The plaintext secret never leaves the
// user's machine.

import { readFileSync, existsSync } from 'node:fs';
import { buildWalletAndWaitForFunds, buildProviders, createWalletAndMidnightProvider, attachWalletProviders, claimRedemption as claimRedemptionApi } from './api.js';
import { activeConfig, contractConfig } from './config.js';
import { emptyPrivateState } from './common-types.js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract as ZkPromoContract } from '../../contract/managed/contract/index.js';
import { Buffer } from 'buffer';

const ADDR_FILE = 'contract-address.txt';

async function main() {
  const seed = process.env.WALLET_SEED;
  if (!seed) {
    console.error('  ✗ WALLET_SEED env var required (32 bytes hex).');
    process.exit(1);
  }
  const secretHex = process.argv[2];
  if (!secretHex || secretHex.length !== 64) {
    console.error('  ✗ Pass the 64-hex redemption secret as the first argument.');
    process.exit(1);
  }
  if (!existsSync(ADDR_FILE)) {
    console.error(`  ✗ ${ADDR_FILE} not found. Run deploy.ts first.`);
    process.exit(1);
  }
  const contractAddress = readFileSync(ADDR_FILE, 'utf8').trim();
  const secret = Buffer.from(secretHex, 'hex');

  const config = activeConfig();
  const ctx = await buildWalletAndWaitForFunds(config, seed);
  const providers = buildProviders(config);
  const wm = await createWalletAndMidnightProvider(ctx);
  const fullProviders = attachWalletProviders(providers, wm);

  const compiled = (CompiledContract.make as any)('zk-promo', ZkPromoContract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
  );
  const deployed = await (findDeployedContract as any)(fullProviders, {
    contractAddress: contractAddress as any,
    compiledContract: compiled,
    privateStateId: 'zkPromoPrivateState',
    initialPrivateState: emptyPrivateState(),
  } as any);

  await claimRedemptionApi(deployed, fullProviders, secret);
  console.log('\n  ✓ Redemption submitted.\n');
}

main().catch((err) => {
  console.error('\n  ✗ Claim redemption failed:', err?.message ?? err);
  process.exit(1);
});