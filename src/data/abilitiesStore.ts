// Client wrappers around the Vite dev middleware for the single
// `public/data/abilities/all.json` file. On the server side this re-uses the
// generic /__save-data/ability/:name and /__list-data/ability endpoints.

const ALL_PATH = '/data/abilities/all.json';

export async function loadAllAbilityNames(): Promise<string[]> {
  try {
    const res = await fetch(`${ALL_PATH}?t=${Date.now()}`);
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? (body as string[]) : [];
  } catch {
    return [];
  }
}

export async function saveAllAbilityNames(names: string[]): Promise<void> {
  const sorted = Array.from(new Set(names)).sort();
  await fetch(`/__save-data/ability/all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sorted, null, 2),
  });
}

export async function mergeAbilityNames(newNames: string[]): Promise<void> {
  if (newNames.length === 0) return;
  const existing = await loadAllAbilityNames();
  const merged = new Set(existing);
  let changed = false;
  for (const n of newNames) {
    if (!merged.has(n)) {
      merged.add(n);
      changed = true;
    }
  }
  if (changed) await saveAllAbilityNames(Array.from(merged));
}
