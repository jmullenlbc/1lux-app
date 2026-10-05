/**
 * Is this web budget's person, or company, one we already have? (Mike,
 * 2026-10-04: "Joe Smith just filled out a budget and you have a Joseph
 * Smith. Same person?")
 *
 * Three answers, never more:
 *   link    sure it is the same (same email; same company email domain or
 *           the same company name). Joined with no question.
 *   review  could be the same. A person answers on My Desk; nothing is made
 *           or joined until then.
 *   new     nothing like it. A new record is made.
 *
 * Pure: no database, no "@/" imports, so the tests load it directly.
 */
import { normalizeCompany } from '../verification/checks.js';

// Each line is one name and the ways people shorten it.
const NICKNAME_GROUPS = [
  'joseph joe joey jo', 'robert rob bob bobby robbie bert', 'william will bill billy willy liam',
  'michael mike mick mickey mikey', 'james jim jimmy jamie', 'thomas tom tommy', 'david dave davey',
  'daniel dan danny', 'christopher chris kit', 'christine chris chrissy christina tina', 'matthew matt',
  'nicholas nick nicky', 'anthony tony', 'steven steve stevie stephen', 'andrew andy drew',
  'alexander alex al xander sasha', 'alexandra alex alexa lexi sandra sandy', 'samuel sam sammy',
  'samantha sam sammy', 'benjamin ben benny', 'katherine kate kathy katie kat cathy catherine kathryn',
  'elizabeth liz lizzie beth betsy eliza betty', 'jennifer jen jenny', 'susan sue suzy suzanne',
  'patrick pat patty', 'patricia pat patty trish tricia', 'richard rick rich ricky dick',
  'edward ed eddie ted ned', 'gregory greg', 'jeffrey jeff geoff geoffrey', 'jonathan jon john johnny jack',
  'lawrence larry', 'ronald ron ronnie', 'donald don donnie', 'kenneth ken kenny', 'timothy tim timmy',
  'margaret maggie meg peggy peg', 'deborah debbie deb debra', 'barbara barb barbie', 'cynthia cindy',
  'victoria vicky tori', 'abigail abby', 'nathan nate', 'nathaniel nate nat', 'zachary zach zack',
  'joshua josh', 'jacob jake', 'charles charlie chuck chas', 'henry hank harry', 'harold harry hal',
  'francis frank frankie', 'franklin frank', 'frederick fred freddie', 'eugene gene',
  'gerald jerry gerry', 'jerome jerry', 'philip phil', 'phillip phil', 'raymond ray', 'walter walt',
  'wesley wes', 'albert al bert', 'alan al', 'allen al', 'vincent vince vinny', 'ernest ernie',
  'leonard leo len lenny', 'sandra sandy', 'theresa terry tess', 'teresa terry tess', 'terrence terry',
  'valerie val', 'gabriel gabe', 'manuel manny', 'rafael rafa', 'jose pepe', 'francisco paco pancho',
  'ignacio nacho', 'guadalupe lupe', 'alberto beto', 'roberto beto', 'eduardo lalo', 'jesus chuy',
  'douglas doug', 'russell russ', 'randall randy', 'bradley brad', 'gary', 'stanley stan',
  'kimberly kim', 'rebecca becky becca', 'jessica jess jessie', 'amanda mandy', 'melissa missy mel',
  'pamela pam', 'cassandra cassie', 'jacqueline jackie', 'josephine jo josie', 'judith judy',
  'dorothy dot dottie', 'carolyn carol', 'caroline carol carrie', 'julia julie', 'evelyn evie',
];

const NICKNAMES = new Map();
for (const line of NICKNAME_GROUPS) {
  const names = line.split(' ');
  for (const n of names) {
    if (!NICKNAMES.has(n)) NICKNAMES.set(n, new Set());
    for (const m of names) NICKNAMES.get(n).add(m);
  }
}

const clean = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
const titled = s => String(s ?? '').trim();

/** First and last name from a contact row, splitting the full name when the parts are blank. */
export function nameParts(row) {
  let first = row?.firstName, last = row?.lastName;
  if (!first && !last) {
    const words = String(row?.name ?? '').trim().split(/\s+/).filter(Boolean);
    first = words.length > 1 ? words.slice(0, -1).join(' ') : words[0];
    last = words.length > 1 ? words[words.length - 1] : null;
  }
  return { first: titled(first), last: titled(last) };
}

/**
 * Could two first names be the same person? Returns the plain reason, or null.
 * Only the first word counts ("Mary Ann" is matched on "Mary").
 */
export function firstNamesMatch(a, b) {
  const x = clean(String(a ?? '').trim().split(/\s+/)[0]);
  const y = clean(String(b ?? '').trim().split(/\s+/)[0]);
  if (!x || !y) return null;
  const A = titled(a).split(/\s+/)[0], B = titled(b).split(/\s+/)[0];
  if (x === y) return 'same name';
  if (NICKNAMES.get(x)?.has(y)) return `${A} and ${B} can be the same name`;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length === 1 && long.startsWith(short)) return `${A} and ${B} could be an initial`;
  if (short.length >= 3 && long.startsWith(short)) return `${A} and ${B} can be the same name`;
  return null;
}

/**
 * The web person against our people.
 * person: { firstName, lastName, email }
 * contacts: [{ id, name, firstName, lastName, email }]
 */
export function matchPerson(person, contacts) {
  const email = String(person?.email ?? '').trim().toLowerCase();
  const list = Array.isArray(contacts) ? contacts : [];
  if (email) {
    const same = list.find(c => String(c.email ?? '').trim().toLowerCase() === email);
    if (same) return { action: 'link', contact: same, reason: 'same email' };
  }
  const last = clean(person?.lastName);
  if (!last) return { action: 'new' };
  for (const c of list) {
    const p = nameParts(c);
    if (clean(p.last) !== last) continue;
    const why = firstNamesMatch(person.firstName, p.first);
    if (!why) continue;
    const onFile = c.email ? `we have ${c.email}` : 'we have no email for them';
    const reason = why === 'same name'
      ? `Same name, different email (${onFile}).`
      : `${why}, same last name, different email (${onFile}).`;
    return { action: 'review', contact: c, reason: reason.charAt(0).toUpperCase() + reason.slice(1) };
  }
  return { action: 'new' };
}

const hostOf = url => String(url ?? '').trim().toLowerCase()
  .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];

/**
 * The web company against our companies.
 * company: { companyName, emailDomain, freeMail }
 * clients: [{ id, name, emailDomains: string[] | JSON string, website }]
 */
export function matchCompany(company, clients) {
  const list = Array.isArray(clients) ? clients : [];
  const domain = String(company?.emailDomain ?? '').trim().toLowerCase();
  const name = normalizeCompany(company?.companyName);
  const domainsOf = c => {
    if (Array.isArray(c.emailDomains)) return c.emailDomains;
    try { return JSON.parse(c.emailDomains || '[]'); } catch { return []; }
  };
  if (domain && !company?.freeMail) {
    const same = list.find(c => domainsOf(c).some(d => String(d).trim().toLowerCase() === domain));
    if (same) return { action: 'link', client: same, reason: 'same email domain' };
  }
  if (name) {
    const same = list.find(c => normalizeCompany(c.name) === name);
    if (same) return { action: 'link', client: same, reason: 'same company name' };
    const squash = name.replace(/ /g, '');
    if (squash.length >= 4) {
      const close = list.find(c => {
        const other = normalizeCompany(c.name).replace(/ /g, '');
        return other.length >= 4 && (other.includes(squash) || squash.includes(other));
      });
      if (close) return { action: 'review', client: close, reason: `"${titled(company.companyName)}" looks like "${close.name}".` };
    }
  }
  if (domain && !company?.freeMail) {
    const site = list.find(c => hostOf(c.website) === domain);
    if (site) return { action: 'review', client: site, reason: `Their email is @${domain}, the same as ${site.name}'s website.` };
  }
  return { action: 'new' };
}
