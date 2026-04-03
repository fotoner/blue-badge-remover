/**
 * Firefox build script
 *
 * Copies the Chrome build output (dist/) to dist-firefox/ and patches the
 * manifest to make it Firefox-compatible:
 *   - Removes `unlimitedStorage` permission (unsupported in Firefox MV3)
 *   - Adds `browser_specific_settings` with gecko ID and minimum version
 *   - Adds `background.scripts` fallback (required alongside service_worker)
 *
 * Also fixes CRXJS quirk where background script bundle is not wired into
 * service-worker-loader.js.
 */

import { cpSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';

const SRC = 'dist';
const DEST = 'dist-firefox';

// Clean and copy Chrome build output
rmSync(DEST, { recursive: true, force: true });
cpSync(SRC, DEST, { recursive: true, force: true });

// Patch the manifest
const manifest = JSON.parse(readFileSync(`${DEST}/manifest.json`, 'utf8'));

manifest.permissions = (manifest.permissions ?? []).filter(
  (p) => p !== 'unlimitedStorage',
);

// Firefox requires background.scripts alongside service_worker as a fallback
manifest.background = {
  ...manifest.background,
  scripts: [manifest.background.service_worker],
};

manifest.browser_specific_settings = {
  gecko: {
    id: 'blue-badge-remover@fotoner-p',
    strict_min_version: '128.0',
  },
};

writeFileSync(`${DEST}/manifest.json`, JSON.stringify(manifest, null, 2));

// Fix CRXJS quirk: service-worker-loader.js only imports the content script
// bundle, leaving the background script bundle unloaded. Find the background
// bundle (small index.ts-*.js that contains chrome.runtime.onInstalled) and
// add it to the loader.
const assets = readdirSync(`${DEST}/assets`);

const loaderPath = `${DEST}/service-worker-loader.js`;
const loaderContent = readFileSync(loaderPath, 'utf8');

// The loader already imports one index.ts bundle (content script). Find the
// OTHER index.ts bundle(s) not yet referenced by the loader.
const indexBundles = assets.filter(
  (f) => f.startsWith('index.ts-') && !f.includes('loader'),
);
const missingBundles = indexBundles.filter(
  (f) => !loaderContent.includes(f),
);

if (missingBundles.length > 0) {
  const extraImports = missingBundles
    .map((f) => `import './assets/${f}';`)
    .join('\n');
  writeFileSync(loaderPath, extraImports + '\n' + loaderContent);
  console.log(`Patched service-worker-loader.js: added ${missingBundles.join(', ')}`);
}

console.log(`Firefox build complete → ${DEST}/`);
