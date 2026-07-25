import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractVersion = readFileSync(resolve(root, 'contract.version'), 'utf8').trim();
const sdkPatch = readFileSync(resolve(root, 'sdk.patch'), 'utf8').trim();
const version = `${contractVersion}.${sdkPatch}`;

const pkgPath = resolve(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (pkg.version === version) {
  console.log(`package.json version already ${version}`);
} else {
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`stamped package.json version = ${version}`);
}
