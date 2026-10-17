// What the bot is actually handed when it drafts something.
//
// This has now been rewritten twice, both times for the same reason: the bot was
// reading a fraction of the library and nobody could see that from the screen.
//
//   1. The original was `take: 5, orderBy: createdAt asc` with no matching at
//      all, the bot saw the five OLDEST Q&A pairs and nothing else, ever.
//   2. The replacement searched, which was better, but still handed over the top
//      five hits as ~1,600-character EXCERPTS, in two categories out of all of
//      them, and threw away anything that did not match the query outright. A
//      40-page PDF contributed a paragraph; a document filed under the wrong
//      category contributed nothing.
//
// Mike, 2026-09-08: "we just want the bot knowledge to feed into the sales bot
// … We need every character or everything we upload to do that."
//
// So this now sends the WHOLE library: every category, every active Q&A pair and
// every readable document, each one whole. Relevance did not go away, it decides
// the ORDER, but ordering is all it decides, and it only ever matters if the
// library grows past what one prompt can carry. See KNOWLEDGE_CHAR_BUDGET.

import { prisma } from '@/lib/db';
import { searchTerms, scoreText, packKnowledge, KNOWLEDGE_CHAR_BUDGET } from './text.js';

/**
 * Everything the bot is allowed to read, ranked best-first for this query.
 *
 * Note what is NOT here: no `take`, and no filter on score. A document with a
 * score of zero is still sent, it is knowledge somebody deliberately uploaded.
 * Sorting only decides who goes first when there is not room for everyone.
 */
async function rankedLibrary({ query = '', categories = null } = {}) {
  const terms = searchTerms(query);
  const categoryFilter = categories?.length ? { category: { in: categories } } : {};

  const [entries, docs] = await Promise.all([
    prisma.botKnowledgeEntry.findMany({
      where:  { isActive: true, ...categoryFilter },
      select: { id: true, category: true, keywords: true, question: true, answer: true },
    }),
    // status READY is not a preference, a FAILED document has no text to send.
    prisma.botKnowledgeDoc.findMany({
      where:  { isActive: true, status: 'READY', ...categoryFilter },
      select: { id: true, category: true, title: true, description: true, fileName: true, fileType: true, text: true },
    }),
  ]);

  const items = [
    ...entries.map(e => ({
      kind:     'entry',
      id:       e.id,
      category: e.category,
      title:    e.question,
      fileType: null,
      text:     e.answer || '',
      score:    scoreText({ title: e.question, keywords: e.keywords || '', body: e.answer || '' }, terms),
    })),
    ...docs.map(d => ({
      kind:     'doc',
      id:       d.id,
      category: d.category,
      title:    d.title || d.fileName,
      fileType: d.fileType,
      text:     d.text || '',
      // The description is what a human typed about why this file matters, so it
      // is weighted like keywords rather than like body text.
      score:    scoreText({ title: d.title || d.fileName, keywords: d.description || '', body: d.text || '' }, terms),
    })),
  ];

  items.sort((a, b) => b.score - a.score);
  return items;
}

/**
 * The whole library, packed to fit one prompt.
 *
 * @returns {Promise<{hits: Array, usedChars: number, budget: number,
 *                    truncatedCount: number, droppedCount: number, complete: boolean}>}
 */
export async function findRelevantKnowledge({ query = '', categories = null, budget = KNOWLEDGE_CHAR_BUDGET } = {}) {
  const items = await rankedLibrary({ query, categories });
  const { packed, ...stats } = packKnowledge(items, budget);
  return { hits: packed, ...stats };
}

/**
 * The same thing, rendered as the block of text that goes into a prompt.
 * Returns '' when the library is empty, so callers can leave the section out
 * entirely rather than sending the model an empty heading.
 */
export async function knowledgeContextBlock(opts) {
  const { hits } = await findRelevantKnowledge(opts);
  if (!hits.length) return '';

  return hits.map(h => {
    const label = h.kind === 'doc' ? `[${h.fileType || 'file'}] ${h.title}` : h.title;
    // Say it out loud when a document is cut. A model told it has the whole
    // document will happily answer from a half it never received.
    const cut = h.truncated ? '\n[…this document was too long to include in full…]' : '';
    return `${label}\n${h.text}${cut}`;
  }).join('\n\n---\n\n');
}

/**
 * How much of the library actually reaches the bot, for the screen, so the
 * answer to "is the bot really reading all of this?" is on the page rather than
 * in someone's memory of a conversation.
 *
 * Counts what the bot CAN read, which is why unreadable documents are counted
 * separately instead of being left out silently.
 */
export async function knowledgeReach({ budget = KNOWLEDGE_CHAR_BUDGET } = {}) {
  const [items, unreadable] = await Promise.all([
    rankedLibrary({}),
    prisma.botKnowledgeDoc.count({ where: { isActive: true, status: { not: 'READY' } } }),
  ]);

  const { packed, ...stats } = packKnowledge(items, budget);

  return {
    entryCount: items.filter(i => i.kind === 'entry').length,
    docCount:   items.filter(i => i.kind === 'doc').length,
    itemCount:  items.length,
    sentCount:  packed.length,
    unreadable,
    ...stats,
  };
}
