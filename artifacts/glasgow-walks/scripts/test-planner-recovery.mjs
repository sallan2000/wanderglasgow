import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temporary = await mkdtemp(join(tmpdir(), 'glasgow-planner-recovery-'));
try {
  for (const name of ['efficient-walk-order', 'planner-recovery']) {
    const source = await readFile(resolve('src', `${name}.ts`), 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText.replace(/from '(\.\.?\/[^']+)'/g, (m, p1) => `from '${p1}.mjs'`);
    await writeFile(join(temporary, `${name}.mjs`), output);
  }

  const { WalkOptimisationLimitError } = await import(pathToFileURL(join(temporary, 'efficient-walk-order.mjs')).href);
  const { getRecoveryActions } = await import(pathToFileURL(join(temporary, 'planner-recovery.mjs')).href);

  const baseOptions = (over = {}) => ({ theme: 'All', radiusKm: 2, maxStops: 3, accessPreference: 'any', ...over });
  const radii = [1, 2, 3, 4, 5, 10];

  // WalkOptimisationLimitError -> "smaller radius" + "fewer stops".
  const e1 = new WalkOptimisationLimitError();
  const a1 = getRecoveryActions(e1, baseOptions(), { radii });
  assert.equal(a1.length, 2, 'optimisation limit yields two fixes');
  assert.equal(a1[0].kind, 'radius-down');
  assert.equal(a1[1].kind, 'stops-down');

  // "empty" with radius room -> widen radius, switch to nearby, use my location.
  const e2 = new Error('No attractions match your selected categories near your starting point. Try different categories, a wider radius, or another Glasgow start.');
  e2.name = 'WalkPlanningError';
  e2.kind = 'empty';
  const a2 = getRecoveryActions(e2, baseOptions(), { radii });
  assert.ok(a2.some(a => a.kind === 'radius-up'), 'empty with room widens radius');
  assert.ok(a2.some(a => a.kind === 'switch-to-nearby'), 'empty switches to nearby');
  assert.ok(a2.some(a => a.kind === 'start-mylocation'), 'empty offers my-location');

  // "empty" at the largest radius -> no radius-up, but still nearby + my-location.
  const a3 = getRecoveryActions(e2, baseOptions({ radiusKm: 10 }), { radii });
  assert.ok(!a3.some(a => a.kind === 'radius-up'), 'empty at max radius drops radius-up');
  assert.ok(a3.some(a => a.kind === 'switch-to-nearby'), 'empty at max radius still offers nearby');
  assert.ok(a3.some(a => a.kind === 'start-mylocation'), 'empty at max radius still offers my-location');

  // "exceeded the distance limit" -> fewer stops + closer start.
  const e4 = new Error('The final walking route exceeded the distance limit. Try fewer stops or a closer start.');
  e4.name = 'WalkPlanningError';
  e4.kind = 'service';
  const a4 = getRecoveryActions(e4, baseOptions(), { radii });
  assert.ok(a4.some(a => a.kind === 'stops-down'), 'distance-limit offers fewer stops');
  assert.ok(a4.some(a => a.kind === 'start-mylocation'), 'distance-limit offers closer start');

  // "no matching within walking distance" -> widen radius + nearby.
  const e5 = new Error('No matching attractions are within that walking distance. Try a wider radius or all categories.');
  e5.name = 'WalkPlanningError';
  e5.kind = 'empty';
  const a5 = getRecoveryActions(e5, baseOptions(), { radii });
  assert.ok(a5.some(a => a.kind === 'radius-up'), 'no-walking-distance offers widen radius');
  assert.ok(a5.some(a => a.kind === 'switch-to-nearby'), 'no-walking-distance offers nearby');

  // Unknown walk-planning error falls back to a settings-check + retry.
  const e6 = new Error('Something else went wrong');
  e6.name = 'WalkPlanningError';
  e6.kind = 'location';
  const a6 = getRecoveryActions(e6, baseOptions(), { radii });
  assert.ok(a6.some(a => a.kind === 'retry'), 'unknown planning error offers retry');

  // Router-type errors are surfaced with their own message.
  const e7 = new Error('The walking service is unavailable. Please try again; no estimated straight-line route has been substituted.');
  e7.name = 'WalkPlanningError';
  e7.kind = 'service';
  const a7 = getRecoveryActions(e7, baseOptions(), { radii });
  assert.ok(a7.some(a => a.kind === 'retry' && a7[0].label === 'Try again'), 'service error offers retry');

  console.log('Planner recovery checks passed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
