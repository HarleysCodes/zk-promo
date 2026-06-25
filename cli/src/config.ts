// SPDX-License-Identifier: MIT
// Network endpoints + zk-asset path for the ZK Promo dapp.
//
// Defaults to the Midnight Preview testnet (where this dapp's Zealy quest
// submission is meant to run). Override via env vars to point elsewhere
// (e.g. preprod/mainnet later).

import path from 'node:path';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js/network-id';

// Domain tag for the memorable-code path (issue/claim). MUST match
// the one in `contract/src/zk_promo.compact`:
//   pure circuit hashCode(code: Bytes<32>): Bytes<32> {
//     return persistentHash<Vector<2, Bytes<32>>>([pad(32, "zk-promo:v1:"), code]);
//   }
// If you change it here, change it there too. The test suite enforces
// operator-side == on-chain hash byte-for-byte, so a drift fails CI.
export const HASH_DOMAIN = 'zk-promo:v1:';

// Domain tag for the high-entropy redemption primitive. MUST match
// the one in `contract/src/zk_promo.compact`:
//   pure circuit hashRedemption(secret: Bytes<32>): Bytes<32> {
//     return persistentHash<Vector<2, Bytes<32>>>([pad(32, "zk-promo:redeem:v1:"), secret]);
//   }
// Distinct from HASH_DOMAIN above so the same secret value cannot
// be valid in both the memorable-code and redemption sets (domain
// separation, per MPS-xxxx Domain Separation for Midnight Hash Constructions).
export const REDEMPTION_DOMAIN = 'zk-promo:redeem:v1:';

// Managed contract path: compiled artifacts land in <repo>/contract/managed/contract/
// (output of `compact compile src/zk_promo.compact managed`).
const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const contractConfig = {
  privateStateStoreName: 'zk-promo-private-state',
  zkConfigPath: path.resolve(currentDir, '..', '..', 'contract', 'managed', 'contract'),
};

export interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

/**
 * Midnight Preview testnet configuration.
 *
 * RPC + indexer are public; the proof server runs locally via Docker
 * (counter-cli uses the same pattern). See README "Run on Preview"
 * section for the docker-compose command.
 */
export class PreviewConfig implements Config {
  indexer = 'https://indexer.preview.midnight.network/api/v3/graphql';
  indexerWS = 'wss://indexer.preview.midnight.network/api/v3/graphql/ws';
  node = 'https://rpc.preview.midnight.network';
  proofServer = 'http://127.0.0.1:6300';
  constructor() {
    setNetworkId('preview');
  }
}

export function activeConfig(): Config {
  // Single-network dapp for the quest submission. If we ever add preprod/mainnet,
  // switch on an env var here.
  return new PreviewConfig();
}

export function networkId(): string {
  return getNetworkId();
}
