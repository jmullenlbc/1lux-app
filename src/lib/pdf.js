import { existsSync } from 'fs';

const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

function findLocalChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find(p => existsSync(p));
  if (!found) throw new Error('Chrome not found locally. Set CHROME_PATH in .env');
  return found;
}

export async function htmlToPdf(html, { landscape = false, margin = {} } = {}) {
  const puppeteer = (await import('puppeteer-core')).default;

  let executablePath, args, headless;
  if (IS_LAMBDA) {
    const chromium = (await import('@sparticuz/chromium')).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
    headless = chromium.headless;
  } else {
    executablePath = findLocalChrome();
    args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
    headless = true;
  }

  const browser = await puppeteer.launch({ executablePath, args, headless });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Letter',
      landscape,
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0', ...margin },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
