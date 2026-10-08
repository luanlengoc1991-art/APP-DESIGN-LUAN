import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });
let html = await readFile(path.join(root, 'index.html'), 'utf8');
for (const entry of ['app.js', 'ai.js', 'styles.css']) {
  const bytes = await readFile(path.join(root, 'assets', entry));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const ext = path.extname(entry);
  const name = `${path.basename(entry, ext)}.${hash}${ext}`;
  await writeFile(path.join(dist, 'assets', name), bytes);
  html = html.replaceAll(`./assets/${entry}`, `./assets/${name}`);
}
await writeFile(path.join(dist, 'index.html'), html);
await cp(path.join(root, 'public'), dist, { recursive: true });
console.log('Build complete: dist/');
