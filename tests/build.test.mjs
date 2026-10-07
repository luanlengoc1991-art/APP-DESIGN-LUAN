import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
test('deployment assets match their fingerprints and work below a path prefix', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const names = await readdir(new URL('../dist/assets/', import.meta.url));
  assert.equal(names.length, 2);
  for (const name of names) {
    const bytes = await readFile(new URL(`../dist/assets/${name}`, import.meta.url));
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    assert.ok(name.includes(`.${hash}.`));
    assert.ok(html.includes(`./assets/${name}`));
    for (const base of ['https://example.com/', 'https://example.com/APP-DESIGN-LUAN/']) {
      assert.equal(new URL(`./assets/${name}`, base).pathname, new URL(base).pathname + `assets/${name}`);
    }
  }
  assert.doesNotMatch(html, /\.\/assets\/(app\.js|styles\.css)/);
  const headers = await readFile(new URL('../dist/_headers', import.meta.url), 'utf8');
  assert.match(headers, /\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /\/index\.html\n\s+Cache-Control: no-cache/);
  assert.match(await readFile(new URL('../dist/404.html', import.meta.url), 'utf8'), /Không tìm thấy trang/);
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.not_found_handling, '404-page');
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  assert.deepEqual(await readdir(new URL('../dist/assets/', import.meta.url)), names);
  assert.equal(await readFile(new URL('../dist/index.html', import.meta.url), 'utf8'), html);
});
