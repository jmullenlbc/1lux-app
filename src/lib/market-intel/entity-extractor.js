import { getAnthropicKey } from '@/lib/anthropicKey.js';
import Anthropic from '@anthropic-ai/sdk';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { developerNamesFrom, unitCountFrom } from './tagRules.js';

// Recorded: see src/lib/agent/ledger.js.
const client = wrapClient(new Anthropic({ apiKey: getAnthropicKey() }), 'marketIntel.entityExtract');

// 10-7 (Mike): besides the developer, pull every company with its role, the
// project's name, where it is, and how many units it holds. Each becomes a
// tag row (tagRules.js) so articles can be filtered by company, place or job.
const SYSTEM_PROMPT = `You are a real estate intelligence parser for a lighting design company.
Extract structured data from multifamily and senior housing industry news articles.

Return ONLY valid JSON. No preamble, no markdown, no explanation.

JSON schema:
{
  "companies": [{ "name": string, "role": string }],
  "projectNames": string[],
  "metro": string | null,
  "state": string | null,
  "unitCount": number | null,
  "signalType": string,
  "projectType": string | null,
  "summary": string
}

Rules:
- companies: every organization named, with role one of DEVELOPER | OWNER | INVESTOR | GC | ARCHITECT | LENDER | OTHER. Exclude municipalities and the publication itself. Use the company's proper name, no suffix like Inc or LLC.
- projectNames: names of specific developments or buildings the article is about (e.g. "The Approach", "Fulshear Lakes Phase 2"). Empty if none is named.
- metro: the metropolitan area the project is in, written "City, ST" (e.g. "Denver, CO"). null if the article is not about one place.
- state: two-letter state code of the project. null if unknown.
- unitCount: the number of residential units, keys or beds in the project the article is about. null if not stated. Never add up several projects.
- projectType: one of MARKET_RATE | AFFORDABLE | STUDENT_HOUSING | SENIOR_LIVING | null
- signalType: one of NEWS | GROUNDBREAKING | FINANCING | ACQUISITION | DEVELOPER_AWARD
  - GROUNDBREAKING: mentions groundbreaking, construction start, or breaking ground
  - FINANCING: mentions a loan, bond, credit facility, equity raise, or financing closing
  - ACQUISITION: mentions a sale, acquisition, purchase, or portfolio deal
  - DEVELOPER_AWARD: mentions a ranking, award, or industry recognition list
  - NEWS: everything else
- summary: 1 to 2 neutral sentences, max 200 characters`;

const EMPTY = (title) => ({ companies: [], developerNames: [], projectNames: [], metro: null, state: null, unitCount: null, signalType: 'NEWS', projectType: null, summary: String(title || '').slice(0, 200) });

export async function extractFromArticle(title, rawContent) {
  // A scraped news article is the least trusted text in the app: it is an
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
      max_tokens: 700,
      system:     sealed.system,
      messages:   [{ role: 'user', content: sealed.content }],
    });
    const raw     = textFrom(response) || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    return {
      ...EMPTY(title),
      ...parsed,
      companies:      Array.isArray(parsed.companies) ? parsed.companies.filter(c => c && c.name) : [],
      projectNames:   Array.isArray(parsed.projectNames) ? parsed.projectNames.filter(Boolean) : [],
      unitCount:      unitCountFrom(parsed.unitCount),
      // Kept for the matcher and the legacy developerNames column.
      developerNames: developerNamesFrom(parsed),
      summary:        typeof parsed.summary === 'string' ? parsed.summary : String(title || '').slice(0, 200),
    };
  } catch (err) {
    console.error(`[entity-extractor] Failed for "${title}": ${err.message}`);
    return EMPTY(title);
  }
}
