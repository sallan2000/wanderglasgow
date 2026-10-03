import type { ManagedWalk, WalkInput } from '../../src/walk-validation';
import { CatalogueError } from './walk-list-attraction-store';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
};
type ListRequest = Deferred<ManagedWalk[]>;
type SaveRequest = Deferred<ManagedWalk> & { input: WalkInput; existing?: ManagedWalk };
type DeleteRequest = Deferred<void> & { walk: ManagedWalk };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

export class WalkSetupError extends CatalogueError {}

const state: {
  listRequests: ListRequest[];
  saveRequests: SaveRequest[];
  deleteRequests: DeleteRequest[];
} = {
  listRequests: [],
  saveRequests: [],
  deleteRequests: [],
};

export const walkListFixture = {
  state,
  reset() {
    state.listRequests.length = 0;
    state.saveRequests.length = 0;
    state.deleteRequests.length = 0;
  },
  async resolveList(index: number, rows: ManagedWalk[]) {
    state.listRequests[index]?.resolve(structuredClone(rows));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  },
  rejectList(index: number, message: string) {
    state.listRequests[index]?.reject(new CatalogueError(message));
  },
  resolveSave(index: number, saved?: Partial<ManagedWalk>) {
    const request = state.saveRequests[index];
    if (!request) throw new Error(`No save request at index ${index}`);
    const { input, existing } = request;
    request.resolve({
      ...input,
      id: existing?.id ?? `new-walk-${index}`,
      start: input.stops[0]?.name ?? '',
      updatedAt: '2026-10-03T12:00:00Z',
      ...saved,
    });
  },
  resolveDelete(index: number) {
    state.deleteRequests[index]?.resolve();
  },
  rejectDelete(index: number, message: string) {
    state.deleteRequests[index]?.reject(new CatalogueError(message));
  },
};

export function listManagedWalks(): Promise<ManagedWalk[]> {
  const request = deferred<ManagedWalk[]>();
  state.listRequests.push(request);
  return request.promise;
}

export function saveWalk(input: WalkInput, existing?: ManagedWalk): Promise<ManagedWalk> {
  const request = deferred<ManagedWalk>();
  state.saveRequests.push({ ...request, input: structuredClone(input), existing: existing && structuredClone(existing) });
  return request.promise;
}

export function deleteWalk(walk: ManagedWalk): Promise<void> {
  const request = deferred<void>();
  state.deleteRequests.push({ ...request, walk: structuredClone(walk) });
  return request.promise;
}

export function measureCuratedWalk() {
  throw new Error('Unexpected route measurement in walk-list regression tests');
}