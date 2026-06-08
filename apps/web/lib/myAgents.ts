// Browser-local registry of agents this wallet has launched. Operator-onboarded agents get a
// *derived* id (100_000 + owner % 900_000) that the engine's id-range scan never enumerates, so
// there's no on-chain way to list "agents I created" — we remember the ids here and read their
// live state back from chain by id. Demo-grade: per-browser, not cross-device.
const KEY = "swing:my-agents";

export interface MyAgent {
  id: string;
  owner: string;
}

export function getMyAgents(owner?: string): MyAgent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as MyAgent[]) : [];
    const norm = owner?.toLowerCase();
    return norm ? list.filter((a) => a.owner.toLowerCase() === norm) : list;
  } catch {
    return [];
  }
}

export function addMyAgent(id: string, owner: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getMyAgents();
    if (list.some((a) => a.id === id)) return;
    list.push({ id, owner: owner.toLowerCase() });
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage disabled or over quota — non-fatal, agent still lives on-chain */
  }
}
