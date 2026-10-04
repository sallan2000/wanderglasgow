// Used only by the isolated fixture server. Never imported by the product build.
type Row = { id: string; name: string; latitude: number; longitude: number; updated_at: string };
const key = 'starting-area-browser-fixture';
const saved = sessionStorage.getItem(key);
const rows: Row[] = saved ? JSON.parse(saved) : [
  { id: 'centre', name: 'City centre', latitude: 55.8609, longitude: -4.2514, updated_at: 'seed' },
];
const held = new Map<string, () => void>();
export const state = {
  rows,
  fail: '',
  writes: 0,
  origin: null as { lat: number; lon: number } | null,
  hold: '',
  holdOperation(operation: string) { this.hold = operation; },
  releaseOperation(operation: string) {
    if (this.hold === operation) this.hold = '';
    held.get(operation)?.();
    held.delete(operation);
  },
};
Object.assign(window, { areaFixture: state });
export const supabase = {
  from() {
    let operation = 'read';
    let payload: Partial<Row> = {};
    let single = false;
    const filters: [keyof Row, unknown][] = [];
    const q: any = {
      select() { return q; }, order() { return q; }, range() { return q; },
      abortSignal() { return q; },
      eq(field: keyof Row, value: unknown) { filters.push([field, value]); return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      insert(data: Partial<Row>) { operation = 'save'; payload = data; return q; },
      update(data: Partial<Row>) { operation = 'save'; payload = data; return q; },
      delete() { operation = 'delete'; return q; },
      async then(resolve: (value: unknown) => void) {
        // Delay exercises loading and double-submit safeguards.
        await new Promise(r => setTimeout(r, 80));
        if (state.hold === operation) {
          await new Promise<void>(release => held.set(operation, release));
        }
        if (state.fail === operation || (state.fail === 'setup' && operation === 'read')) {
          const code = state.fail === 'setup' ? 'PGRST205' : 'NETWORK';
          state.fail = ''; return resolve({ data: null, error: { code } });
        }
        const matches = () => state.rows.filter(row => filters.every(([field, value]) => row[field] === value));
        let result = matches();
        if (operation === 'save') {
          if (state.rows.some(row => row.name.toLowerCase() === payload.name?.toLowerCase() && row.id !== filters.find(f => f[0] === 'id')?.[1])) {
            return resolve({ data: null, error: { code: '23505' } });
          }
          state.writes++;
          const stamp = `${Date.now()}-${state.writes}`;
          if (payload.id) { const row = { ...payload, updated_at: stamp } as Row; state.rows.push(row); result = [row]; }
          else result.forEach(row => Object.assign(row, payload, { updated_at: stamp }));
        }
        if (operation === 'delete') {
          state.writes++;
          state.rows = state.rows.filter(row => !result.includes(row));
        }
        if (operation !== 'read') sessionStorage.setItem(key, JSON.stringify(state.rows));
        resolve({ data: single ? result[0] ?? null : structuredClone(result), error: null });
      },
    };
    return q;
  },
};
export class CatalogueError extends Error {}
export async function loadPublicCatalogue() { return { attractions: [] }; }