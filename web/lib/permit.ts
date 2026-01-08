/**
 * EIP-2612 Permit Utilities for USDC
 *
 * Enables gasless token approvals via off-chain signatures. User signs a typed
 * message authorizing a spender, which is submitted on-chain as part of the
 * Bundler3 multicall. Eliminates separate approve() transaction.
 *
 * USDC v2.2 supports EIP-2612 with maxUint256 deadline for 4337 compatibility.
 *
 * @see https://eips.ethereum.org/EIPS/eip-2612
 * @see https://www.circle.com/blog/announcing-usdc-v2-2
 */

import type { Address, WalletClient, PublicClient, Hex } from 'viem';
import { maxUint256 } from 'viem';
import { contracts } from '@/lib/contracts';
import { UsdcPermitAbi } from '@/lib/contracts/abis/Bundler3';

// EIP-712 typed data structure for EIP-2612 permit
export const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/**
 * USDC EIP-712 domain for Ethereum mainnet/VTE.
 * Domain values match USDC contract's DOMAIN_SEPARATOR construction.
 */
export function getUsdcPermitDomain(chainId: number) {
  return {
    name: 'USD Coin',
    version: '2',
    chainId,
    verifyingContract: contracts.usdc.address,
  };
}

/**
 * Fetch current permit nonce for an owner address.
 * Nonce auto-increments after each successful permit.
 */
export async function getUsdcNonce(
  publicClient: PublicClient,
  owner: Address
): Promise<bigint> {
  const nonce = await publicClient.readContract({
    address: contracts.usdc.address,
    abi: UsdcPermitAbi,
    functionName: 'nonces',
    args: [owner],
  });
  return nonce as bigint;
}

/**
 * Split a 65-byte signature into v, r, s components.
 * Required for on-chain permit() call which takes separate parameters.
 */
export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  // Remove 0x prefix and validate length (65 bytes = 130 hex chars)
  const sig = signature.slice(2);
  if (sig.length !== 130) {
    throw new Error(`Invalid signature length: expected 130 hex chars, got ${sig.length}`);
  }

  const r = `0x${sig.slice(0, 64)}` as Hex;
  const s = `0x${sig.slice(64, 128)}` as Hex;
  // v is last byte - could be 27/28 or 0/1 depending on signer
  let v = parseInt(sig.slice(128, 130), 16);

  // Normalize v to 27/28 (EIP-155 style) if it's 0/1
  if (v < 27) {
    v += 27;
  }

  return { v, r, s };
}

export interface PermitSignature {
  v: number;
  r: Hex;
  s: Hex;
  deadline: bigint;
}

/**
 * Sign EIP-2612 permit for USDC spending authorization.
 *
 * @param walletClient - Viem wallet client with signing capability
 * @param publicClient - Viem public client for reading nonce
 * @param owner - Address granting approval (must match walletClient account)
 * @param spender - Address receiving approval (GeneralAdapter1 for Bundler3 flow)
 * @param value - Amount to approve (typically exact supply amount)
 * @param deadline - Optional expiry timestamp (defaults to maxUint256 for UX)
 * @returns Signature components ready for on-chain permit() call
 */
export async function signUsdcPermit(
  walletClient: WalletClient,
  publicClient: PublicClient,
  owner: Address,
  spender: Address,
  value: bigint,
  deadline: bigint = maxUint256
): Promise<PermitSignature> {
  // Fetch current nonce - must match what contract expects
  const nonce = await getUsdcNonce(publicClient, owner);

  // Construct EIP-712 domain for this chain
  const chainId = await publicClient.getChainId();
  const domain = getUsdcPermitDomain(chainId);

  // Sign typed data (prompts user wallet)
  const signature = await walletClient.signTypedData({
    account: owner,
    domain,
    types: PERMIT_TYPES,
    primaryType: 'Permit',
    message: {
      owner,
      spender,
      value,
      nonce,
      deadline,
    },
  });

  // Split into components for on-chain call
  const { v, r, s } = splitSignature(signature);

  return { v, r, s, deadline };
}
