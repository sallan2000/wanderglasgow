// Runtime imports from the editor resolve here only in the isolated test server.
// Requests intentionally ignore cancellation, to test the editor's stale guards.
export class CatalogueError extends Error {}
export const state = {
  requests: [] as {
    stops: unknown[];
    signal?: AbortSignal;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }[],
  saves: 0,
};
export function measureCuratedWalk(stops: unknown[], signal?: AbortSignal) {
  return new Promise((resolve, reject) => {
    state.requests.push({ stops: structuredClone(stops), signal, resolve, reject });
  });
}
export function saveWalk() {
  state.saves++;
  throw new Error('Saving is forbidden in the component regression suite');
}