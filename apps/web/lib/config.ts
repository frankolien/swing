export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8799";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://explorer.sepolia.mantle.xyz";
export const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ID ?? "1";
export const CHAIN_NAME = "Mantle Sepolia";
export const CHAIN_ID = 5003;

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addrUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

/** Deployed swing contracts on Mantle Sepolia (5003) — used by the wallet-signed flows. */
export const CONTRACTS = {
  MockUSDC: "0xa29799A188C220B17788a355Ec0166523172B09d",
  ReputationOracle: "0xe00962601106D055be7A1f97CD53c9C7B4b46632",
  CreditVault: "0x0aD20c99D72AA4371317a85A85Ce39C318a2b114",
  CreditManager: "0x1be497f127561a8F3e53aF53452Ce6cdC09e31a8",
  GuardedAccountFactory: "0xB1ccd35E453eB0a4eeD05a3AE0BFC638B397B997",
} as const;

/** Demo presets for the spending-controls simulator. */
export const DEMO = {
  merchant: "0x1111111111111111111111111111111111111111",
  attacker: "0x2222222222222222222222222222222222222222",
  // a real, mined, FAILED rogue-tx on Mantle Sepolia (status 0) — the on-chain proof
  rogueTx: "0x16d6faaff4087db6fe47647cc563bb75114f90dd6a02a856f8f86ce1f5335ff7",
};
