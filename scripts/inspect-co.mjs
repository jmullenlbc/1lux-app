import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const files = [
  'cmok6dh6s0003u3n1tdof2qmk/ca/1777508938398-25.12.17_MARMALADE_CO_3.pdf',
  'cmok6dh6s0003u3n1tdof2qmk/ca/1777508936208-25.11.10_SALES_TAX_INCREASE.pdf',
  'cmok6dh6s0003u3n1tdof2qmk/ca/1777508938585-25.12.19_SALES_TAX_INCREASE_CO_2.pdf',
  'cmok6dh6s0003u3n1tdof2qmk/ca/1777508936209-26.03.25_MODERA_MARMALADE-_SPEC_AND_QTY_CHANGES_CO_3.pdf',
];

for (const f of files) {
  const full = path.join(root, 'uploads', f);
  const buf  = readFileSync(full);
  const doc  = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(x => x.str).join(' ') + '\n';
  }
  console.log('\n===', path.basename(f), '===');
  console.log(text.replace(/\s+/g, ' ').slice(-600)); // last 600 chars (where totals usually live)
}
