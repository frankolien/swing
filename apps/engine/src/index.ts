import { serve } from "@hono/node-server";
import { app } from "./api.js";
import { startIndexer } from "./indexer.js";
import { startRegistry } from "./registry.js";
import { PORT, CHAIN_ID } from "./config.js";
import { account } from "./chain.js";

startIndexer();
startRegistry();

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(
    `[swing engine] :${PORT}  chain=${CHAIN_ID}  signer=${account?.address ?? "NONE — set ORACLE_SIGNER_PRIVATE_KEY"}`
  );
});
