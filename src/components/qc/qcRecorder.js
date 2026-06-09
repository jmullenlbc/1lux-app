const MAX_CONSOLE = 25;
const MAX_NETWORK = 10;
let initialized = false;

export function initQcRecorder() {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  const consoleLog = [];
  const networkLog = [];
  let contextFn = null;

  const _error = console.error.bind(console);
  const _warn  = console.warn.bind(console);

  console.error = (...args) => {
    consoleLog.push({ level: 'error', msg: args.map(a => String(a)).join(' '), ts: Date.now() });
    if (consoleLog.length > MAX_CONSOLE) consoleLog.shift();
    _error(...args);
  };
  console.warn = (...args) => {
    consoleLog.push({ level: 'warn', msg: args.map(a => String(a)).join(' '), ts: Date.now() });
    if (consoleLog.length > MAX_CONSOLE) consoleLog.shift();
    _warn(...args);
  };

  const _fetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const req = args[0];
    const url = typeof req === 'string' ? req : (req?.url || String(req));
    const method = (args[1]?.method || 'GET').toUpperCase();
    try {
      const res = await _fetch(...args);
      if (res.status >= 400) {
        networkLog.push({ method, url, status: res.status, ts: Date.now() });
        if (networkLog.length > MAX_NETWORK) networkLog.shift();
      }
      return res;
    } catch (err) {
      networkLog.push({ method, url, status: 0, error: String(err?.message), ts: Date.now() });
      if (networkLog.length > MAX_NETWORK) networkLog.shift();
      throw err;
    }
  };

  window.__ilcQc = {
    get consoleLog() { return [...consoleLog]; },
    get networkLog() { return [...networkLog]; },
    registerContext(fn) { contextFn = fn; },
    getContext() { return contextFn ? contextFn() : null; },
  };
}
