import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';

export interface SessionTokenPayload {
  iss: string;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  scopes: string[];
}

export interface SessionVerifyResult {
  valid: boolean;
  revoked: boolean;
  jti: string | null;
  payload: SessionTokenPayload | null;
  reason?: string;
}

const SESSION_ISSUER = 'CYBERCORE-ai-studio';
const SESSION_DEFAULT_SUB = 'cybercore-studio-operator';
const SESSION_DEFAULT_SCOPES = [
  'studio:operator',
  'stardust:read',
  'stardust:control',
] as const;

const SESSION_TTL_SECONDS = 900; // 15 minutes
const AUTH_COOKIE_NAME = '__SECURE-aistudio_auth_flow_may_set_cookies';
const COOKIE_MAX_AGE_SECONDS = 31536000;
const MAX_REVOKED_ENTRIES = 4096;

const SESSION_HMAC_SECRET =
  process.env.CYBERCORE_SESSION_SECRET ||
  process.env.SESSION_HMAC_SECRET ||
  crypto.randomBytes(32).toString('hex');

/**
 * Bounded in-memory JTI revocation map (jti -> expiration unix timestamp in seconds).
 */
const revokedJtis = new Map<string, number>();

function pruneRevokedJtis(nowSec: number): void {
  for (const [jti, exp] of revokedJtis.entries()) {
    if (exp <= nowSec) {
      revokedJtis.delete(jti);
    }
  }
  while (revokedJtis.size >= MAX_REVOKED_ENTRIES) {
    const oldestKey = revokedJtis.keys().next().value;
    if (oldestKey !== undefined) {
      revokedJtis.delete(oldestKey);
    } else {
      break;
    }
  }
}

function recordRevokedJti(jti: string, expSec: number): void {
  const nowSec = Math.floor(Date.now() / 1000);
  pruneRevokedJtis(nowSec);
  const effectiveExp = Math.max(expSec, nowSec + SESSION_TTL_SECONDS);
  revokedJtis.set(jti, effectiveExp);
}

function computeHmacSignature(encodedHeader: string, encodedPayload: string): string {
  return crypto
    .createHmac('sha256', SESSION_HMAC_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
}

function timingSafeSignatureEqual(expectedSig: string, providedSig: string): boolean {
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const providedBuf = Buffer.from(providedSig, 'utf8');
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function mintSessionToken(
  sub: string = SESSION_DEFAULT_SUB,
  scopes: string[] = [...SESSION_DEFAULT_SCOPES]
): {
  token: string;
  jti: string;
  sub: string;
  scopes: string[];
  iat: number;
  exp: number;
  expiresAt: string;
  expiresIn: number;
} {
  const nowSec = Math.floor(Date.now() / 1000);
  pruneRevokedJtis(nowSec);

  const jti = crypto.randomUUID();
  const exp = nowSec + SESSION_TTL_SECONDS;
  const header = { alg: 'HS256', typ: 'AST2' };
  const payload: SessionTokenPayload = {
    iss: SESSION_ISSUER,
    sub,
    jti,
    iat: nowSec,
    exp,
    scopes,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = computeHmacSignature(encodedHeader, encodedPayload);
  const token = `${encodedHeader}.${encodedPayload}.${signature}`;
  const expiresAt = new Date(exp * 1000).toISOString();

  return {
    token,
    jti,
    sub,
    scopes,
    iat: nowSec,
    exp,
    expiresAt,
    expiresIn: SESSION_TTL_SECONDS,
  };
}

export function verifySessionToken(token: string | null | undefined): SessionVerifyResult {
  const nowSec = Math.floor(Date.now() / 1000);
  pruneRevokedJtis(nowSec);

  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      revoked: false,
      jti: null,
      payload: null,
      reason: 'MISSING_TOKEN',
    };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return {
      valid: false,
      revoked: false,
      jti: null,
      payload: null,
      reason: 'MALFORMED_TOKEN',
    };
  }

  const [encodedHeader, encodedPayload, providedSig] = parts;
  const expectedSig = computeHmacSignature(encodedHeader, encodedPayload);

  if (!timingSafeSignatureEqual(expectedSig, providedSig)) {
    return {
      valid: false,
      revoked: false,
      jti: null,
      payload: null,
      reason: 'INVALID_SIGNATURE',
    };
  }

  let parsedPayload: unknown;
  try {
    const jsonText = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    parsedPayload = JSON.parse(jsonText);
  } catch {
    return {
      valid: false,
      revoked: false,
      jti: null,
      payload: null,
      reason: 'INVALID_PAYLOAD_JSON',
    };
  }

  if (!parsedPayload || typeof parsedPayload !== 'object') {
    return {
      valid: false,
      revoked: false,
      jti: null,
      payload: null,
      reason: 'INVALID_PAYLOAD_SHAPE',
    };
  }

  const candidate = parsedPayload as Record<string, unknown>;
  if (
    candidate.iss !== SESSION_ISSUER ||
    typeof candidate.jti !== 'string' ||
    !candidate.jti ||
    typeof candidate.sub !== 'string' ||
    typeof candidate.iat !== 'number' ||
    typeof candidate.exp !== 'number' ||
    !Array.isArray(candidate.scopes)
  ) {
    return {
      valid: false,
      revoked: false,
      jti: typeof candidate.jti === 'string' ? candidate.jti : null,
      payload: null,
      reason: 'INVALID_CLAIMS',
    };
  }

  const payload: SessionTokenPayload = {
    iss: candidate.iss,
    sub: candidate.sub,
    jti: candidate.jti,
    iat: candidate.iat,
    exp: candidate.exp,
    scopes: candidate.scopes.filter((s): s is string => typeof s === 'string'),
  };

  if (revokedJtis.has(payload.jti)) {
    return {
      valid: false,
      revoked: true,
      jti: payload.jti,
      payload,
      reason: 'TOKEN_REVOKED',
    };
  }

  if (nowSec >= payload.exp) {
    return {
      valid: false,
      revoked: false,
      jti: payload.jti,
      payload,
      reason: 'TOKEN_EXPIRED',
    };
  }

  return {
    valid: true,
    revoked: false,
    jti: payload.jti,
    payload,
  };
}

function extractSessionTokenFromRequest(
  req: Request,
  allowBodyToken = false
): { token: string; source: 'bearer' | 'body' | 'cookie' } | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (bearer) {
      return { token: bearer, source: 'bearer' };
    }
  }

  if (allowBodyToken && req.body && typeof req.body === 'object') {
    const rawBodyToken = (req.body as Record<string, unknown>).token;
    if (typeof rawBodyToken === 'string' && rawBodyToken.trim()) {
      return { token: rawBodyToken.trim(), source: 'body' };
    }
  }

  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(
    /(?:^|;\s*)__SECURE-aistudio_auth_flow_may_set_cookies=([^;]+)/i
  );
  if (match && match[1]) {
    try {
      const decoded = decodeURIComponent(match[1]).trim();
      // Distinguish signed 3-segment HMAC tokens from legacy plain-string cookie markers
      if (decoded.split('.').length === 3) {
        return { token: decoded, source: 'cookie' };
      }
    } catch {
      // Ignore malformed URI encoding in cookie header
    }
  }

  return null;
}

function normalizePeerAddress(address: string | undefined): string {
  const raw = (address || '').trim().toLowerCase();
  if (raw.startsWith('::ffff:')) return raw.slice('::ffff:'.length);
  return raw;
}

/**
 * dev-open is granted only when the TCP peer is loopback. The Host header is
 * intentionally not read: the client sets it, and the socket peer
 * (req.socket.remoteAddress) is not something the client can choose. Sending
 * Host: localhost from a remote address does not pass.
 *
 * X-Forwarded-For, X-Forwarded-Host, X-Real-IP, and Forwarded refuse the
 * escape. A proxy that connects from 127.0.0.1 and strips those headers would
 * still look local, so do not enable dev-open behind a reverse proxy.
 */
export function isDirectLoopbackPeer(req: Request): boolean {
  if (
    req.headers['x-forwarded-for'] ||
    req.headers['x-forwarded-host'] ||
    req.headers['x-real-ip'] ||
    req.headers.forwarded
  ) {
    return false;
  }
  const peer = normalizePeerAddress(req.socket?.remoteAddress);
  return peer === '127.0.0.1' || peer === '::1';
}

interface CloudflareAccessConfig {
  teamDomain: string;
  aud: string;
}

interface AccessJwk {
  kty?: string;
  kid?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

const ACCESS_CERT_TTL_MS = 10 * 60_000;
const accessCertCache = new Map<string, { expiresAt: number; keys: AccessJwk[] }>();

/**
 * Public hosts must sit behind Cloudflare Access. Session minting stays
 * closed until CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD are
 * set and the request carries a verified Cf-Access-Jwt-Assertion.
 * Loopback-only escape: STUDIO_SESSION_ISSUE_MODE=dev-open, and only when
 * NODE_ENV is not production and the TCP peer is 127.0.0.1 or ::1.
 * The Host header is not consulted.
 */
function configuredCloudflareAccess(): CloudflareAccessConfig | null {
  const rawDomain = (process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN || '').trim();
  const aud = (process.env.CLOUDFLARE_ACCESS_AUD || '').trim();
  if (!rawDomain || !aud || aud.length > 256 || /\s/.test(aud)) return null;

  let host = rawDomain;
  if (rawDomain.includes('://')) {
    try {
      const parsed = new URL(rawDomain);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
        return null;
      }
      if (parsed.pathname && parsed.pathname !== '/') return null;
      host = parsed.hostname;
    } catch {
      return null;
    }
  }
  host = host.toLowerCase().replace(/\.+$/, '');
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..') || !host.endsWith('.cloudflareaccess.com')) {
    return null;
  }
  return { teamDomain: host, aud };
}

function keysFromCertificateEntries(certs: unknown): AccessJwk[] {
  if (!Array.isArray(certs)) return [];
  const keys: AccessJwk[] = [];
  for (const entry of certs) {
    if (!entry || typeof entry !== 'object') continue;
    const cert = (entry as { cert?: unknown }).cert;
    const kid = (entry as { kid?: unknown }).kid;
    if (typeof cert !== 'string' || !cert.includes('BEGIN CERTIFICATE')) continue;
    try {
      const exported = crypto.createPublicKey(cert).export({ format: 'jwk' }) as AccessJwk;
      if (exported.kty === 'RSA' && exported.n && exported.e) {
        keys.push({ ...exported, kid: typeof kid === 'string' ? kid : exported.kid });
      }
    } catch {
      // Skip a malformed certificate and keep looking.
    }
  }
  return keys;
}

async function loadCloudflareAccessKeys(teamDomain: string, force = false): Promise<AccessJwk[]> {
  const now = Date.now();
  const cached = accessCertCache.get(teamDomain);
  if (!force && cached && cached.expiresAt > now) return cached.keys;

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('CERT_REDIRECT');
  }
  if (!response.ok) {
    throw new Error('CERT_HTTP');
  }
  const payload = (await response.json()) as { keys?: AccessJwk[]; public_certs?: unknown };
  const fromJwks = Array.isArray(payload.keys)
    ? payload.keys.filter((key) => key && key.kty === 'RSA' && typeof key.n === 'string' && typeof key.e === 'string')
    : [];
  const keys = fromJwks.length > 0 ? fromJwks : keysFromCertificateEntries(payload.public_certs);
  if (keys.length === 0) {
    throw new Error('CERT_EMPTY');
  }
  accessCertCache.set(teamDomain, { expiresAt: now + ACCESS_CERT_TTL_MS, keys });
  return keys;
}

function decodeJwtJson(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function verifyCloudflareAccessJwt(jwt: string, access: CloudflareAccessConfig): Promise<boolean> {
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;
  const [encodedHeader, encodedPayload, encodedSig] = parts;

  let header: { alg?: unknown; kid?: unknown };
  let claims: { aud?: unknown; iss?: unknown; exp?: unknown; nbf?: unknown };
  try {
    header = decodeJwtJson(encodedHeader) as { alg?: unknown; kid?: unknown };
    claims = decodeJwtJson(encodedPayload) as { aud?: unknown; iss?: unknown; exp?: unknown; nbf?: unknown };
  } catch {
    return false;
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return false;
  if (claims.iss !== `https://${access.teamDomain}`) return false;

  const audOk =
    claims.aud === access.aud || (Array.isArray(claims.aud) && claims.aud.includes(access.aud));
  if (!audOk) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || nowSec > claims.exp + 60) return false;
  if (typeof claims.nbf === 'number' && nowSec + 60 < claims.nbf) return false;

  let keys = await loadCloudflareAccessKeys(access.teamDomain);
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    keys = await loadCloudflareAccessKeys(access.teamDomain, true);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk) return false;

  const signature = Buffer.from(encodedSig, 'base64url');
  const keyObject = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  return crypto.verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), keyObject, signature);
}

async function assertSessionIssueAllowed(
  req: Request
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const mode = (process.env.STUDIO_SESSION_ISSUE_MODE || '').trim().toLowerCase();
  if (mode === 'dev-open' && process.env.NODE_ENV !== 'production' && isDirectLoopbackPeer(req)) {
    return { ok: true };
  }

  const access = configuredCloudflareAccess();
  if (!access) {
    return { ok: false, status: 503, error: 'SESSION_ISSUE_LOCKED' };
  }

  const assertionHeader = req.headers['cf-access-jwt-assertion'];
  const jwt = Array.isArray(assertionHeader) ? assertionHeader[0] : assertionHeader;
  if (!jwt || typeof jwt !== 'string' || jwt.split('.').length !== 3 || jwt.length > 16_384) {
    return { ok: false, status: 401, error: 'CLOUDFLARE_ACCESS_REQUIRED' };
  }

  try {
    const valid = await verifyCloudflareAccessJwt(jwt, access);
    if (!valid) {
      return { ok: false, status: 401, error: 'CLOUDFLARE_ACCESS_INVALID' };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: 'CLOUDFLARE_ACCESS_UNAVAILABLE' };
  }
}

function isAllowedStudioOrigin(req: Request): boolean {
  const originHeader = req.headers.origin;
  if (!originHeader || typeof originHeader !== 'string') {
    return true;
  }
  try {
    const parsedOrigin = new URL(originHeader);
    const reqHost = (req.headers.host || '').split(':')[0].toLowerCase();
    const originHost = parsedOrigin.hostname.toLowerCase();
    if (reqHost && originHost === reqHost) {
      return true;
    }
    if (
      originHost === 'localhost' ||
      originHost === '127.0.0.1' ||
      originHost.endsWith('.aegentixcybernetics.com') ||
      originHost === 'aegentixcybernetics.com' ||
      originHost.endsWith('.github.io') ||
      originHost.endsWith('.run.app') ||
      originHost.endsWith('.google.com') ||
      originHost.endsWith('.googleusercontent.com')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function setSessionCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
  );
}

function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
  );
}

export const authSessionRouter = express.Router();

/**
 * GET /status
 * Verifies Authorization: Bearer <token> or __SECURE-aistudio_auth_flow_may_set_cookies cookie.
 * Rejects revoked or tampered tokens immediately with 401.
 */
authSessionRouter.get('/status', (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const extracted = extractSessionTokenFromRequest(req, false);

  if (!extracted) {
    res.status(200).json({
      ok: true,
      authenticated: false,
      sessionActive: false,
      revoked: false,
      jti: null,
      sub: null,
      scopes: [],
      expiresAt: null,
      mode: 'node-hmac-v2',
      timestamp,
    });
    return;
  }

  const verification = verifySessionToken(extracted.token);
  if (!verification.valid || !verification.payload) {
    res.status(401).json({
      ok: false,
      authenticated: false,
      sessionActive: false,
      revoked: verification.revoked,
      error: verification.reason || 'INVALID_SESSION_TOKEN',
      jti: verification.jti,
      sub: null,
      scopes: [],
      expiresAt: null,
      mode: 'node-hmac-v2',
      timestamp,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    authenticated: true,
    sessionActive: true,
    revoked: false,
    jti: verification.payload.jti,
    sub: verification.payload.sub,
    scopes: verification.payload.scopes,
    expiresAt: new Date(verification.payload.exp * 1000).toISOString(),
    mode: 'node-hmac-v2',
    timestamp,
  });
});

/**
 * GET /verify & POST /verify
 * Strict token verification endpoint; rejects missing, expired, tampered, or revoked tokens with 401.
 */
function handleVerify(req: Request, res: Response): void {
  const timestamp = new Date().toISOString();
  const extracted = extractSessionTokenFromRequest(req, true);
  const verification = verifySessionToken(extracted?.token);

  if (!verification.valid || !verification.payload) {
    res.status(401).json({
      ok: false,
      authenticated: false,
      sessionActive: false,
      revoked: verification.revoked,
      error: verification.reason || 'UNAUTHORIZED',
      jti: verification.jti,
      mode: 'node-hmac-v2',
      timestamp,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    authenticated: true,
    sessionActive: true,
    revoked: false,
    jti: verification.payload.jti,
    sub: verification.payload.sub,
    scopes: verification.payload.scopes,
    expiresAt: new Date(verification.payload.exp * 1000).toISOString(),
    mode: 'node-hmac-v2',
    timestamp,
  });
}

authSessionRouter.get('/verify', handleVerify);
authSessionRouter.post('/verify', handleVerify);

/**
 * POST /issue
 * Fail closed. Mints a signed 15-minute HMAC-SHA256 studio session only after
 * a verified Cloudflare Access JWT, or when the TCP peer is loopback,
 * STUDIO_SESSION_ISSUE_MODE=dev-open, and NODE_ENV is not production.
 * A spoofed Host header does not qualify.
 * Cloudflare Access must sit in front of this route on any public host.
 * A Stardusk module token is never accepted here.
 */
authSessionRouter.post('/issue', (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();

  void (async () => {
    if (!isAllowedStudioOrigin(req)) {
      res.status(403).json({
        ok: false,
        authenticated: false,
        error: 'FORBIDDEN_CROSS_ORIGIN_SESSION_ISSUE',
        mode: 'node-hmac-v2',
        timestamp,
      });
      return;
    }

    const gate = await assertSessionIssueAllowed(req);
    if (!gate.ok) {
      res.status(gate.status).json({
        ok: false,
        authenticated: false,
        error: gate.error,
        mode: 'node-hmac-v2',
        detail:
          gate.error === 'SESSION_ISSUE_LOCKED'
            ? 'Cloudflare Access must sit in front of /api/auth/session. Set CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD.'
            : undefined,
        timestamp,
      });
      return;
    }

    const minted = mintSessionToken();
    setSessionCookie(res, minted.token);

    res.status(200).json({
      ok: true,
      authenticated: true,
      sessionActive: true,
      token: minted.token,
      jti: minted.jti,
      sub: minted.sub,
      scopes: minted.scopes,
      expiresAt: minted.expiresAt,
      expiresIn: minted.expiresIn,
      mode: 'node-hmac-v2',
      timestamp,
    });
  })().catch(() => {
    if (!res.headersSent) {
      res.status(503).json({
        ok: false,
        authenticated: false,
        error: 'SESSION_ISSUE_LOCKED',
        mode: 'node-hmac-v2',
        timestamp,
      });
    }
  });
});

/**
 * POST /refresh
 * Rotates an existing valid, non-revoked session token, revoking the prior JTI and minting a fresh 15-min token.
 */
authSessionRouter.post('/refresh', (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const extracted = extractSessionTokenFromRequest(req, true);
  const verification = verifySessionToken(extracted?.token);

  if (!verification.valid || !verification.payload) {
    res.status(401).json({
      ok: false,
      authenticated: false,
      revoked: verification.revoked,
      error: verification.reason || 'INVALID_OR_REVOKED_TOKEN',
      jti: verification.jti,
      mode: 'node-hmac-v2',
      timestamp,
    });
    return;
  }

  // Revoke rotated token JTI so replay of old token is rejected
  recordRevokedJti(verification.payload.jti, verification.payload.exp);

  const minted = mintSessionToken(verification.payload.sub, verification.payload.scopes);
  setSessionCookie(res, minted.token);

  res.status(200).json({
    ok: true,
    authenticated: true,
    sessionActive: true,
    token: minted.token,
    jti: minted.jti,
    previousJti: verification.payload.jti,
    sub: minted.sub,
    scopes: minted.scopes,
    expiresAt: minted.expiresAt,
    expiresIn: minted.expiresIn,
    mode: 'node-hmac-v2',
    timestamp,
  });
});

/**
 * POST /revoke
 * Verifies token signature, records JTI in bounded revocation map, clears session cookie.
 */
authSessionRouter.post('/revoke', (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const extracted = extractSessionTokenFromRequest(req, true);
  const verification = verifySessionToken(extracted?.token);

  if (!verification.payload) {
    res.status(401).json({
      ok: false,
      revoked: false,
      error: verification.reason || 'INVALID_SESSION_TOKEN',
      mode: 'node-hmac-v2',
      timestamp,
    });
    return;
  }

  recordRevokedJti(verification.payload.jti, verification.payload.exp);
  clearSessionCookie(res);

  res.status(200).json({
    ok: true,
    revoked: true,
    authenticated: false,
    sessionActive: false,
    jti: verification.payload.jti,
    mode: 'node-hmac-v2',
    timestamp,
  });
});

/**
 * Gate a studio API route to a valid, non-revoked operator session.
 * Accepts Authorization: Bearer or the studio session cookie. Does not
 * accept a token in the request body. Refuses sdk_ module tokens so the
 * Stardusk credential can never be presented as a studio session.
 *
 * Write routes pass `{ write: true }` and require `studio:operator`.
 * Read routes accept `studio:operator` or `stardust:read`.
 */
export function requireStudioSession(
  req: Request,
  res: Response,
  options?: { write?: boolean }
): SessionTokenPayload | null {
  if (!isAllowedStudioOrigin(req)) {
    res.status(403).json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
    return null;
  }
  const extracted = extractSessionTokenFromRequest(req, false);
  const presented = extracted?.token;
  if (typeof presented === 'string' && presented.startsWith('sdk_')) {
    res.status(401).json({ ok: false, error: 'MODULE_TOKEN_NOT_ACCEPTED' });
    return null;
  }
  const result = verifySessionToken(extracted?.token);
  if (!result.valid || !result.payload) {
    res.status(401).json({ ok: false, error: result.reason || 'UNAUTHORIZED' });
    return null;
  }
  const scopes = result.payload.scopes || [];
  const allowed = options?.write
    ? scopes.includes('studio:operator')
    : scopes.includes('studio:operator') || scopes.includes('stardust:read');
  if (!allowed) {
    res.status(403).json({ ok: false, error: 'INSUFFICIENT_SCOPE' });
    return null;
  }
  return result.payload;
}

export default authSessionRouter;
