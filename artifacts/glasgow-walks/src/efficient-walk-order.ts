export const MAX_WALK_CANDIDATES = 50;
type Matrix = (number | null)[][];
type Order = { order: number[]; distanceMeters: number };
type SearchLimits = { maxExpansions?: number; maxMilliseconds?: number };
export class WalkOptimisationLimitError extends Error {
  constructor() { super('This search is too large to prove the shortest stop order. Choose a smaller radius, fewer stops or a more specific category, then try again.'); }
}

/**
 * Exact bounded-depth search: maximise stop count, then minimise supplied walking
 * distance. No metric/symmetry assumption, greedy result, hidden shortlist or
 * forced return to the origin. Greedy paths are upper bounds only; relaxed
 * incoming/outgoing bounds and same-state dominance safely prune the search.
 */
function* search(matrix: Matrix, maxStops: number, budget: number, limits: SearchLimits): Generator<void, Order> {
  const count = matrix.length - 1;
  if (count < 0 || matrix.some(row => !Array.isArray(row) || row.length !== count + 1 ||
    row.some(v => v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)))) throw new Error('Invalid walking matrix.');
  if (!Number.isInteger(maxStops) || maxStops < 1 || maxStops > 6 ||
    !Number.isFinite(budget) || budget <= 0) throw new Error('Invalid walking limits.');
  if (count > MAX_WALK_CANDIDATES) throw new WalkOptimisationLimitError();
  if (!count) return { order: [], distanceMeters: 0 };
  const costs = matrix.map(row => row.map(v => v === null ? Infinity : v));
  const nodes = Array.from({ length: count }, (_, i) => i + 1);
  const successors = costs.map((row, from) => nodes.filter(to => to !== from && Number.isFinite(row[to]))
    .sort((a, b) => row[a] - row[b] || a - b));
  const incoming = costs[0].map((_, to) => Math.min(...costs.map((row, from) => from === to ? Infinity : row[to])));
  const outgoing = costs.map((row, from) => Math.min(...nodes.map(to => from === to ? Infinity : row[to])));
  const used = new Uint8Array(count + 1);
  const maxExpansions = limits.maxExpansions ?? 2_000_000;
  const maxMilliseconds = limits.maxMilliseconds ?? 12000;
  const started = performance.now();
  let expansions = 0;
  for (let target = Math.min(count, maxStops); target >= 1; target--) {
    let best: number[] | null = null, bestDistance = Infinity;
    // Cheap feasible paths improve the upper bound, never determine the result.
    for (const first of successors[0]) {
      used.fill(0); used[first] = 1;
      const path = [first];
      let distance = costs[0][first];
      while (path.length < target && distance <= budget) {
        const last = path[path.length - 1];
        const next = successors[last].find(to => !used[to] && distance + costs[last][to] <= budget);
        if (next === undefined) break;
        path.push(next); used[next] = 1; distance += costs[last][next];
      }
      if (path.length === target && distance <= budget && distance < bestDistance) { best = path; bestDistance = distance; }
    }
    used.fill(0);
    const path: number[] = [];
    // Bounded memory: stopping memoisation does not stop the exact search.
    const memo = new Map<string, number>();
    const prunable = (distance: number) => distance > budget || (best !== null && distance >= bestDistance);
    const smallest = (values: number[], amount: number) => {
      let total = 0;
      values.sort((a, b) => a - b);
      for (let i = 0; i < amount; i++) total += values[i] ?? Infinity;
      return total;
    };
    function* visit(last: number, mask: bigint, distance: number): Generator<void> {
      if (++expansions > maxExpansions) throw new WalkOptimisationLimitError();
      // Cooperative yielding keeps cancellation and page controls usable.
      if ((expansions & 255) === 0) {
        if (performance.now() - started > maxMilliseconds) throw new WalkOptimisationLimitError();
        yield;
      }
      if (path.length === target) {
        if (distance <= budget && distance < bestDistance) { best = [...path]; bestDistance = distance; }
        return;
      }
      if (prunable(distance)) return;
      const state = `${mask}:${last}`;
      const prior = memo.get(state);
      if (prior !== undefined && prior <= distance) return;
      if (memo.size < 100_000) memo.set(state, distance);
      const remaining = target - path.length;
      const available = nodes.filter(to => !used[to]);
      if (available.length < remaining) return;
      const firstLeg = Math.min(...available.map(to => costs[last][to]));
      // Every extension has a first edge and distinct predecessor/destination
      // nodes. These deliberately relaxed bounds also handle asymmetric graphs,
      // zero-length links and disconnected nodes; they need no triangle inequality.
      const bound = Math.max(
        smallest(available.map(to => incoming[to]), remaining),
        firstLeg + smallest(available.map(to => outgoing[to]), remaining - 1),
      );
      if (prunable(distance + bound)) return;
      for (const next of successors[last]) {
        if (used[next] || prunable(distance + costs[last][next])) continue;
        used[next] = 1; path.push(next);
        yield* visit(next, mask | (1n << BigInt(next - 1)), distance + costs[last][next]);
        path.pop(); used[next] = 0;
      }
    }
    yield* visit(0, 0n, 0);
    // Only return after the whole search proves there is no better route.
    if (best !== null) return { order: best, distanceMeters: bestDistance };
  }
  return { order: [], distanceMeters: 0 };
}

export function findEfficientOrder(matrix: Matrix, maxStops: number, budget: number, limits: SearchLimits = {}): Order {
  const iterator = search(matrix, maxStops, budget, limits);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}
export async function findEfficientOrderAsync(
  matrix: Matrix, maxStops: number, budget: number, signal?: AbortSignal, limits: SearchLimits = {},
): Promise<Order> {
  const iterator = search(matrix, maxStops, budget, limits);
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Planning cancelled.', 'AbortError');
      const step = iterator.next();
      if (step.done) return step.value;
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  } finally { iterator.return({ order: [], distanceMeters: 0 }); }
}