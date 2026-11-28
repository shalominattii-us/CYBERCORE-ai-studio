// aegentix_fs_read — read-only, allowlisted file access for sovereign_tools.js (AEG-JARVIS-PRIME)
// Actions: "list" a directory or "read" a text file inside an allowlisted root. No writes, no exec.
// Call ONLY after the server's existing auth (CF Access JWT or bearer) has passed.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// Root name -> absolute path. Set via AEGENTIX_FS_ROOTS='{"space-station":"C:\\\\...","stardusk":"C:\\\\..."}'
function loadRoots() {
  let map = {};
  try {
    const parsed = JSON.parse(process.env.AEGENTIX_FS_ROOTS || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = parsed;
  } catch {
    map = {};
  }
  return Object.freeze(Object.fromEntries(Object.entries(map).filter(([k, v]) =>
    /^[a-z0-9][a-z0-9-]{0,63}$/.test(k) && typeof v === 'string' && path.isAbsolute(v))));
}
const ROOTS = loadRoots();
const MAX_BYTES = 256 * 1024;
const MAX_ENTRIES = 500;
// Never list or read these, anywhere under a root. A matching path segment blocks that
// directory and every descendant, because the check runs on the full relative path.
const DENY = [/(^|[\\/])\.git([\\/]|$)/i, /(^|[\\/])node_modules([\\/]|$)/i,
  /(^|[\\/])\.env(\.[^\\/]*)?([\\/]|$)/i, /(^|[\\/])\.(npmrc|netrc|envrc)([\\/]|$)/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.pub)?([\\/]|$)/i, /(^|[\\/])wallet\.dat([\\/]|$)/i,
  /\.(pem|key|p12|pfx|kdbx|jks|keystore|wallet|seed)$/i,
  /(secret|credential|token|private[-_]?key|mnemonic|password|dpapi|wallet|seed)/i,
  /(^|[\\/])\.(ssh|aws|gnupg|cloudflared)([\\/]|$)/i, /cert\.pem$/i];
const denied = (rel) => DENY.some((r) => r.test(String(rel || '').replace(/\\/g, '/')));

function escapesRoot(rel) {
  return String(rel || '').split(/[\\/]+/).some((part) => part === '..');
}

function resolveFailure(error) {
  if (error && (error.message === 'outside_root' || error.message === 'denied_path')) return error.message;
  if (error && (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'ELOOP')) return 'read_failed';
  return 'not_found';
}

async function resolveInside(root, rel) {
  if (escapesRoot(rel)) throw new Error('outside_root');
  // Reject the requested path before realpath so a symlink inside a denied directory
  // cannot be followed out to an allowed file.
  if (denied(rel)) throw new Error('denied_path');
  const base = await fs.realpath(ROOTS[root]);
  const target = await fs.realpath(path.resolve(base, rel || '.')); // follows symlinks, then checks containment
  const relOut = path.relative(base, target);
  if (relOut.startsWith('..') || path.isAbsolute(relOut)) throw new Error('outside_root');
  if (relOut && denied(relOut)) throw new Error('denied_path');
  return { target, relOut };
}

const rootNames = Object.keys(ROOTS);
const rootProperty = {
  type: 'string',
  description: rootNames.length
    ? 'Allowlisted root name.'
    : 'No roots are configured. Set AEGENTIX_FS_ROOTS to absolute folders before calling.',
};
if (rootNames.length) rootProperty.enum = rootNames;

const definition = {
  name: 'aegentix_fs_read',
  description: 'Read-only: list a folder or read a text file inside an allowlisted AEGENTIX root (e.g. space-station, stardusk). Secrets, keys, .env, .git and wallet files are always blocked. No writes.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['root'], properties: {
    root: rootProperty,
    action: { type: 'string', enum: ['list', 'read'], description: 'Default list.' },
    path: { type: 'string', description: 'Relative path inside the root. Default ".".', maxLength: 512 },
  } },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

async function handler(args = {}) {
  const fail = (code) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: code }) }] });
  if (!args || typeof args !== 'object' || Array.isArray(args)) return fail('invalid_input');
  if (Object.keys(args).some((k) => !['root', 'action', 'path'].includes(k))) return fail('invalid_input');
  const { root, action = 'list', path: rel = '.' } = args;
  if (!Object.keys(ROOTS).length) return fail('not_configured');
  if (typeof root !== 'string' || !Object.prototype.hasOwnProperty.call(ROOTS, root)) return fail('unknown_root');
  if (!['list', 'read'].includes(action) || typeof rel !== 'string' || rel.includes('\0')) return fail('invalid_input');
  let t;
  try { t = await resolveInside(root, rel); } catch (e) { return fail(resolveFailure(e)); }
  try {
    const st = await fs.stat(t.target);
    if (action === 'list') {
      if (!st.isDirectory()) return fail('not_a_directory');
      const ents = (await fs.readdir(t.target, { withFileTypes: true }))
        .filter((d) => !denied(path.join(t.relOut, d.name)))
        .slice(0, MAX_ENTRIES)
        .map((d) => ({ name: d.name, type: d.isDirectory() ? 'dir' : d.isFile() ? 'file' : 'other' }));
      const out = { root, path: t.relOut || '.', entries: ents, truncated: ents.length >= MAX_ENTRIES };
      return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
    }
    if (!st.isFile()) return fail('not_a_file');
    const fh = await fs.open(t.target, 'r');
    try {
      const buf = Buffer.alloc(Math.min(st.size, MAX_BYTES));
      await fh.read(buf, 0, buf.length, 0);
      // A null byte in the sampled prefix is treated as binary and is not returned.
      if (buf.includes(0)) return fail('binary_file');
      const out = { root, path: t.relOut, size: st.size, truncated: st.size > MAX_BYTES, text: buf.toString('utf8') };
      return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
    } finally { await fh.close(); }
  } catch { return fail('read_failed'); }
}

module.exports = { definition, handler };
