import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real hook's Leaflet events without network or owner credentials.
const source = await readFile(new URL('../src/map-tiles.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const state = [];
const react = {
  useCallback: fn => fn,
  useRef: value => ({ current: value }),
  useState: initial => {
    const i = state.push(initial) - 1;
    return [initial, value => { state[i] = value; }];
  },
};
const exports = {};
vm.runInNewContext(compiled, { exports, require: name => name === 'react' ? react : {} });
const tiles = exports.useMapTiles();
const layers = [];
const L = {
  tileLayer: () => {
    const layer = {
      handlers: {},
      redraws: 0,
      on(handlers) { this.handlers = handlers; },
      off() { this.handlers = {}; },
      addTo(map) { this.map = map; if (map.throw) throw Error('Construction failed'); },
      fire(name) { this.handlers[name]?.(); },
      redraw() { this.redraws++; this.fire('loading'); },
    };
    layers.push(layer);
    return layer;
  },
};
const map = { route: {}, pin: {}, center: [55.86, -4.25] };
const original = { ...map };
const detach = tiles.attach(L, map);
const layer = layers[0];
layer.fire('loading');
layer.fire('tileerror');
assert.equal(state[0], true, 'A tile failure is immediately visible');
layer.fire('tileload');
layer.fire('load');
assert.equal(state[0], true, 'Partial success must not hide failed tiles');
tiles.retry();
assert.equal(state[1], true);
assert.equal(state[0], true, 'Keep the notice while retrying');
assert.equal(layer.redraws, 1);
assert.deepEqual(map, original, 'Retry must preserve overlays and view');
layer.fire('tileerror');
layer.fire('load');
assert.equal(state[0], true, 'A failed retry retains the notice');
assert.equal(state[1], false, 'A failed retry can be retried again');
tiles.retry();
layer.fire('tileload');
layer.fire('load');
assert.equal(state[0], false, 'A fully successful retry clears the notice');
assert.equal(state[1], false);
layer.fire('loading');
layer.fire('tileerror');
layer.fire('load');
assert.equal(state[0], true, 'A later pan/zoom failure is reported');
layer.fire('loading');
layer.fire('load');
assert.equal(state[0], true, 'No newly loaded tiles is not proof of recovery');
layer.fire('loading');
layer.fire('tileload');
layer.fire('load');
assert.equal(state[0], false, 'Normal successful tile loading also recovers');
detach();
layer.fire('tileerror');
tiles.retry();
assert.equal(state[0], false, 'Unmounted events cannot change status');
assert.equal(layer.redraws, 2, 'Retry after cleanup is a no-op');
assert.throws(() => tiles.attach(L, { throw: true }), /Construction failed/);
assert.equal(Object.keys(layers[1].handlers).length, 0, 'Construction failure removes listeners');
const detachNew = tiles.attach(L, {});
assert.equal(state[0], false, 'A new map starts without a stale warning');
detachNew();
console.log('Map tile failure, partial recovery, retry preservation and cleanup checks passed.');