import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * One config for four jobs: dev server, site build, single-file build, tests.
 *
 * Multi-page on purpose — the range (`index.html`) and every scenario page are
 * separate entries, and they share chunks, so the engine is downloaded once no
 * matter how many scenarios exist.
 *
 * Two build targets:
 *   `vite build`                 -> dist/site   (the deployed range)
 *   `STANDALONE=1 vite build`    -> dist/standalone/play/blackout/index.html
 *                                   one self-contained file, for sharing and
 *                                   offline use. Standalone is an *output*
 *                                   now, not the architectural constraint it
 *                                   used to be.
 */
const standalone = process.env.STANDALONE === '1';

export default defineConfig({
  // Relative asset URLs, so the build works from any subpath including GitHub
  // Pages' /<repo>/ project pages.
  base: './',

  plugins: standalone ? [viteSingleFile()] : [],

  build: {
    outDir: standalone ? 'dist/standalone' : 'dist/site',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: !standalone,
    rollupOptions: standalone
      ? { input: { blackout: 'play/blackout/index.html' } }
      : {
          input: {
            range: 'index.html',
            blackout: 'play/blackout/index.html'
          }
        }
  },

  test: {
    environment: 'node',
    include: ['test/**/*.test.js', 'test/**/*.test.ts']
  }
});
