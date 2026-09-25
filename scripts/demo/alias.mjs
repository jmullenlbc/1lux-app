// Lets plain Node load app code that imports '@/…' (Next's alias) or leaves off
// the '.js'. Used only by the demo scripts: node --import ./scripts/demo/alias.mjs …
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = pathToFileURL(path.resolve('src') + path.sep).href;

registerHooks({
  resolve(spec, ctx, next) {
    const s = spec.startsWith('@/') ? SRC + spec.slice(2) : spec;
    try { return next(s, ctx); } catch (err) {
      if (!(s.startsWith('.') || s.startsWith('file:'))) throw err;
      for (const tail of ['.js', '.mjs', '/index.js']) {
        try { return next(s + tail, ctx); } catch {}
      }
      throw err;
    }
  },
});
