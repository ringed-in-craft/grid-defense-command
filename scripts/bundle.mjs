/**
 * Build a single-file bundle: dist/grid-defense-command.html
 *
 * The repo is written as ES modules so the code is testable and readable, but
 * a simulation like this is far more shareable as one self-contained file you
 * can email to someone or drop on a USB stick. This concatenates the modules
 * in dependency order and strips the module syntax — no bundler dependency.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Dependency order matters: each module only uses names defined above it.
const ORDER = ['rng.js', 'threats.js', 'scenarios.js', 'sim.js', 'render.js', 'ui.js', 'main.js'];

let code = '';
for (const file of ORDER) {
  let src = await readFile(path.join(ROOT, 'src', file), 'utf8');

  // Namespace imports cannot be inlined by stripping module syntax, because the
  // binding itself would disappear. Fail loudly rather than shipping a bundle
  // that throws "X is not defined" at runtime.
  if (/^\s*import\s+\*\s+as\s/m.test(src)) {
    throw new Error(
      `src/${file} uses 'import * as', which this bundler cannot inline. ` +
        `Use named imports instead.`
    );
  }

  src = src.replace(/^import\s+[^;]*;\s*$/gm, '');
  src = src.replace(/^export\s+(const|let|var|function|class)\s/gm, '$1 ');
  src = src.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

  // Anything left referencing a module is a bug we want to catch now.
  if (/^\s*(import|export)\s/m.test(src)) {
    throw new Error(`src/${file} still contains module syntax after stripping`);
  }

  code += `\n/* ======================= src/${file} ======================= */\n${src}`;
}

const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const marker = '<script type="module" src="./src/main.js"></script>';
if (!html.includes(marker)) throw new Error('module script tag not found in index.html');

const built = html.replace(
  marker,
  `<script>\n(function(){\n'use strict';\n${code}\n})();\n</script>`
);

await mkdir(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'grid-defense-command.html');
await writeFile(out, built);

const kb = (built.length / 1024).toFixed(1);
console.log(`wrote ${path.relative(ROOT, out)} (${kb} kB, no dependencies)`);
