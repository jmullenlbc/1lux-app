/**
 * generate-deploy-log.js
 *
 * Runs during the Amplify preBuild phase (and locally before dev server starts).
 * Reads git log and writes deploy-log.json to the project root so the
 * /admin/changelog Deploy History tab can display it without a GitHub API token.
 *
 * Output format: Array of commit objects, newest first.
 */

const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');

const OUT = path.join(__dirname, '..', 'deploy-log.json');

// Use git log with --format=tformat: and a record separator line
// Emit each commit as multiple lines, one field per line, separated by a marker
const COMMIT_SEP = '---COMMIT_END---';

try {
  // Get commits one at a time using a safe format — each field on its own line
  const raw = execSync(
    `git log -n 200 --pretty=format:"HASH:%H%nSHORT:%h%nAUTHOR:%an%nEMAIL:%ae%nDATE:%aI%nSUBJECT:%s%nBODY_START%n%b%n${COMMIT_SEP}"`,
    { encoding: 'utf8', cwd: path.join(__dirname, '..') }
  );

  const entries = raw
    .split(COMMIT_SEP)
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => {
      const lines = r.split('\n');
      const get = (prefix) => {
        const line = lines.find(l => l.startsWith(prefix + ':'));
        return line ? line.slice(prefix.length + 1).trim() : '';
      };
      const fullHash = get('HASH');
      const short    = get('SHORT');
      const author   = get('AUTHOR');
      const email    = get('EMAIL');
      const date     = get('DATE');
      const subject  = get('SUBJECT');

      // Body is everything after BODY_START
      const bodyStartIdx = lines.findIndex(l => l === 'BODY_START');
      const body = bodyStartIdx >= 0
        ? lines.slice(bodyStartIdx + 1).join('\n').trim()
        : '';

      // Parse Co-Authored-By lines out of the body
      const coAuthors = [];
      const bodyLines = body.split('\n');
      const cleanBody = bodyLines
        .filter(line => {
          const m = line.match(/^Co-Authored-By:\s+(.+?)\s+<(.+?)>/i);
          if (m) { coAuthors.push({ name: m[1], email: m[2] }); return false; }
          return true;
        })
        .join('\n')
        .trim();

      return {
        hash:       short      || '',
        fullHash:   fullHash   || '',
        author:     author     || 'Unknown',
        email:      email      || '',
        date:       date       || '',
        subject:    subject    || '',
        body:       cleanBody  || '',
        coAuthors,
      };
    });

  fs.writeFileSync(OUT, JSON.stringify(entries, null, 2), 'utf8');
  console.log(`✓ deploy-log.json written — ${entries.length} commits`);
} catch (err) {
  // Not in a git repo (e.g. during some CI steps) — write empty array so page still loads
  fs.writeFileSync(OUT, '[]', 'utf8');
  console.warn('⚠ generate-deploy-log: git log failed, wrote empty log:', err.message);
}
