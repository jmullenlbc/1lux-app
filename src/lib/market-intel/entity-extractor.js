import { getAnthropicKey } from '@/lib/anthropicKey.js';
import Anthropic from '@anthropic-ai/sdk';
import { wrapClient } from '@/lib/agent/client';

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
  const text = `TITLE: ${title}\n\nCONTENT: ${rawContent}`;
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 300,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: text }],
    });
    const raw     = response.content[0]?.text || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`[entity-extractor] Failed for "${title}": ${err.message}`);
    return { developerNames: [], signalType: 'NEWS', projectType: null, summary: title.slice(0, 200) };
  }
}
