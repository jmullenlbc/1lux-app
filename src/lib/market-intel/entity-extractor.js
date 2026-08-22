import { getAnthropicKey } from '@/lib/anthropicKey.js';
import Anthropic from '@anthropic-ai/sdk';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';

// Recorded: see src/lib/agent/ledger.js.
const client = wrapClient(new Anthropic({ apiKey: getAnthropicKey() }), 'marketIntel.entityExtract');

const SYSTEM_PROMPT = `You are a real estate intelligence parser for a lighting design company.
Extract structured data from multifamily and senior housing industry news articles.

Return ONLY valid JSON. No preamble, no markdown, no explanation.

JSON schema:
{
  "developerNames": string[],
  "signalType": string,
  "projectType": string | null,
  "summary": string
}

Rules:
- developerNames: organization names that are developers, owners, or investors only. Exclude architects, GCs, lenders, municipalities.
- projectType: one of MARKET_RATE | AFFORDABLE | STUDENT_HOUSING | SENIOR_LIVING | null
- signalType: one of NEWS | GROUNDBREAKING | FINANCING | ACQUISITION | DEVELOPER_AWARD
  - GROUNDBREAKING: mentions groundbreaking, construction start, or breaking ground
  - FINANCING: mentions a loan, bond, credit facility, equity raise, or financing closing
  - ACQUISITION: mentions a sale, acquisition, purchase, or portfolio deal
  - DEVELOPER_AWARD: mentions a ranking, award, or industry recognition list
  - NEWS: everything else
- summary: 1–2 neutral sentences, max 200 characters`;

export async function extractFromArticle(title, rawContent) {
  // A scraped news article is the least trusted text in the app — it is an
  // arbitrary web page, and the headline is written by whoever published it.
  // Both go inside the fence. See src/lib/agent/untrusted.js.
  const sealed = buildUntrustedPrompt({
    instructions: 'Extract the structured data described above from the article below.',
    system:       SYSTEM_PROMPT,
    documents:    [{ text: `TITLE: ${title}\n\nCONTENT: ${rawContent}`, descriptor: 'scraped article', maxChars: 40000 }],
  });
  warnOnInjection('marketIntel.entityExtract', null, sealed);

  try {
    const response = await client.messages.create({
      ...modelParams('market.entityExtract'),
      max_tokens: 300,
      system:     sealed.system,
      messages:   [{ role: 'user', content: sealed.content }],
    });
    const raw     = textFrom(response) || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`[entity-extractor] Failed for "${title}": ${err.message}`);
    return { developerNames: [], signalType: 'NEWS', projectType: null, summary: title.slice(0, 200) };
  }
}
