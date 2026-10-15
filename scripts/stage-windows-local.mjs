import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const destination = resolve(root, 'release', 'codex-windows-local');
await mkdir(destination, { recursive: true });
for (const name of ['index.js', 'codex_cdp.js', 'windows-bootstrap.cjs', 'windows-discovery.cjs', 'windows-sqlite.cjs', 'pluginbridge-plugin.yaml', 'LICENSE', 'WINDOWS-FIX.md']) {
  await cp(resolve(root, name), resolve(destination, name));
}
await cp(resolve(root, 'node_modules'), resolve(destination, 'node_modules'), { recursive: true });
// No top-level package manifest: a complete artifact should not require global npm.
const sourcePackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await writeFile(resolve(destination, 'BUILD.json'), JSON.stringify({
  name: sourcePackage.name, version: sourcePackage.version, dependency: sourcePackage.dependencies,
}, null, 2) + '\n');
console.log(destination);
