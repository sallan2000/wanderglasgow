// Runtime imports from the editor resolve here only in the isolated test server.
// Requests intentionally ignore cancellation, to test the editor's stale guards.
import type { ManagedWalk, WalkInput } from '../../src/walk-validation';

export class CatalogueError extends Error {}
export const state = {
  requests: [] as {
    stops: unknown[];
    signal?: AbortSignal;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }[],
  saves: 0,
  saveInputs: [] as WalkInput[],
  savedWalk: null as ManagedWalk | null,
  allowSave: false,
  failNextSave: false,
};

export function configureSaveFixture(allowSave: boolean) {
  state.allowSave = allowSave;
}

export function measureCuratedWalk(stops: unknown[], signal?: AbortSignal) {
  return new Promise((resolve, reject) => {
    state.requests.push({ stops: structuredClone(stops), signal, resolve, reject });
  });
}
export async function saveWalk(input: WalkInput, existing?: ManagedWalk): Promise<ManagedWalk> {
  state.saves++;
  state.saveInputs.push(structuredClone(input));
  if (state.failNextSave) {
    state.failNextSave = false;
    throw new Error('The fixture rejected this save once');
  }
  if (!state.allowSave) throw new Error('Saving is forbidden in the component regression suite');
  const saved: ManagedWalk = {
    ...structuredClone(input),
    id: existing?.id ?? 'fixture',
    start: input.stops[0]?.name ?? '',
    updatedAt: '2026-10-04T00:00:00Z',
  };
  state.savedWalk = structuredClone(saved);
  return saved;
}