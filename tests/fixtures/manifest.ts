import config from '../../wxt.config';

interface TestManifest {
  permissions?: string[];
  browser_specific_settings?: Record<string, unknown>;
}

type ManifestFn = (env: { browser: string; manifestVersion: 2 | 3; mode: string; command: string }) => TestManifest | Promise<TestManifest>;

/** wxt.config의 manifest를 브라우저별로 풀어 낸다 — 함수면 그 브라우저 빌드 환경으로 부른다 */
export async function manifestFor(browser: 'chrome' | 'edge' | 'firefox'): Promise<TestManifest> {
  const manifest = config.manifest as TestManifest | ManifestFn;
  if (typeof manifest !== 'function') return manifest;
  return manifest({ browser, manifestVersion: browser === 'firefox' ? 2 : 3, mode: 'production', command: 'build' });
}
