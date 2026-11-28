import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { emitEphemeralNanotransaction, getNanotransactionSnapshot } from './nanotransactionRewards.ts';
import { requireStudioSession } from './authSession.ts';

/**
 * Stardusk Orbital Research Lab — Sovereign OS Research Bridge (Contract v1.0)
 *
 * Byte-for-byte compatible with Runable's `stardusk_bridge.py` & Protected Research Control Center:
 * - Envelope: `{"json": VALUE}` (oRPC protocol)
 * - Scoped 90-day `sdk_...` module credentials (plaintext shown once; only SHA-256 hash stored)
 * - `POST /api/rpc/research/ingest` (`research:ingest` scope, atomic batch <=50 findings, exact dedup, 409 conflict rollback)
 * - `POST /api/rpc/research/decisions` (`decisions:read` scope, cursor pagination, `externalExecutionAuthorized: false`)
 * - Operator routes (state, token mint, revoke, review) require a studio session and fail closed.
 *   The browser never sends or displays an sdk_ module token.
 * - POST /sync-remote is retired. It does not read a module token or call another host.
 *   scripts/stardusk_bridge.py reads STARDUSK_ORIGIN and STARDUSK_MODULE_TOKEN from the server environment.
 * - Mints Ephemeral Nanotransaction Store-of-Value receipts (70% Operator / 30% AI) on verified research workstreams.
 */

export type FindingKind = 'requirement' | 'funding' | 'draft';
export type EvidenceAssertion = 'Proposed' | 'Source-backed' | 'Unverified';
export type RecordReviewStatus =
  | 'Awaiting review'
  | 'Verify eligibility'
  | 'Needs analysis'
  | 'Approved internally'
  | 'Changes requested';

export interface ResearchSource {
  url: string;
  title: string;
  publishedAt: string | null;
}

export interface ResearchFindingInput {
  externalId: string;
  kind: FindingKind;
  title: string;
  summary: string;
  category: string;
  researchedAt: string;
  sources: ResearchSource[];
  evidence: EvidenceAssertion;
  assumptions: string[];
  unresolvedQuestions: string[];
  detail: string;
}

export interface StoredResearchRecord extends ResearchFindingInput {
  recordId: string;
  moduleId: string;
  canonicalPayloadJson: string;
  payloadSha256: string;
  receivedAt: string;
  updatedAt: string;
  currentStatus: RecordReviewStatus;
}

export interface InternalReviewDecision {
  id: string;
  recordId: string;
  moduleId: string;
  externalId: string;
  decision: 'Approved internally' | 'Changes requested' | 'Needs analysis';
  rationale: string;
  createdAt: string;
  currentStatus: RecordReviewStatus;
  recordUpdatedAt: string;
}

interface HashedModuleCredential {
  credentialId: string;
  label: string;
  tokenPrefix: string;
  tokenSha256: string;
  scopes: Array<'research:ingest' | 'decisions:read'>;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

const ALLOWED_FINDING_KEYS = new Set([
  'externalId',
  'kind',
  'title',
  'summary',
  'category',
  'researchedAt',
  'sources',
  'evidence',
  'assumptions',
  'unresolvedQuestions',
  'detail',
]);

const ALLOWED_SOURCE_KEYS = new Set(['url', 'title', 'publishedAt']);
const EXTERNAL_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

const moduleCredentials: HashedModuleCredential[] = [];
const recordsByModuleKey = new Map<string, StoredResearchRecord>(); // `${moduleId}::${externalId}`
const decisionsLog: InternalReviewDecision[] = [];

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function canonicalize(val: unknown): string {
  if (val === null || typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) return `[${val.map(canonicalize).join(',')}]`;
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
}

function initialStatusForKind(kind: FindingKind): RecordReviewStatus {
  if (kind === 'draft') return 'Awaiting review';
  if (kind === 'funding') return 'Verify eligibility';
  return 'Needs analysis';
}

// Seed real primary-source Stardusk Uncrewed Orbital Lab Workstream 1 & Workstream 2 baseline records
function seedInitialOrbitalWorkstreams(): void {
  if (recordsByModuleKey.size > 0) return;
  const seeded: ResearchFindingInput[] = [
    {
      externalId: 'ws1-orbital-materials-bus-req-001',
      kind: 'requirement',
      title: 'Workstream 1: Uncrewed Free-Flyer Microgravity Materials & Hardware Testbed Envelope',
      summary:
        'Defines baseline mass, continuous payload power, microgravity vibration isolation, and Ka/Starlink LEO telemetry budgets for Stardusk Phase-1 uncrewed orbital payloads.',
      category: 'Orbital Lab System Architecture',
      researchedAt: '2026-11-26T18:00:00Z',
      sources: [
        {
          url: 'https://www.nasa.gov/smallsat-institute/sst-soa/',
          title: 'NASA State-of-the-Art of Small Spacecraft Technology Report',
          publishedAt: '2026-02-01T00:00:00Z',
        },
      ],
      evidence: 'Source-backed',
      assumptions: [
        'Stardusk is a proposed uncrewed orbital research laboratory business, not yet flight-operational.',
        'Initial payload sizing assumes hosted or ESPA-Grande class LEO free-flyer bus prior to custom station.',
      ],
      unresolvedQuestions: [
        'Does Phase-1 require capsule sample-return (re-entry) or purely in-situ optical/telemetry materials characterization?',
        'Target orbital inclination and radiation belt exposure profile for space hardware testing customers?',
      ],
      detail:
        'Prioritizes directional solidification / semiconductor crystal growth and TRL 5->7 space electronics radiation/thermal cycling with autonomous ground-to-orbit telemetry.',
    },
    {
      externalId: 'ws2-funding-nasa-sbir-nsf-001',
      kind: 'funding',
      title: 'Workstream 2: Non-Dilutive R&D Pipeline — NASA SBIR/STTR & NSF America Seed Fund',
      summary:
        'Verified primary U.S. federal non-dilutive R&D programs supporting commercial LEO microgravity instrumentation, autonomous payload operations, and space hardware qualification.',
      category: 'Grants & Non-Dilutive Funding',
      researchedAt: '2026-11-26T18:05:00Z',
      sources: [
        {
          url: 'https://sbir.nasa.gov/',
          title: 'NASA SBIR/STTR Program — Commercial Space & In-Space Production',
          publishedAt: null,
        },
        {
          url: 'https://seedfund.nsf.gov/',
          title: 'NSF Small Business Innovation Research (SBIR/STTR) Space & Advanced Materials',
          publishedAt: null,
        },
      ],
      evidence: 'Source-backed',
      assumptions: [
        'Provisional planning assumption: U.S. for-profit small business incorporation (<500 employees, >50% U.S.-owned); applicant entity status currently unverified.',
      ],
      unresolvedQuestions: [
        'Confirm U.S. incorporation state, SAM.gov UEI registration status, and Principal Investigator (PI) primary employment eligibility.',
        'Verify active solicitation release windows before drafting any formal pitch.',
      ],
      detail:
        'Internal research record only. Eligibility, active solicitation dates, and matching rules must be verified prior to any external submission.',
    },
  ];

  const now = new Date().toISOString();
  for (const f of seeded) {
    const canon = canonicalize(f);
    const key = `sovereign.research.orbital::${f.externalId}`;
    recordsByModuleKey.set(key, {
      ...f,
      recordId: `sdr-${sha256Hex(key).slice(0, 12)}`,
      moduleId: 'sovereign.research.orbital',
      canonicalPayloadJson: canon,
      payloadSha256: sha256Hex(canon),
      receivedAt: now,
      updatedAt: now,
      currentStatus: initialStatusForKind(f.kind),
    });
  }
}

seedInitialOrbitalWorkstreams();

function orpcError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    json: {
      code,
      status,
      message,
    },
  });
}

function verifyBearerSdkToken(
  req: Request,
  requiredScope: 'research:ingest' | 'decisions:read'
): HashedModuleCredential | null {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const rawToken = auth.slice(7).trim();
  if (!rawToken.startsWith('sdk_')) return null;

  // Support optional env-configured shared module token hash or plaintext for zero-downtime cloud boots
  const envToken = process.env.STARDUSK_MODULE_TOKEN;
  if (envToken && envToken.startsWith('sdk_') && rawToken.length === envToken.length) {
    const ok = crypto.timingSafeEqual(Buffer.from(rawToken), Buffer.from(envToken));
    if (ok) {
      return {
        credentialId: 'env-sdk-credential',
        label: 'Environment Scoped Module Token',
        tokenPrefix: rawToken.slice(0, 10),
        tokenSha256: sha256Hex(rawToken),
        scopes: ['research:ingest', 'decisions:read'],
        createdAt: new Date(0).toISOString(),
        expiresAt: new Date(Date.now() + 90 * 86400_000).toISOString(),
        revokedAt: null,
      };
    }
  }

  const candidateHash = sha256Hex(rawToken);
  const nowMs = Date.now();
  for (const cred of moduleCredentials) {
    if (cred.revokedAt) continue;
    if (Date.parse(cred.expiresAt) <= nowMs) continue;
    if (!cred.scopes.includes(requiredScope)) continue;
    const match = crypto.timingSafeEqual(
      Buffer.from(cred.tokenSha256, 'hex'),
      Buffer.from(candidateHash, 'hex')
    );
    if (match) return cred;
  }
  return null;
}

function validateFinding(raw: unknown): { ok: true; finding: ResearchFindingInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Each finding must be a JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (!ALLOWED_FINDING_KEYS.has(k)) {
      return { ok: false, error: `Extra field '${k}' rejected by strict v1.0 schema.` };
    }
  }
  for (const reqKey of ALLOWED_FINDING_KEYS) {
    if (!(reqKey in obj)) {
      return { ok: false, error: `Missing required field '${reqKey}'.` };
    }
  }

  const externalId = String(obj.externalId || '');
  if (!EXTERNAL_ID_RE.test(externalId)) {
    return { ok: false, error: `Invalid externalId '${externalId}'.` };
  }
  if (!['requirement', 'funding', 'draft'].includes(String(obj.kind))) {
    return { ok: false, error: 'kind must be requirement, funding, or draft.' };
  }
  if (!['Proposed', 'Source-backed', 'Unverified'].includes(String(obj.evidence))) {
    return { ok: false, error: 'evidence must be Proposed, Source-backed, or Unverified.' };
  }
  for (const strField of ['title', 'summary', 'category', 'detail'] as const) {
    if (typeof obj[strField] !== 'string' || !obj[strField].trim()) {
      return { ok: false, error: `Field '${strField}' must be a non-empty string.` };
    }
  }

  const researchedAtMs = Date.parse(String(obj.researchedAt));
  if (!Number.isFinite(researchedAtMs) || researchedAtMs > Date.now() + 5 * 60_000) {
    return { ok: false, error: 'researchedAt must be a valid UTC ISO datetime not materially in the future.' };
  }

  if (!Array.isArray(obj.sources) || obj.sources.length < 1 || obj.sources.length > 10) {
    return { ok: false, error: 'sources must contain 1 to 10 entries.' };
  }
  const sources: ResearchSource[] = [];
  for (const s of obj.sources) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      return { ok: false, error: 'Invalid source object.' };
    }
    const sObj = s as Record<string, unknown>;
    for (const sk of Object.keys(sObj)) {
      if (!ALLOWED_SOURCE_KEYS.has(sk)) {
        return { ok: false, error: `Extra source field '${sk}' rejected.` };
      }
    }
    const urlStr = String(sObj.url || '');
    if (!urlStr.startsWith('https://') && !urlStr.startsWith('http://')) {
      return { ok: false, error: `Source url '${urlStr}' must be HTTP(S).` };
    }
    if (typeof sObj.title !== 'string' || !sObj.title.trim()) {
      return { ok: false, error: 'Source title required.' };
    }
    if (sObj.publishedAt !== null && Number.isNaN(Date.parse(String(sObj.publishedAt)))) {
      return { ok: false, error: 'Source publishedAt must be UTC ISO string or null.' };
    }
    sources.push({
      url: urlStr,
      title: sObj.title,
      publishedAt: sObj.publishedAt === null ? null : String(sObj.publishedAt),
    });
  }

  for (const arrKey of ['assumptions', 'unresolvedQuestions'] as const) {
    const arr = obj[arrKey];
    if (!Array.isArray(arr) || arr.length > 20 || arr.some((x) => typeof x !== 'string')) {
      return { ok: false, error: `${arrKey} must be an array of up to 20 strings.` };
    }
  }

  return {
    ok: true,
    finding: {
      externalId,
      kind: obj.kind as FindingKind,
      title: obj.title as string,
      summary: obj.summary as string,
      category: obj.category as string,
      researchedAt: obj.researchedAt as string,
      sources,
      evidence: obj.evidence as EvidenceAssertion,
      assumptions: obj.assumptions as string[],
      unresolvedQuestions: obj.unresolvedQuestions as string[],
      detail: obj.detail as string,
    },
  };
}

export const starduskResearchBridgeRouter = express.Router();

// Public Contract Discovery (for Runable / Sovereign OS inspection on portal.aegentixcybernetics.com & stardusk.aegentixcybernetics.com)
starduskResearchBridgeRouter.get(['/', '/contract'], (_req: Request, res: Response) => {
  res.json({
    ok: true,
    contractName: 'Stardusk Research Bridge',
    schemaVersion: '1.0',
    zoneHomebase: 'https://aegentixcybernetics.com',
    portalOrigin: 'https://portal.aegentixcybernetics.com',
    starduskOrigin: 'https://stardusk.aegentixcybernetics.com',
    moduleIdDefault: 'sovereign.research.orbital',
    tokenPrefix: 'sdk_',
    tokenTtlDays: 90,
    scopes: ['research:ingest', 'decisions:read'],
    endpoints: {
      ingest: 'POST /api/rpc/research/ingest',
      decisions: 'POST /api/rpc/research/decisions',
      status: 'GET /api/rpc/research/state (studio session required)',
      mintToken: 'POST /api/rpc/research/tokens (studio operator session required; not called by the browser)',
      revokeToken: 'POST /api/rpc/research/tokens/revoke (studio operator session required)',
      ownerReview: 'POST /api/rpc/research/review (studio operator session required)',
      remoteSync: 'removed — set STARDUSK_ORIGIN and STARDUSK_MODULE_TOKEN for scripts/stardusk_bridge.py',
    },
    operatorAuth:
      'State, token, and review routes fail closed without a studio session. POST /api/auth/session/issue is locked unless Cloudflare Access sits in front of it.',
    envelopeFormat: '{"json": VALUE}',
    externalExecutionAuthorized: false,
    activeRecordCount: recordsByModuleKey.size,
    decisionCount: decisionsLog.length,
    timestamp: new Date().toISOString(),
  });
});

// State summary for Stardusk Control Center UI
starduskResearchBridgeRouter.get('/state', (req: Request, res: Response) => {
  if (!requireStudioSession(req, res)) return;
  res.json({
    ok: true,
    schemaVersion: '1.0',
    zone: 'aegentixcybernetics.com',
    records: Array.from(recordsByModuleKey.values()),
    decisions: decisionsLog.slice(0, 50),
    credentials: moduleCredentials.map((c) => ({
      credentialId: c.credentialId,
      label: c.label,
      tokenPrefix: c.tokenPrefix,
      scopes: c.scopes,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      revokedAt: c.revokedAt,
    })),
    exportBriefV1: {
      schemaVersion: '1.0',
      moduleId: 'sovereign.research.orbital',
      findings: Array.from(recordsByModuleKey.values()).map((r) => ({
        externalId: r.externalId,
        kind: r.kind,
        title: r.title,
        summary: r.summary,
        category: r.category,
        researchedAt: r.researchedAt,
        sources: r.sources,
        evidence: r.evidence,
        assumptions: r.assumptions,
        unresolvedQuestions: r.unresolvedQuestions,
        detail: r.detail,
      })),
    },
    nanotransactionLedger: getNanotransactionSnapshot(10),
    timestamp: new Date().toISOString(),
  });
});

// Mint scoped 90-day `sdk_...` module credential (plaintext returned ONCE; only SHA-256 hash stored)
starduskResearchBridgeRouter.post('/tokens', (req: Request, res: Response) => {
  if (!requireStudioSession(req, res, { write: true })) return;
  const body = (req.body || {}) as { label?: string };
  const rawToken = `sdk_${crypto.randomBytes(24).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 86400_000).toISOString();
  const credential: HashedModuleCredential = {
    credentialId: `cred-${crypto.randomBytes(4).toString('hex')}`,
    label: (body.label || 'Sovereign OS Orbital Research Module').trim(),
    tokenPrefix: rawToken.slice(0, 12),
    tokenSha256: sha256Hex(rawToken),
    scopes: ['research:ingest', 'decisions:read'],
    createdAt: now.toISOString(),
    expiresAt,
    revokedAt: null,
  };
  moduleCredentials.unshift(credential);

  res.json({
    ok: true,
    plaintextTokenShownOnce: rawToken,
    credential: {
      credentialId: credential.credentialId,
      label: credential.label,
      tokenPrefix: credential.tokenPrefix,
      scopes: credential.scopes,
      createdAt: credential.createdAt,
      expiresAt: credential.expiresAt,
    },
  });
});

starduskResearchBridgeRouter.post('/tokens/revoke', (req: Request, res: Response) => {
  if (!requireStudioSession(req, res, { write: true })) return;
  const { credentialId } = (req.body || {}) as { credentialId?: string };
  const found = moduleCredentials.find((c) => c.credentialId === credentialId);
  if (!found) {
    res.status(404).json({ ok: false, error: 'Credential not found' });
    return;
  }
  found.revokedAt = new Date().toISOString();
  res.json({ ok: true, credentialId: found.credentialId, revokedAt: found.revokedAt });
});

// Exact oRPC v1.0 Ingest Endpoint: POST /api/rpc/research/ingest
starduskResearchBridgeRouter.post('/ingest', (req: Request, res: Response) => {
  const cred = verifyBearerSdkToken(req, 'research:ingest');
  if (!cred) {
    orpcError(res, 401, 'UNAUTHORIZED', 'Valid Bearer sdk_ module token with research:ingest scope required.');
    return;
  }

  const envelope = req.body as { json?: unknown };
  if (!envelope || typeof envelope !== 'object' || !('json' in envelope)) {
    orpcError(res, 400, 'BAD_REQUEST', 'Expected oRPC envelope {"json": VALUE}.');
    return;
  }

  const val = envelope.json as Record<string, unknown>;
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    orpcError(res, 400, 'BAD_REQUEST', 'Envelope json value must be an object.');
    return;
  }
  for (const rk of Object.keys(val)) {
    if (!['schemaVersion', 'moduleId', 'findings'].includes(rk)) {
      orpcError(res, 400, 'STRICT_SCHEMA_VIOLATION', `Unexpected root key '${rk}'.`);
      return;
    }
  }
  if (val.schemaVersion !== '1.0') {
    orpcError(res, 400, 'UNSUPPORTED_SCHEMA', 'schemaVersion must be exactly "1.0".');
    return;
  }
  const moduleId = String(val.moduleId || '');
  if (!EXTERNAL_ID_RE.test(moduleId)) {
    orpcError(res, 400, 'INVALID_MODULE_ID', 'Invalid moduleId.');
    return;
  }
  if (!Array.isArray(val.findings) || val.findings.length < 1 || val.findings.length > 50) {
    orpcError(res, 400, 'INVALID_BATCH', 'findings must contain 1 to 50 items.');
    return;
  }

  // Validate entire batch atomically before mutating state
  const staged: Array<{
    key: string;
    duplicate: boolean;
    record: StoredResearchRecord;
  }> = [];
  const seenInBatch = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const item of val.findings) {
    const parsed = validateFinding(item);
    if (!parsed.ok) {
      orpcError(res, 400, 'VALIDATION_ERROR', parsed.error);
      return;
    }
    const f = parsed.finding;
    const key = `${moduleId}::${f.externalId}`;
    if (seenInBatch.has(key)) {
      orpcError(res, 409, 'DUPLICATE_IN_BATCH', `Duplicate externalId '${f.externalId}' in same batch.`);
      return;
    }
    seenInBatch.add(key);

    const canon = canonicalize(f);
    const existing = recordsByModuleKey.get(key);
    if (existing) {
      if (existing.canonicalPayloadJson === canon) {
        staged.push({ key, duplicate: true, record: existing });
        continue;
      } else {
        // Atomic rollback on mutated externalId per Stardusk v1.0 contract
        orpcError(
          res,
          409,
          'CONFLICT_EXTERNAL_ID',
          `externalId '${f.externalId}' already exists with different content; submit revisions under a new externalId.`
        );
        return;
      }
    }

    staged.push({
      key,
      duplicate: false,
      record: {
        ...f,
        recordId: `sdr-${sha256Hex(`${key}:${nowIso}`).slice(0, 12)}`,
        moduleId,
        canonicalPayloadJson: canon,
        payloadSha256: sha256Hex(canon),
        receivedAt: nowIso,
        updatedAt: nowIso,
        currentStatus: initialStatusForKind(f.kind),
      },
    });
  }

  const receiptsOut = staged.map((s) => {
    if (!s.duplicate) {
      recordsByModuleKey.set(s.key, s.record);
    }
    return {
      recordId: s.record.recordId,
      externalId: s.record.externalId,
      duplicate: s.duplicate,
      currentStatus: s.record.currentStatus,
      payloadSha256: s.record.payloadSha256,
      receivedAt: s.record.receivedAt,
    };
  });

  const insertedCount = staged.filter((s) => !s.duplicate).length;
  const nanoTx = emitEphemeralNanotransaction({
    ephemeralResourceId: `stardusk-ingest-${Date.now()}`,
    arena: 'STARDUSK_ORBITAL_RESEARCH_BRIDGE',
    actionType: 'RESEARCH_BRIEF_INGEST_V1',
    actorId: moduleId,
    computeUnits: 16 + insertedCount * 8,
    computeTimeMs: 14.6,
    chain: 'xrpl',
    contextPayload: { moduleId, insertedCount, totalBatch: staged.length },
  });

  res.status(200).json({
    json: {
      schemaVersion: '1.0',
      moduleId,
      insertedCount,
      duplicateCount: staged.length - insertedCount,
      receipts: receiptsOut,
      nanotransactionId: nanoTx.nanoTxId,
      coEarnedSov: nanoTx.totalRewardSov,
    },
  });
});

// Exact oRPC v1.0 Decision Readback Endpoint: POST /api/rpc/research/decisions
starduskResearchBridgeRouter.post('/decisions', (req: Request, res: Response) => {
  const cred = verifyBearerSdkToken(req, 'decisions:read');
  if (!cred) {
    orpcError(res, 401, 'UNAUTHORIZED', 'Valid Bearer sdk_ module token with decisions:read scope required.');
    return;
  }

  const envelope = req.body as { json?: unknown };
  if (!envelope || typeof envelope !== 'object' || !('json' in envelope)) {
    orpcError(res, 400, 'BAD_REQUEST', 'Expected oRPC envelope {"json": VALUE}.');
    return;
  }

  const val = (envelope.json || {}) as {
    moduleId?: string;
    limit?: number;
    cursor?: { createdAt: string; id: string } | null;
  };
  const moduleId = String(val.moduleId || '');
  if (!EXTERNAL_ID_RE.test(moduleId)) {
    orpcError(res, 400, 'INVALID_MODULE_ID', 'moduleId is required.');
    return;
  }
  const limit = Math.min(100, Math.max(1, Number(val.limit || 50)));

  let filtered = decisionsLog.filter((d) => d.moduleId === moduleId);
  if (val.cursor && val.cursor.createdAt && val.cursor.id) {
    const idx = filtered.findIndex(
      (d) => d.createdAt === val.cursor!.createdAt && d.id === val.cursor!.id
    );
    if (idx >= 0) {
      filtered = filtered.slice(idx + 1);
    }
  }

  const slice = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const last = slice[slice.length - 1];

  res.status(200).json({
    json: {
      schemaVersion: '1.0',
      moduleId,
      items: slice,
      hasMore,
      nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
      externalExecutionAuthorized: false,
      policy:
        'Approved internally records human review intent only and is never an authorization for spending, contracts, outreach, or physical commands. Always inspect currentStatus.',
    },
  });
});

// Owner Review Action (Approves internally or requests changes; editing resets status to Awaiting review)
starduskResearchBridgeRouter.post('/review', (req: Request, res: Response) => {
  if (!requireStudioSession(req, res, { write: true })) return;
  const body = (req.body || {}) as {
    moduleId?: string;
    externalId?: string;
    decision?: 'Approved internally' | 'Changes requested' | 'Needs analysis';
    rationale?: string;
    editedSummary?: string;
  };
  const moduleId = body.moduleId || 'sovereign.research.orbital';
  const key = `${moduleId}::${body.externalId || ''}`;
  const rec = recordsByModuleKey.get(key);
  if (!rec) {
    res.status(404).json({ ok: false, error: `Record '${key}' not found.` });
    return;
  }

  const nowIso = new Date().toISOString();
  if (typeof body.editedSummary === 'string' && body.editedSummary.trim() && body.editedSummary !== rec.summary) {
    rec.summary = body.editedSummary.trim();
    rec.currentStatus = 'Awaiting review'; // Editing a draft invalidates current approval per Stardusk spec
    rec.updatedAt = nowIso;
    res.json({ ok: true, resetToAwaitingReview: true, record: rec });
    return;
  }

  const decision = body.decision || 'Approved internally';
  rec.currentStatus = decision;
  rec.updatedAt = nowIso;

  const entry: InternalReviewDecision = {
    id: `dec-${crypto.randomBytes(5).toString('hex')}`,
    recordId: rec.recordId,
    moduleId: rec.moduleId,
    externalId: rec.externalId,
    decision,
    rationale: (body.rationale || 'Reviewed in Stardusk Sovereign Control Center.').trim(),
    createdAt: nowIso,
    currentStatus: rec.currentStatus,
    recordUpdatedAt: rec.updatedAt,
  };
  decisionsLog.push(entry);

  const nanoTx = emitEphemeralNanotransaction({
    ephemeralResourceId: entry.id,
    arena: 'STARDUSK_OWNER_DECISION_LEDGER',
    actionType: 'HUMAN_SUPERVISED_RESEARCH_REVIEW',
    actorId: 'STARDUSK-APPROVER',
    computeUnits: 12,
    computeTimeMs: 5.1,
    chain: 'xrpl',
  });

  res.json({ ok: true, decision: entry, record: rec, nanotransaction: nanoTx });
});

// Remote sync no longer accepts an origin or module token from the client.
// scripts/stardusk_bridge.py reads STARDUSK_ORIGIN and STARDUSK_MODULE_TOKEN
// from the server environment. This handler ignores the body.
starduskResearchBridgeRouter.all('/sync-remote', (req: Request, res: Response) => {
  if (!requireStudioSession(req, res, { write: true })) return;
  res.status(410).json({
    ok: false,
    error: 'SYNC_REMOTE_REMOVED',
    detail:
      'Remote sync does not accept a module token. Set STARDUSK_ORIGIN and STARDUSK_MODULE_TOKEN on the server and use scripts/stardusk_bridge.py.',
  });
});

export default starduskResearchBridgeRouter;
