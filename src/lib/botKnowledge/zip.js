// A minimal ZIP reader — just enough to pull one named file out of a .docx.
//
// Why hand-rolled instead of a library: a .docx is a ZIP archive, and the only
// thing we need out of it is `word/document.xml`. Adding a zip dependency to
// this app means adding it to the production Lambda bundle, and this codebase
// has already been burned twice by files that resolve fine locally and vanish
// in prod (see the runtime-asset rules in CLAUDE.md). Node's own zlib does the
// decompression, so this file adds nothing to the bundle at all.
//
// Scope is deliberately narrow. It reads the central directory, finds an entry
// by exact name, and inflates it. Stored (method 0) and deflated (method 8) are
// supported, which is everything Word writes. ZIP64 and encrypted archives are
// not, and both fail loudly rather than returning half a document.

import zlib from 'zlib';

const EOCD_SIG    = 0x06054b50; // end of central directory
const CENTRAL_SIG = 0x02014b50; // central directory file header
const LOCAL_SIG   = 0x04034b50; // local file header

const ZIP64_MARKER = 0xffffffff;

// The end-of-central-directory record is at the very end of the file, but a
// trailing comment can push it back by up to 64KB. Scan backwards for it.
function findEndOfCentralDirectory(buf) {
  const minPos = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * List every entry in the archive: { name, method, compressedSize, size, offset }.
 * Throws if the buffer is not a ZIP at all.
 */
export function listZipEntries(buf) {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new Error('Not a ZIP archive (no end-of-central-directory record).');

  const count  = buf.readUInt16LE(eocd + 10);
  let   offset = buf.readUInt32LE(eocd + 16);

  if (offset === ZIP64_MARKER) throw new Error('ZIP64 archives are not supported.');

  const entries = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIG) break;

    const method         = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const size           = buf.readUInt32LE(offset + 24);
    const nameLen        = buf.readUInt16LE(offset + 28);
    const extraLen       = buf.readUInt16LE(offset + 30);
    const commentLen     = buf.readUInt16LE(offset + 32);
    const localOffset    = buf.readUInt32LE(offset + 42);
    const name           = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

    entries.push({ name, method, compressedSize, size, offset: localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Read one entry by exact name. Returns a Buffer, or null if it is not there.
 */
export function readZipEntry(buf, wantedName) {
  const entry = listZipEntries(buf).find(e => e.name === wantedName);
  if (!entry) return null;

  if (entry.offset === ZIP64_MARKER || entry.compressedSize === ZIP64_MARKER) {
    throw new Error('ZIP64 archives are not supported.');
  }
  if (buf.readUInt32LE(entry.offset) !== LOCAL_SIG) {
    throw new Error(`Corrupt archive: no local header for "${wantedName}".`);
  }

  // The local header repeats the name and extra-field lengths, and they are NOT
  // always the same as the central directory's — the extra field in particular
  // routinely differs. The data starts after the LOCAL lengths, so they are the
  // ones to trust here.
  const nameLen  = buf.readUInt16LE(entry.offset + 26);
  const extraLen = buf.readUInt16LE(entry.offset + 28);
  const start    = entry.offset + 30 + nameLen + extraLen;
  const raw      = buf.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`Unsupported compression method ${entry.method} in "${wantedName}".`);
}
