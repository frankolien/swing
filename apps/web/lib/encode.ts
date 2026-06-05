/** Minimal ERC-20 transfer(address,uint256) calldata encoder for the spend simulator. */
export function encodeTransfer(to: string, amount: bigint): `0x${string}` {
  const selector = "a9059cbb";
  const addr = to.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amt = amount.toString(16).padStart(64, "0");
  return `0x${selector}${addr}${amt}`;
}
