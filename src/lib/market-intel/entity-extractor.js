import { getAnthropicKey } from '@/lib/anthropicKey.js';
import Anthropic from '@anthropic-ai/sdk';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { developerNamesFrom, unitCountFrom } from './tagRules.js';

// Recorded: see src/lib/agent/ledger.js.
const client = async () => wrapClient(new Anthropic({ apiKey: await getAnthropicKey() }), 'marketIntel.entityExtract');

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
  "projectRelated": boolean,
  "signalType": string,
  "projectType": string | null,
  "summary": string
}

Rules:
- projectRelated: true only if the article is about one or more specific buildings or developments: a project proposed, approved, financed, started, topped out, opened, renovated, sold or awarded. false if it is advice to developers or operators, property management or leasing tips, market or rent commentary, policy, legislation, interest rates, personnel moves, company earnings, or an industry event. When false, still fill the other fields as best you can.
- companies: every organization named, with role one of DEVELOPER | OWNER | INVESTOR | GC | ARCHITECT | LENDER | OTHER. Exclude municipalities and the publication itself. Use the company's proper name, no suffix like Inc or LLC.
- projectNames: names of specific developments or buildings the article is about (e.g. "The Approach", "Fulshear Lakes Phase 2"). Empty if none is named.
- metro: the metropolitan area the project is in, written "City, ST" (e.g. "Denver, CO"). null if the article is not about one place.
- state: two-letter state code of the project. null if unknown.
- unitCount: the number of residential units, keys or beds in the project the article is about. null if not stated. Never add up several projects.
- projectType: one of MARKET_RATE | AFFORDABLE | STUDENT_HOUSING | SENIOR_LIVING | BUILD_TO_RENT | HOSPITALITY | null. AFFORDABLE covers income restricted, LIHTC, workforce and public housing. BUILD_TO_RENT is a rental community of houses or townhomes. HOSPITALITY is a hotel or resort.
- signalType: one of NEW_DEVELOPMENT | RENOVATION | FINANCING | ACQUISITION | DEVELOPER_AWARD | NEWS
  - NEW_DEVELOPMENT: a new building or community is proposed, planned, approved, under construction, breaking ground, topping out or opening
  - RENOVATION: an existing building is being renovated, redeveloped, converted, repositioned or expanded
  - FINANCING: a loan, bond, credit facility, equity raise, or financing closing
  - ACQUISITION: a sale, acquisition, purchase, or portfolio deal
  - DEVELOPER_AWARD: a ranking, award, or industry recognition list
  - NEWS: everything else
  - Prefer NEW_DEVELOPMENT or RENOVATION when the article is about the building itself, even if it also mentions the loan or the sale
- summary: 1 to 2 neutral sentences, max 200 characters`;

// projectRelated null = the reader did not answer (a failed call), so the
// article stays visible and the Screen articles backfill asks again.
const EMPTY = (title) => ({ companies: [], developerNames: [], projectNames: [], metro: null, state: null, unitCount: null, projectRelated: null, signalType: 'NEWS', projectType: null, summary: String(title || '').slice(0, 200) });

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
    const response = await (await client()).messages.create({
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
      projectRelated: typeof parsed.projectRelated === 'boolean' ? parsed.projectRelated : null,
      // Kept for the matcher and the legacy developerNames column.
      developerNames: developerNamesFrom(parsed),
      summary:        typeof parsed.summary === 'string' ? parsed.summary : String(title || '').slice(0, 200),
    };
  } catch (err) {
    console.error(`[entity-extractor] Failed for "${title}": ${err.message}`);
    // `failed` tells the poller the model never answered (a rejected key, a
    // bad model id, no credit), so the row is NOT marked as read and the next
    // Screen articles press asks again once the call works. Without this
    // flag every article was quietly marked "tagged" with nothing (10-8).
    return { ...EMPTY(title), failed: true, error: String(err?.message || err).slice(0, 300) };
  }
}
