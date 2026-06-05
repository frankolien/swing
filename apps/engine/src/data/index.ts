import { DATA_SOURCE } from "../config.js";
import type { DataSource } from "./source.js";
import { SimulatedSource } from "./simulated.js";

let instance: DataSource | null = null;

/// Returns the configured data source. `byreal` / `realclaw` implement the same DataSource
/// interface when available; we default to simulated (transparently labeled) until then.
export function getSource(): DataSource {
  if (instance) return instance;
  switch (DATA_SOURCE) {
    case "simulated":
    default:
      instance = new SimulatedSource();
  }
  return instance;
}
