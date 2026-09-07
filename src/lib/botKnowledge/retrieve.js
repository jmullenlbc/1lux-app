// What the bot is actually handed when it drafts something.
//
// The old behaviour was `take: 5, orderBy: createdAt asc` with no matching at
// all, which meant the bot only ever saw the five OLDEST entries and everything
// added after that was dead weight. That was survivable while the library was a
// handful of typed Q&A pairs. It is not survivable now that whole documents go
// in, so this searches instead of taking the first few.

import { prisma } from '@/lib/db';
import { searchTerms, scoreText, excerptAround, tidyText } from './text.js';

// A document is long; a Q&A answer is short. Both get trimmed to something a
// prompt can carry without crowding out the rest of the context.
const MAX_ENTRY_CHARS = 1200;
const MAX_DOC_CHARS   = 1600;

/**
 * Find the knowledge most relevant to a query.
 *
 * @param {string}   query      what the bot is trying to answer / write about
 * @param {string[]} categories restrict to these categories, or omit for all
 * @param {number}   limit      how many pieces to return
 * @returns {Promise<Array<{kind, id, title, text, score}>>}
 */
export async function findRelevantKnowledge({ query = '', categories = null, limit = 6 } = {}) {
  const terms = searchTerms(query);

  const categoryFilter = categories?.length ? { category: { in: categories } } : {};

  const [entries, docs] = await Promise.all([
    prisma.botKnowledgeEntry.findMany({
      where:  { isActive: true, ...categoryFilter },
      select: { id: true, category: true, keywords: true, question: true, answer: true },
    }),
    prisma.botKnowledgeDoc.findMany({
      where:  { isActive: true, status: 'READY', ...categoryFilter },
      select: { id: true, category: true, title: true, description: true, fileName: true, fileType: true, text: true },
    }),
  ]);

  const scored = [
    ...entries.map(e => ({
      kind:     'entry',
      id:       e.id,
      category: e.category,
      title:    e.question,
      body:     e.answer || '',
      keywords: e.keywords || '',
      score:    scoreText({ title: e.question, keywords: e.keywords || '', body: e.answer || '' }, terms),
    })),
    ...docs.map(d => ({
      kind:     'doc',
      id:       d.id,
      category: d.category,
      title:    d.title || d.fileName,
      fileType: d.fileType,
      body:     d.text || '',
      // The description is what a human typed about why this file matters, so it
      // is weighted like keywords rather than like body text.
      keywords: d.description || '',
      score:    scoreText({ title: d.title || d.fileName, keywords: d.description || '', body: d.text || '' }, terms),
    })),
  ];

  // With no usable query there is nothing to rank on. Fall back to the newest
  // rather than the oldest — recent knowledge is likelier to still be true.
  const relevant = terms.length
    ? scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score)
    : scored;

  return relevant.slice(0, limit).map(s => ({
    kind:     s.kind,
    id:       s.id,
    category: s.category,
    title:    s.title,
    fileType: s.fileType || null,
    score:    s.score,
    text: s.kind === 'doc'
      ? excerptAround(s.body, terms, MAX_DOC_CHARS / 2)
      : tidyText(s.body).slice(0, MAX_ENTRY_CHARS),
  }));
}

/**
 * The same thing, rendered as the block of text that goes into a prompt.
 * Returns '' when nothing matched, so callers can leave the section out
 * entirely rather than sending the model an empty heading.
 */
export async function knowledgeContextBlock(opts) {
  const hits = await findRelevantKnowledge(opts);
  if (!hits.length) return '';

  return hits.map(h => {
    const label = h.kind === 'doc' ? `[${h.fileType || 'file'}] ${h.title}` : h.title;
    return `${label}\n${h.text}`;
  }).join('\n\n---\n\n');
}
