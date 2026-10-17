/**
 * The work email a public budget visitor signed in with (Mike 10-17: "the
 * browser to remember your email and that you signed in with it"). One copy
 * in this browser, shared by the password screen, the wizard's About You
 * step and the company portal, so it is typed once. This copy is the browser's
 * (the server logs each sign in separately, ConceptualSignIn 0133). The key
 * predates this file (the portal used it first), so remembered emails carry
 * over. Every storage access can throw (private windows, blocked site data).
 */
const EMAIL_KEY = 'ilc.conceptualBudget.portalEmail';

export function readRememberedEmail() {
  try { return window.localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; }
}

export function rememberEmail(v) {
  const clean = String(v || '').trim().toLowerCase();
  try {
    if (clean) window.localStorage.setItem(EMAIL_KEY, clean);
    else window.localStorage.removeItem(EMAIL_KEY);
  } catch { /* nothing to keep */ }
}
