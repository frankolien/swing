/**
 * CLI: ERC-7579 spending guard on a real Kernel v3.1 smart account via Pimlico on Mantle Sepolia —
 * a thin wrapper over src/aa.ts (the same core the engine's /aa/* API and web panel use).
 *
 *   pnpm --filter @swing/engine aa-demo
 *
 * Needs PIMLICO_API_KEY in .env (free at dashboard.pimlico.io). Gas is sponsored, so the owner key
 * holds no funds — it only signs UserOps. AA_ACCOUNT_INDEX picks the account (bump for a clean one).
 *
 * It deploys + funds the account, installs SpendingGuardValidator + Hook (sponsored), then routes
 * three spends through the agent validator: an allowed one MINES; rogue ones (bad destination, over
 * the per-tx cap) are REFUSED — the hook's preCheck reverts, so the bundler won't include the UserOp.
 */
import { aaReady, aaPrepare, aaSpend, AA_EXPLORER, type AaSpendKind } from "../src/aa.js";

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n⛔ ${msg}\n`);
    process.exit(1);
  }
}

async function main() {
  const r = aaReady();
  need(r.ready, r.reason);

  console.log("the swing — ERC-7579 / Pimlico AA demo   (Mantle Sepolia · chainId 5003)\n");
  console.log("preparing account (deploy + fund + install SpendingGuardValidator + Hook, all sponsored)…");
  const { state, mintedTx, installedTx } = await aaPrepare();
  if (mintedTx) console.log(`  funded     ${AA_EXPLORER}/tx/${mintedTx}`);
  if (installedTx) console.log(`  installed  ${AA_EXPLORER}/tx/${installedTx}`);

  console.log(`\nkernel account   ${state.account}`);
  console.log(`owner / agent    ${state.owner} / ${state.agent}${state.owner === state.agent ? "  (set AGENT_SESSION_PRIVATE_KEY to scope the agent)" : ""}`);
  console.log(`validator        ${state.validator}  installed=${state.validatorInstalled ? "✅" : "❌"}`);
  console.log(`hook             ${state.hook}`);
  console.log(`policy           perTx $${state.policy?.perTxCapUsd} · daily $${state.policy?.dailyLimitUsd} · frozen ${state.policy?.frozen}`);
  console.log(`balance          ${state.balanceUsd} USDC`);

  console.log("\n✓ live on Mantle Sepolia, gas sponsored by Pimlico. Spending through the agent validator:");
  for (const kind of ["allowed", "rogueDest", "rogueCap"] as AaSpendKind[]) {
    const s = await aaSpend(kind);
    console.log(`\n→ ${s.label}: ${s.amountUsd} USDC → ${s.to}`);
    if (s.outcome === "mined") {
      console.log(`  ✅ ALLOWED — UserOp mined  ${s.explorerTx}`);
    } else {
      console.log("  ⛔ REFUSED — the guard's preCheck reverts, so Pimlico won't include the UserOp");
      console.log(`     ${s.reason}`);
    }
  }
  console.log("\n✓ Same SpendingGuardLib policy as the standalone GuardedAccount — now on a real ERC-7579 Kernel account.");
}

main().catch((e: unknown) => {
  console.error("\n💥 aa-demo failed:\n", (e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? e);
  process.exit(1);
});
