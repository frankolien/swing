export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8799";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://explorer.sepolia.mantle.xyz";
export const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ID ?? "1";
export const CHAIN_NAME = "Mantle Sepolia";
export const CHAIN_ID = 5003;

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addrUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

/** Demo presets for the spending-controls simulator. */
export const DEMO = {
  merchant: "0x1111111111111111111111111111111111111111",
  attacker: "0x2222222222222222222222222222222222222222",
  // a real, mined, FAILED rogue-tx on Mantle Sepolia (status 0) — the on-chain proof
  rogueTx: "0x0ec58c2f015116ad89fcb558aa8e429ceefac2c20edd7ce2c28bdab26734ced2",
};
