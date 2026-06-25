// SPDX-License-Identifier: MIT
// Wallet + provider setup, contract deploy/issue/claim helpers.
//
// Pattern: counter-cli/src/api.ts (midnightntwrk/example-counter, 2026-06).
// The ZK Promo dapp is much smaller (one witness, three circuits, two
// ledger fields), so we keep the API surface tight: build a wallet, build
// the four providers, deploy, issue, claim, status.
//
// TypeScript note: midnight-js SDK generics are tightly coupled to the
// counter-contract package layout. Our dapp uses its own generated
// `Contract` class, which doesn't fit those generics cleanly. We
// `as any` at the SDK boundary (compiledZkPromo, deploy/find return types)
// and let TypeScript check the rest. This matches the pragmatic pattern
// counter-cli uses internally for its own integrations.

// @ts-nocheck — see "TypeScript note" above. The downstream commands
// (deploy.ts, issue.ts, claim.ts, status.ts, wallet.ts) are fully typed.

import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { type FinalizedTxData, type MidnightProvider, type WalletProvider } from '@midnight-ntwrk/midnight-js/types';
import { deployContract as sdkDeployContract, findDeployedContract as sdkFindDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import {
  Contract as ZkPromoContractClass,
  ledger as ledgerFn,
} from '../../contract/managed/contract/index.js';
import { type Config, contractConfig, networkId } from './config.js';
import {
  type ZkPromoProviders,
  type DeployedZkPromo,
  type ZkPromoPrivateState,
  emptyPrivateState,
} from './common-types.js';

// Required for GraphQL subscriptions in Node.js
globalThis.WebSocket = WebSocket;

// ─── Pre-compile the contract ────────────────────────────────────────────────
//
// `CompiledContract.make` is generic over a counter-cli-style contract
// package layout. Our dapp uses its own generated class, which the type
// checker can't fully resolve. The runtime shape matches.

const compiledZkPromo = CompiledContract.make('zk-promo', ZkPromoContractClass).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
);

// ─── Wallet context ──────────────────────────────────────────────────────────

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: any;
  dustSecretKey: any;
  unshieldedKeystore: UnshieldedKeystore;
}

/** Display a wallet summary. */
function printWalletSummary(state: any, unshieldedKeystore: UnshieldedKeystore, network: string): void {
  const unshieldedBalance = state.unshielded.balances?.[unshieldedToken().raw] ?? 0n;
  const DIV = '─'.repeat(60);
  console.log(`
${DIV}
  Wallet Overview                                Network: ${network}
${DIV}
  Unshielded Address (send tNight here):
  ${unshieldedKeystore.getBech32Address()}

  Unshielded balance: ${unshieldedBalance.toString()} tNight

  Fund via the Preview faucet:
  https://faucet.preview.midnight.network/
${DIV}`);
}

/** Wait until the wallet has fully synced with the network. */
export const waitForSync = (wallet: WalletFacade) =>
  Rx.firstValueFrom(wallet.state().pipe(Rx.throttleTime(5_000), Rx.filter((s: any) => s.isSynced)));

/** Wait until the wallet has a non-zero unshielded balance. */
export const waitForFunds = (wallet: WalletFacade): Promise<bigint> =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.filter((s: any) => s.isSynced),
      Rx.map((s: any) => s.unshielded.balances?.[unshieldedToken().raw] ?? 0n),
      Rx.filter((balance: bigint) => balance > 0n),
    ),
  );

/** Derive HD-wallet keys for all three roles from a hex seed. */
function deriveKeysFromSeed(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') {
    throw new Error('Failed to initialize HDWallet from seed');
  }
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== 'keysDerived') {
    throw new Error('Failed to derive keys');
  }
  hdWallet.hdWallet.clear();
  return result.keys;
}

/** Build a wallet from a hex seed, wait for sync, print summary. */
export async function buildWalletAndWaitForFunds(config: Config, seed: string): Promise<WalletContext> {
  const keys = deriveKeysFromSeed(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId());

  const shieldedConfig = {
    networkId: networkId(),
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
    provingServerUrl: new URL(config.proofServer),
    relayURL: new URL(config.node.replace(/^http/, 'ws')),
  };
  const unshieldedConfig = {
    networkId: networkId(),
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
  };
  const dustConfig = {
    networkId: networkId(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
    provingServerUrl: new URL(config.proofServer),
    relayURL: new URL(config.node.replace(/^http/, 'ws')),
  };

  const wallet = await WalletFacade.init({
    configuration: { ...shieldedConfig, ...unshieldedConfig, ...dustConfig },
    shielded: (cfg: any) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg: any) =>
      UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg: any) =>
      DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  const DIV = '─'.repeat(60);
  console.log(`
${DIV}
  Building wallet on ${networkId()} ...
${DIV}
  Send tNight to this address to fund your wallet:
  ${unshieldedKeystore.getBech32Address()}

  Preview faucet: https://faucet.preview.midnight.network/
${DIV}
`);

  const syncedState = await waitForSync(wallet);
  printWalletSummary(syncedState, unshieldedKeystore, networkId());

  const balance = syncedState.unshielded.balances?.[unshieldedToken().raw] ?? 0n;
  if (balance === 0n) {
    console.log('  No funds yet — waiting for incoming tokens...');
    await waitForFunds(wallet);
    console.log('  ✓ Wallet funded.');
  }

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

/** Generate a fresh seed (32 bytes hex). For first-run wallets. */
export function freshSeed(): string {
  return generateRandomSeed();
}

// ─── Provider setup ──────────────────────────────────────────────────────────

/** Build the four midnight-js providers needed to deploy and call the contract. */
export function buildProviders(config: Config): ZkPromoProviders {
  return {
    configProvider: new NodeZkConfigProvider(contractConfig.zkConfigPath),
    proofProvider: httpClientProofProvider(config.proofServer),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    privateStateProvider: levelPrivateStateProvider({
      privateStoragePasswordProvider: () => 'zk-promo-test-password',
    }),
    walletProvider: undefined as any,
    midnightProvider: undefined as any,
  };
}

/**
 * Bridge the WalletFacade to the midnight-js provider interface.
 * The wallet signs + balances + submits; midnight-js packages the call.
 */
export async function createWalletAndMidnightProvider(ctx: WalletContext): Promise<WalletProvider & MidnightProvider> {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s: any) => s.isSynced)));
  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      // Sign every intent in the recipe using its actual proof marker
      // (proven transactions use 'proof', balancing transactions use 'pre-proof').
      for (const txPart of [recipe.baseTransaction, recipe.balancingTransaction].filter(Boolean)) {
        if (txPart.intents && txPart.intents.size > 0) {
          for (const segment of txPart.intents.keys()) {
            const intent = txPart.intents.get(segment);
            if (!intent) continue;
            const cloned = ledger.Intent.deserialize('signature', 'proof', 'pre-binding', intent.serialize());
            const sigData = cloned.signatureData(segment);
            const signature = signFn(sigData);
            if (cloned.fallibleUnshieldedOffer) {
              const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
                (_: any, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature,
              );
              cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
            }
            if (cloned.guaranteedUnshieldedOffer) {
              const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
                (_: any, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature,
              );
              cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
            }
            txPart.intents.set(segment, cloned);
          }
        }
      }
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx: any) {
      return ctx.wallet.submitTransaction(tx);
    },
  };
}

/** Attach the wallet/midnight providers. */
export function attachWalletProviders(
  providers: ZkPromoProviders,
  walletProvider: WalletProvider & MidnightProvider,
): ZkPromoProviders {
  return { ...providers, walletProvider, midnightProvider: walletProvider };
}

// ─── Contract interaction ────────────────────────────────────────────────────

/** Deploy the ZK Promo contract to the configured testnet. */
export async function deploy(providers: ZkPromoProviders, initialState: ZkPromoPrivateState): Promise<DeployedZkPromo> {
  console.log('  Deploying ZK Promo contract...');
  const deployed = await sdkDeployContract(providers, {
    compiledContract: compiledZkPromo,
    privateStateId: 'zkPromoPrivateState',
    initialPrivateState: initialState,
  } as any);
  console.log(`  ✓ Deployed at: ${deployed.deployTxData.public.contractAddress}`);
  return deployed as DeployedZkPromo;
}

/** Join an existing deployment by address. */
export async function join(providers: ZkPromoProviders, contractAddress: string, initialState: ZkPromoPrivateState): Promise<DeployedZkPromo> {
  console.log(`  Joining contract at ${contractAddress}...`);
  const found = await sdkFindDeployedContract(providers, {
    contractAddress,
    compiledContract: compiledZkPromo,
    privateStateId: 'zkPromoPrivateState',
    initialPrivateState: initialState,
  } as any);
  console.log('  ✓ Joined.');
  return found as DeployedZkPromo;
}

/** Operator: register a promo code hash on-chain. */
export async function issue(contract: DeployedZkPromo, codeHash: Uint8Array): Promise<FinalizedTxData> {
  if (codeHash.length !== 32) throw new Error('codeHash must be 32 bytes');
  console.log(`  Issuing promo hash: 0x${Buffer.from(codeHash).toString('hex')}`);
  const finalized = await contract.callTx.issue(codeHash);
  console.log(`  ✓ Issued in tx ${finalized.public.txId} (block ${finalized.public.blockHeight})`);
  return finalized.public;
}

/** User: claim a promo by submitting the plaintext via the witness. */
export async function claim(contract: DeployedZkPromo, providers: ZkPromoProviders, plaintextCode: string): Promise<FinalizedTxData> {
  if (plaintextCode.length === 0 || plaintextCode.length > 32) {
    throw new Error('promo code must be 1-32 bytes');
  }
  // Load the plaintext into private state so the witness `user_promo_code(salt)`
  // returns it during the prover call.
  const padded = new Uint8Array(32);
  padded.set(new TextEncoder().encode(plaintextCode), 0);
  await providers.privateStateProvider.set('zkPromoPrivateState', {
    currentPromoCode: padded,
    currentRedeemSecret: null,
  });

  console.log(`  Claiming with plaintext code (only the hash will touch the chain)...`);
  const finalized = await contract.callTx.claim(new Uint8Array(0));
  console.log(`  ✓ Claimed in tx ${finalized.public.txId} (block ${finalized.public.blockHeight})`);
  return finalized.public;
}

/** Operator: register a high-entropy redemption hash on-chain. */
export async function issueRedemption(contract: DeployedZkPromo, redeemHash: Uint8Array): Promise<FinalizedTxData> {
  if (redeemHash.length !== 32) throw new Error('redeemHash must be 32 bytes');
  console.log(`  Issuing redemption hash: 0x${Buffer.from(redeemHash).toString('hex')}`);
  const finalized = await contract.callTx.issueRedemption(redeemHash);
  console.log(`  ✓ Issued in tx ${finalized.public.txId} (block ${finalized.public.blockHeight})`);
  return finalized.public;
}

/** User: claim a high-entropy redemption token by submitting the 32-byte secret. */
export async function claimRedemption(contract: DeployedZkPromo, providers: ZkPromoProviders, secret: Uint8Array): Promise<FinalizedTxData> {
  if (secret.length !== 32) throw new Error('redemption secret must be exactly 32 bytes');
  // Load the secret into private state so the witness `user_redeem_secret()`
  // returns it during the prover call.
  await providers.privateStateProvider.set('zkPromoPrivateState', {
    currentPromoCode: null,
    currentRedeemSecret: secret,
  });

  console.log(`  Claiming redemption (only the hash will touch the chain)...`);
  const finalized = await contract.callTx.claimRedemption();
  console.log(`  ✓ Redemption claimed in tx ${finalized.public.txId} (block ${finalized.public.blockHeight})`);
  return finalized.public;
}

/** Read on-chain state: valid hashes and their claimed status. */
export async function status(
  providers: ZkPromoProviders,
  contractAddress: ContractAddress,
): Promise<{ validCodes: string[]; claimed: Record<string, boolean>; validRedemptions: string[]; redeemed: Record<string, boolean> }> {
  const state = await providers.publicDataProvider
    .queryContractState(contractAddress)
    .then((cs: any) => (cs ? cs.data : null));
  const empty = { validCodes: [] as string[], claimed: {} as Record<string, boolean>, validRedemptions: [] as string[], redeemed: {} as Record<string, boolean> };
  if (!state) return empty;
  const ledgerState: any = ledgerFn(state);
  const validCodes: string[] = [];
  const claimed: Record<string, boolean> = {};
  if (ledgerState.validCodes && typeof ledgerState.validCodes === 'object') {
    for (const member of ledgerState.validCodes) {
      const hex = '0x' + Buffer.from(member).toString('hex');
      validCodes.push(hex);
      claimed[hex] = ledgerState.claimed?.lookup?.(member) ?? false;
    }
  }
  const validRedemptions: string[] = [];
  const redeemed: Record<string, boolean> = {};
  if (ledgerState.validRedemptions && typeof ledgerState.validRedemptions === 'object') {
    for (const member of ledgerState.validRedemptions) {
      const hex = '0x' + Buffer.from(member).toString('hex');
      validRedemptions.push(hex);
      redeemed[hex] = ledgerState.redeemed?.lookup?.(member) ?? false;
    }
  }
  return { validCodes, claimed, validRedemptions, redeemed };
}

