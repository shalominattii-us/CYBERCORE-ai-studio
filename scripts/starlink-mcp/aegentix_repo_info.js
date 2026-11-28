// aegentix_repo_info — read-only MCP tool for sovereign_tools.js (AEG-JARVIS-PRIME)
// Returns only { checkout_name, owner_repo, branch, head_short }.
// Runs exactly three git commands via execFile (no shell), never writes, never returns paths or URLs.
// Call ONLY after the server's existing auth (CF Access JWT or bearer) has passed.
'use strict';
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const nodePath = require('node:path');

// ---- Allowlist: checkout name -> absolute local path (server-side only, never returned). ----
// Fill in the real paths on the node, or set AEGENTIX_REPO_CHECKOUTS to a JSON object
// like {"space-station":"C:\\path\\to\\checkout"}. Unknown names are rejected.
const DEFAULT_CHECKOUT = 'space-station';
function loadCheckouts() {
  let map = { 'space-station': '' /* TODO: set the Space Station checkout path on the ROG, or use AEGENTIX_REPO_CHECKOUTS */ };
  const env = process.env.AEGENTIX_REPO_CHECKOUTS;
  if (env) {
    try {
      const parsed = JSON.parse(env);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = { ...map, ...parsed };
    } catch { /* ignore bad env; fall back to file map */ }
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(map).filter(([k, v]) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(k) && typeof v === 'string' && v.length > 0 && nodePath.isAbsolute(v))
  ));
}
const CHECKOUTS = loadCheckouts();

const GIT_TIMEOUT_MS = 5000;
function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 64 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    }, (err, stdout) => (err ? reject(new Error('git_failed')) : resolve(String(stdout).trim())));
  });
}

// Normalize any remote form to "owner/repo"; drops scheme, host, credentials, query, ".git".
const ALLOWED_HOSTS = new Set(['github.com']);
function normalizeRemote(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let host, path;
  const scp = s.match(/^[^@\s/]+@([^:\s/]+):(.+)$/); // git@github.com:owner/repo.git
  if (scp) { host = scp[1]; path = scp[2]; }
  else {
    try { const u = new URL(s); if (!['https:', 'ssh:'].includes(u.protocol)) return null; if (u.port) return null; host = u.hostname; path = u.pathname; } catch { return null; }
  }
  if (!ALLOWED_HOSTS.has(String(host).toLowerCase())) return null;
  path = path.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  const parts = path.split('/');
  if (parts.length !== 2) return null; // exactly owner/repo, no nesting
  const [owner, repo] = parts;
  const ok = /^[A-Za-z0-9_.-]{1,100}$/;
  return ok.test(owner) && ok.test(repo) ? `${owner}/${repo}` : null;
}

const definition = {
  name: 'aegentix_repo_info',
  description: 'Read-only: returns owner/repo, branch and short HEAD sha for an allowlisted AEGENTIX checkout (default: space-station). No paths or URLs are returned.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string', enum: Object.keys(CHECKOUTS).length ? Object.keys(CHECKOUTS) : [DEFAULT_CHECKOUT] } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

async function handler(args = {}) {
  const fail = (code) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: code }) }] });
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return fail('invalid_input');
  const extra = Object.keys(args).filter((k) => k !== 'name');
  if (extra.length) return fail('invalid_input');
  const name = args.name === undefined ? DEFAULT_CHECKOUT : args.name;
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(CHECKOUTS, name)) return fail('unknown_checkout');
  const cwd = CHECKOUTS[name];
  try { if (!fs.statSync(cwd).isDirectory()) return fail('checkout_unavailable'); } catch { return fail('checkout_unavailable'); }
  try {
    const [remote, branch, head] = await Promise.all([
      git(cwd, ['remote', 'get-url', 'origin']),
      git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
      git(cwd, ['rev-parse', '--short', 'HEAD']),
    ]);
    const owner_repo = normalizeRemote(remote);
    if (!owner_repo) return fail('remote_unrecognized');
    const result = {
      checkout_name: name,
      owner_repo,
      branch: /^[A-Za-z0-9._\/-]{1,200}$/.test(branch) ? branch : null,
      head_short: /^[0-9a-f]{4,40}$/.test(head) ? head : null,
    };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  } catch {
    return fail('git_failed');
  }
}

module.exports = { definition, handler, _normalizeRemote: normalizeRemote };
