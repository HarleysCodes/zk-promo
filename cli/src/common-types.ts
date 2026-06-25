// SPDX-License-Identifier: MIT
// Shared TypeScript types for the dapp's compiled contract and providers.
//
// Mirrors counter-cli's common-types.ts pattern. Provides:
//   - ZkPromoCircuits:    typed access to contract circuits
//   - ZkPromoPrivateState: shape of off-chain witness state (here, an empty placeholder)
//   - ZkPromoProviders:    the four midnight-js providers as a single object
//   - DeployedZkPromo:     handle returned by deployContract / findDeployedContract

import type { MidnightProviders } from '@midnight-ntwrk/midnight-js/types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js/contracts';
import { Contract } from '../../contract/managed/contract/index.js';

// The Compact contract class instantiated with `undefined` private state
// (the dapp doesn't store any private state between calls; the witness
// returns its value inline).
export type ZkPromoContract = Contract<undefined>;
export type ZkPromoCircuits = any;  // SDK generics don't permit user contracts cleanly
export const ZkPromoPrivateStateId = 'zkPromoPrivateState';

// Private state holds the witness return values between calls. The ZK Promo
// witness `user_promo_code(salt)` returns the plaintext code, which we keep
// locally between "load the code into the witness" and "submit the proof".
export interface ZkPromoPrivateState {
  currentPromoCode: Uint8Array | null;
}

export const emptyPrivateState = (): ZkPromoPrivateState => ({
  currentPromoCode: null,
});

export type ZkPromoProviders = MidnightProviders<
  ZkPromoCircuits,
  typeof ZkPromoPrivateStateId,
  ZkPromoPrivateState
>;
export type DeployedZkPromo = DeployedContract<ZkPromoContract> | FoundContract<ZkPromoContract>;


