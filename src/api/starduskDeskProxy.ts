/**
 * Stardusk Star Desk proxy.
 *
 * Server-side, read-only pipe from the Protected Research Control Center
 * to the studio desk beside the avatar. The browser never receives the
 * module token. Decisions are display-only and never trigger actions.
 *
 * The v1.0 authenticated read path is decisions:read
 * (POST /api/rpc/research/decisions). Pending unreviewed findings are
 * not in this feed until a records:read scope exists on the control
 * center.
 */
import express, { type Request, type Response } from 'express';
import { requireStudioSession } from './authSession.ts';

export const starduskDeskProxyRouter = express.Router();

const DEFAULT_MODULE_ID = 'sovereign.research.orbital';
const DECISIONS_PATH = '/api/rpc/research/decisions';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_CURSOR_LENGTH = 256;
const MODULE_ID_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

const DECISION_FIELDS = [
  'id',
  'recordId',
  'moduleId',
  'externalId',
  'title',
  'decision',
  'rationale',
  'createdAt',
  'currentStatus',
  'recordUpdatedAt',
] as const;

type DecisionField = (typeof DECISION_FIELDS)[number];

export interface DecisionCursor {
  createdAt: string;
  id: string;
}

function envOrigin(): string {
  return (process.env.STARDUSK_ORIGIN || '').trim();
}

function envToken(): string {
  return (process.env.STARDUSK_DESK_TOKEN || '').trim();
}

function isBlockedDeskHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (
      host.startsWith('10.') ||
      host.startsWith('127.') ||
      host.startsWith('0.') ||
      host.startsWith('169.254.') ||
      host.startsWith('192.168.')
    ) {
      return true;
    }
    const second = Number(host.split('.')[1] || '');
    return host.startsWith('172.') && second >= 16 && second <= 31;
  }
  if (host.includes(':')) {
    return host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd');
  }
  return false;
}

export function validateControlCenterOrigin(origin: string): { ok: true; origin: string } | { ok: false; error: string } {
  if (!origin) {
    return { ok: false, error: 'STARDUSK_ORIGIN is not set' };
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return { ok: false, error: 'STARDUSK_ORIGIN is not a valid URL' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'STARDUSK_ORIGIN must be https' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'STARDUSK_ORIGIN must not include credentials' };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, error: 'STARDUSK_ORIGIN must not include a query or fragment' };
  }
  const path = parsed.pathname.replace(/\/+$/, '') || '';
  if (path && (path === '/api' || path.startsWith('/api/'))) {
    return { ok: false, error: 'STARDUSK_ORIGIN must not include an /api path' };
  }
  if (!parsed.hostname || isBlockedDeskHost(parsed.hostname)) {
    return { ok: false, error: 'STARDUSK_ORIGIN must be a public https hostname' };
  }
  return { ok: true, origin: `${parsed.protocol}//${parsed.host}${path}` };
}

function tokenLooksSafe(token: string): boolean {
  return token.startsWith('sdk_') && token.length >= 8 && token.length <= 4096 && !/\s/.test(token);
}

function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('sdk_') || /bearer\s+sdk_/i.test(value)) {
      return '[redacted]';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|authorization|password|cookie/i.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = redactSecrets(entry);
      }
    }
    return out;
  }
  return value;
}

function sanitizeDecision(raw: unknown): Record<DecisionField, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const item: Record<string, unknown> = {};
  for (const field of DECISION_FIELDS) {
    const value = src[field];
    if (value === undefined) continue;
    item[field] = redactSecrets(value);
  }
  if (!item.id && !item.externalId && !item.recordId) return null;
  return item as Record<DecisionField, unknown>;
}

function unwrapEnvelope(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'json' in payload) {
    return (payload as { json: unknown }).json;
  }
  return payload;
}

export function sanitizeDecisionCursor(raw: unknown): DecisionCursor | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.createdAt !== 'string' || typeof rec.id !== 'string') return null;
  if (!rec.createdAt || !rec.id || rec.createdAt.length > 64 || rec.id.length > 128) return null;
  if (rec.createdAt.startsWith('sdk_') || rec.id.startsWith('sdk_')) return null;
  return { createdAt: rec.createdAt, id: rec.id };
}

function parseDecisionsPayload(payload: unknown): { items: Record<string, unknown>[]; nextCursor: DecisionCursor | null } {
  const body = unwrapEnvelope(payload);
  if (Array.isArray(body)) {
    return { items: body.map(sanitizeDecision).filter((item): item is Record<DecisionField, unknown> => item !== null), nextCursor: null };
  }
  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    const list = Array.isArray(rec.items) ? rec.items : Array.isArray(rec.decisions) ? rec.decisions : [];
    return {
      items: list
        .map(sanitizeDecision)
        .filter((item): item is Record<DecisionField, unknown> => item !== null)
        .slice(0, 100),
      nextCursor: sanitizeDecisionCursor(rec.nextCursor),
    };
  }
  return { items: [], nextCursor: null };
}

function configuredState(): { configured: boolean; originHost: string | null; error?: string } {
  const originCheck = validateControlCenterOrigin(envOrigin());
  const token = envToken();
  if (!originCheck.ok) {
    return { configured: false, originHost: null, error: originCheck.error };
  }
  let originHost: string | null = null;
  try {
    originHost = new URL(originCheck.origin).hostname;
  } catch {
    originHost = null;
  }
  if (!tokenLooksSafe(token)) {
    return {
      configured: false,
      originHost,
      error: 'STARDUSK_DESK_TOKEN is not set or is not an sdk_ module token',
    };
  }
  return { configured: true, originHost };
}

function clientSuppliedModuleToken(req: Request): boolean {
  const queryBlob = JSON.stringify(req.query || {});
  if (queryBlob.includes('sdk_')) return true;
  if (!req.body || typeof req.body !== 'object') return false;
  const body = req.body as Record<string, unknown>;
  return 'moduleToken' in body || 'token' in body || 'authorization' in body || 'STARDUSK_DESK_TOKEN' in body;
}

async function fetchDecisions(
  origin: string,
  token: string,
  moduleId: string,
  cursor: DecisionCursor | null
): Promise<{ items: Record<string, unknown>[]; nextCursor: DecisionCursor | null }> {
  const url = `${origin}${DECISIONS_PATH}`;
  const json: Record<string, unknown> = { moduleId, limit: 50 };
  if (cursor) json.cursor = cursor;

  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ json }),
  });

  if (response.status >= 300 && response.status < 400) {
    throw Object.assign(new Error('CONTROL_CENTER_REDIRECT_REFUSED'), { statusCode: 502 });
  }

  const text = await response.text();
  if (text.length > 1_000_000) {
    throw Object.assign(new Error('CONTROL_CENTER_INVALID_JSON'), { statusCode: 502 });
  }
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw Object.assign(new Error('CONTROL_CENTER_INVALID_JSON'), { statusCode: 502 });
    }
  }

  if (!response.ok) {
    throw Object.assign(new Error('CONTROL_CENTER_ERROR'), { statusCode: 502 });
  }

  return parseDecisionsPayload(parsed);
}

starduskDeskProxyRouter.get('/health', (req: Request, res: Response) => {
  if (!requireStudioSession(req, res)) return;
  if (clientSuppliedModuleToken(req)) {
    res.status(400).json({ ok: false, error: 'MODULE_TOKEN_NOT_ACCEPTED' });
    return;
  }
  const state = configuredState();
  res.status(state.configured ? 200 : 503).json({
    ok: state.configured,
    configured: state.configured,
    originHost: state.originHost,
    scope: 'decisions:read',
    source: 'control-center-decisions',
    ...(state.error && !state.configured ? { error: state.error } : {}),
  });
});

starduskDeskProxyRouter.get('/feed', async (req: Request, res: Response) => {
  if (!requireStudioSession(req, res)) return;
  if (clientSuppliedModuleToken(req)) {
    res.status(400).json({ ok: false, error: 'MODULE_TOKEN_NOT_ACCEPTED' });
    return;
  }

  const state = configuredState();
  if (!state.configured) {
    res.status(503).json({
      ok: false,
      error: 'DESK_NOT_CONFIGURED',
      detail: state.error,
    });
    return;
  }

  const originCheck = validateControlCenterOrigin(envOrigin());
  if (!originCheck.ok) {
    res.status(503).json({ ok: false, error: 'DESK_NOT_CONFIGURED', detail: originCheck.error });
    return;
  }

  const rawModule = typeof req.query.moduleId === 'string' ? req.query.moduleId.trim() : DEFAULT_MODULE_ID;
  if (!MODULE_ID_RE.test(rawModule) || rawModule.toLowerCase().includes('sdk_')) {
    res.status(400).json({ ok: false, error: 'INVALID_MODULE_ID' });
    return;
  }

  let cursor: DecisionCursor | null = null;
  const rawCursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : '';
  if (rawCursor) {
    if (rawCursor.length > MAX_CURSOR_LENGTH) {
      res.status(400).json({ ok: false, error: 'INVALID_CURSOR' });
      return;
    }
    try {
      cursor = sanitizeDecisionCursor(JSON.parse(rawCursor));
    } catch {
      cursor = null;
    }
    if (!cursor) {
      res.status(400).json({ ok: false, error: 'INVALID_CURSOR' });
      return;
    }
  }

  try {
    const result = await fetchDecisions(originCheck.origin, envToken(), rawModule, cursor);
    res.status(200).json({
      ok: true,
      moduleId: rawModule,
      originHost: state.originHost,
      source: 'control-center-decisions',
      scope: 'decisions:read',
      externalExecutionAuthorized: false,
      fetchedAt: new Date().toISOString(),
      items: result.items,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    const aborted = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
    res.status(aborted ? 504 : 502).json({
      ok: false,
      error: aborted ? 'CONTROL_CENTER_TIMEOUT' : 'CONTROL_CENTER_ERROR',
    });
  }
});

export default starduskDeskProxyRouter;
