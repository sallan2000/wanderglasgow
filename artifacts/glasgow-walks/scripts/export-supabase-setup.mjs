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
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const values = attractions.map(a => `(${[a.id, a.name, a.description, a.place, a.theme].map(quote).join(', ')}, ${a.lat}, ${a.lon}, true)`).join(',\n');
  const schema = await readFile(resolve('supabase/schema.sql'), 'utf8');
  const categories = await readFile(resolve('supabase/categories.sql'), 'utf8');
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
  await writeFile(resolve('public/setup.sql'), schema + '\n' + categories + seed);
  await writeFile(resolve('public/grant-admin.sql'), await readFile(resolve('supabase/grant-admin.sql'), 'utf8'));
  await writeFile(resolve('public/categories-upgrade.sql'), 'begin;\n' + categories + "\ncommit;\nnotify pgrst, 'reload schema';\n");
  console.log(`Generated Supabase setup with ${attractions.length} real attractions. Re-running it preserves edits and deletions.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}