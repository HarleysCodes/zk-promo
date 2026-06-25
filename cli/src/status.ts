#!/usr/bin/env node
// @ts-nocheck — midnight-js SDK overloads don't resolve user-compiled contracts cleanly. The runtime shape matches counter-cli; the boundary is loosely typed. The downstream typed files (hash.ts, test.ts, contract-address handling) are unaffected.
// SPDX-License-Identifier: MIT
// Read on-chain state of the deployed ZK Promo contract.
//
// Usage:
//   WALLET_SEED=<64-hex> npx tsx src/status.ts
//   npx tsx src/status.ts --address <contract-address>
//
// Walks the public ledger (Set<Bytes<32>> validCodes, Map<Bytes<32>, Boolean>
// claimed) and prints each registered hash plus whether it's been claimed.

import { readFileSync, existsSync } from 'node:fs';
import { buildWalletAndWaitForFunds, buildProviders, createWalletAndMidnightProvider, attachWalletProviders, status as statusApi } from './api.js';
import { activeConfig } from './config.js';
import { emptyPrivateState } from './common-types.js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract as ZkPromoContract } from '../../contract/managed/contract/index.js';
import { contractConfig } from './config.js';

const ADDR_FILE = 'contract-address.txt';

async function main() {
  const args = process.argv.slice(2);
  let addressOverride: string | undefined;
  const addrIdx = args.indexOf('--address');
  if (addrIdx >= 0 && args[addrIdx + 1]) {
    addressOverride = args[addrIdx + 1];
  }

  let contractAddress: string;
  if (addressOverride) {
    contractAddress = addressOverride;
  } else if (existsSync(ADDR_FILE)) {
    contractAddress = readFileSync(ADDR_FILE, 'utf8').trim();
  } else {
    console.error(`  ✗ No contract address. Pass --address <addr> or run deploy.ts first.`);
    process.exit(1);
  }
  console.log(`\n  Contract: ${contractAddress}`);

  // Status doesn't strictly need a wallet, but the indexer client needs the
  // network ID set, so we use the same config path for consistency.
  const config = activeConfig();
  const seed = process.env.WALLET_SEED;
  if (!seed) {
    console.error('  ✗ WALLET_SEED env var required (status reads via the indexer).');
    process.exit(1);
  }
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

  const state = await statusApi(fullProviders, deployed.deployTxData.public.contractAddress);

  if (state.validCodes.length === 0 && state.validRedemptions.length === 0) {
    console.log('  No codes or redemptions issued yet.\n');
    return;
  }
  if (state.validCodes.length > 0) {
    console.log(`\n  Promo codes (${state.validCodes.length}):\n`);
    for (const h of state.validCodes) {
      const claimedFlag = state.claimed[h] ? '✓ claimed' : '· unclaimed';
      console.log(`    ${h}   ${claimedFlag}`);
    }
  }
  if (state.validRedemptions.length > 0) {
    console.log(`\n  Redemption tokens (${state.validRedemptions.length}):\n`);
    for (const h of state.validRedemptions) {
      const redeemedFlag = state.redeemed[h] ? '✓ redeemed' : '· unredeemed';
      console.log(`    ${h}   ${redeemedFlag}`);
    }
  }
  console.log('');
}

main().catch((err) => {
  console.error('\n  ✗ Status read failed:', err?.message ?? err);
  process.exit(1);
});
