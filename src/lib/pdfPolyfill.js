// pdfjs-dist v5 uses Promise.withResolvers(), which only exists on Node 22+.
// Amplify's serverless runtime may be on Node 18/20, where it's undefined and
// pdfjs throws "Promise.withResolvers is not a function" — so EVERY PDF parser
// fails in production while working locally on newer Node. This polyfill makes it
// available everywhere; it's a no-op on Node 22+.
//
// Import this (side-effect) at the TOP of any module that loads pdfjs-dist,
// before the dynamic `import('pdfjs-dist/...')`.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

export {};
