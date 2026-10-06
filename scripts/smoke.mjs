/**
 * Headless browser smoke test runner.
 *
 * Boots the static server, points a headless Chromium at
 * test/browser-smoke.html, waits for the page to finish its checks, and reads
 * the PASS/FAIL summary out of <title>.
 *
 * Skips cleanly (exit 0) when no Chromium-family browser is installed, so a CI
 * runner without one does not go red for an environment reason. Set
 * SMOKE_REQUIRED=1 to make a missing browser a hard failure instead.
 *
 * Usage: npm run smoke
 */

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT || 8123);
const REQUIRED = process.env.SMOKE_REQUIRED === '1';

const CANDIDATES = [
  'chromium',
  'chromium-browser',
  'google-chrome',
  'google-chrome-stable',
  'chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

function findBrowser() {
  for (const bin of CANDIDATES) {
    const probe = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) return bin;
  }
  return null;
}

const browser = findBrowser();
if (!browser) {
  const msg = 'No Chromium-family browser found — skipping browser smoke test.';
  if (REQUIRED) {
    console.error(`${msg} (SMOKE_REQUIRED=1)`);
    process.exit(1);
  }
  console.log(msg);
  process.exit(0);
}

const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore'
});

const shutdown = () => {
  if (!server.killed) server.kill('SIGTERM');
};
process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

// Give the server a moment, then check it is actually up.
await new Promise((r) => setTimeout(r, 700));

const url = `http://localhost:${PORT}/test/browser-smoke.html`;
const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--window-size=1400,1000',
  '--virtual-time-budget=25000',
  '--dump-dom',
  url
];

const proc = spawnSync(browser, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
shutdown();

const dom = proc.stdout || '';
const title = (dom.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';

if (!title.startsWith('SMOKE')) {
  console.error('Could not read a smoke-test result. Raw title:', JSON.stringify(title));
  console.error('stderr:', (proc.stderr || '').slice(-800));
  process.exit(1);
}

const pass = title.startsWith('SMOKE PASS');
const summary = title.replace(/^SMOKE\s+/, '').replace(/\s*::.*$/, '');
console.log(`browser smoke test: ${pass ? 'PASS' : 'FAIL'} (${summary})`);
if (!pass) {
  const failures = title.split('::')[1] || '';
  for (const f of failures.split('~~')) {
    if (f.trim()) console.error(`  FAILED: ${f.trim()}`);
  }
}
process.exit(pass ? 0 : 1);
