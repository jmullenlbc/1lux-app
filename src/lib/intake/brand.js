// Who the public conceptual budget tool is from (Mike 2026-11-10): Logiq Supply.
// The page, its sign-in, its emails and its PDF never say ILC, and
// scripts/tests/intakePdf.test.mjs fails if they do. This file imports nothing,
// so the browser and the PDF builder can both use it.
export const PUBLIC_BRAND = 'Logiq Supply';
export const PUBLIC_BRAND_SHORT = 'Logiq';
export const PUBLIC_BRAND_ADDRESS = '2727 W 2nd Ave, Denver, CO 80219';
// The one place this address lives. Mike confirmed the spelling 2026-11-10.
export const PUBLIC_BRAND_EMAIL = 'mike@logiqsupply.com';
// A file in /public, served as is. The PDF uses the inline copy in logiqLogo.js.
export const PUBLIC_BRAND_LOGO = '/logiq-logo.png';
