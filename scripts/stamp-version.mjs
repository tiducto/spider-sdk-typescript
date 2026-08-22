import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const props = Object.fromEntries(
  readFileSync(resolve(root, 'version.properties'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => line.split('=').map((s) => s.trim())),
);
const version = `${props.contract}.${props.patch}`;

const pkgPath = resolve(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (pkg.version === version) {
  console.log(`package.json version already ${version}`);
} else {
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`stamped package.json version = ${version}`);
}

// The SDK stamps this full semver into the x-spider-sdk identity header on every request, so it
// must be readable at runtime. Emit it here from the same source as package.json.version rather
// than importing package.json into the bundle.
const sdkVersionPath = resolve(root, 'src/sdkVersion.ts');
const sdkVersionContent = `export const SDK_VERSION = '${version}';\n`;
if (readFileSync(sdkVersionPath, 'utf8') === sdkVersionContent) {
  console.log(`src/sdkVersion.ts already ${version}`);
} else {
  writeFileSync(sdkVersionPath, sdkVersionContent);
  console.log(`stamped src/sdkVersion.ts = ${version}`);
}
