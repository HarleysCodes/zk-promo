// Single source of truth for the chain endpoints. Point at the local
// docker-compose stack from midnightntwrk/example-counter, or swap in
// preprod URLs after bringing up a public-network proof-server.
export const NETWORK_CONFIG = {
  networkId: 'undeployed',
  indexer: 'http://127.0.0.1:8088/api/v3/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v3/graphql/ws',
  node: 'http://127.0.0.1:9944',
  proofServer: 'http://127.0.0.1:6300',
} as const;

// Must match the `pad(32, "zk-promo:v1:")` prefix in the .compact file.
// Operator tools (issue.ts) and the on-chain claim circuit (claim()
// in zk_promo.compact) both use this constant; keep them in lockstep.
export const HASH_DOMAIN = 'zk-promo:v1:';
