import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Generate a downloadable one-time installation from the real curated catalogue.
// No credentials or user identities are included in this output.
const temp = await mkdtemp(join(tmpdir(), 'glasgow-catalogue-'));
try {
  for (const name of ['tours', 'attractions']) {
    const source = await readFile(resolve('src', `${name}.ts`), 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
    await writeFile(join(temp, `${name}.mjs`), output);
  }
  const { attractions } = await import(pathToFileURL(join(temp, 'attractions.mjs')).href);
  const { tours } = await import(pathToFileURL(join(temp, 'tours.mjs')).href);
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const values = attractions.map(a => `(${[a.id, a.name, a.description, a.place, a.theme].map(quote).join(', ')}, ${a.lat}, ${a.lon}, true)`).join(',\n');
  const schema = await readFile(resolve('supabase/schema.sql'), 'utf8');
  const categories = await readFile(resolve('supabase/categories.sql'), 'utf8');
  const walkSchema = await readFile(resolve('supabase/curated-walks.sql'), 'utf8');
  const startingAreas = await readFile(resolve('supabase/starting-areas.sql'), 'utf8');
  const walkValues = tours.map(t => `(${[t.id, t.title, t.subtitle, t.theme].map(quote).join(', ')}, ${quote(JSON.stringify(t.stops))}::jsonb, ${t.distanceKm}, ${t.minutes}, true)`).join(',\n');
  const walkSeed = `
do $walk_seed$
begin
  if not exists (select 1 from glasgow_walks_private.seed_history where seed_key = 'initial-curated-walks') then
    insert into public.glasgow_curated_walks (id, title, subtitle, theme, stops, distance_km, minutes, published)
    values
${walkValues}
    on conflict do nothing;
    insert into glasgow_walks_private.seed_history (seed_key) values ('initial-curated-walks');
  end if;
end;
$walk_seed$;
`;
  const seed = `
do $seed$
begin
  if not exists (select 1 from glasgow_walks_private.seed_history where seed_key = 'initial-catalogue') then
    insert into public.glasgow_attractions (id, name, description, place, theme, latitude, longitude, published)
    values
${values}
    on conflict do nothing;
    insert into glasgow_walks_private.seed_history (seed_key) values ('initial-catalogue');
  end if;
end;
$seed$;
commit;
notify pgrst, 'reload schema';
`;
  await mkdir(resolve('public'), { recursive: true });
  await writeFile(resolve('public/setup.sql'), schema + '\n' + categories + '\n' + startingAreas + '\n' + walkSchema + walkSeed + seed);
  await writeFile(resolve('public/starting-areas-upgrade.sql'), 'begin;\n' + startingAreas + "\ncommit;\nnotify pgrst, 'reload schema';\n");
  await writeFile(resolve('public/grant-admin.sql'), await readFile(resolve('supabase/grant-admin.sql'), 'utf8'));
  await writeFile(resolve('public/categories-upgrade.sql'), 'begin;\n' + categories + "\ncommit;\nnotify pgrst, 'reload schema';\n");
  await writeFile(resolve('public/curated-walks-upgrade.sql'), 'begin;\n' + categories + '\n' + walkSchema + walkSeed + "\ncommit;\nnotify pgrst, 'reload schema';\n");
  console.log(`Generated Supabase setup with ${attractions.length} real attractions and ${tours.length} curated walks. Re-running it preserves edits and deletions.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}