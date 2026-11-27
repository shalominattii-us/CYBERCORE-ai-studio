interface R2ObjectBodyLike {
  body: ReadableStream | null;
  httpMetadata?: { contentType?: string };
  text(): Promise<string>;
}

interface R2BucketLike {
  list(options?: { limit?: number; prefix?: string }): Promise<{ objects: Array<{ key: string; size: number; uploaded: Date }> }>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

export interface Env {
  ZONE_NAME?: string;
  ORIGIN_URL: string;
  FALLBACK_ORIGIN_URL: string;
  STARLINK_EDGE_URL?: string;
  AEGENTIX_EDGE_API_URL?: string;
  RAILWAY_GATEWAY_URL?: string;
  MIN_POSITIVE_ALPHA_USD: string;
  OPERATOR_REWARD_SPLIT?: string;
  AI_AGENT_REWARD_SPLIT?: string;
  EDGE_WORKER_VERSION?: string;
  EDGE_HMAC_SECRET?: string;
  AEGENTIX_ASSETS?: R2BucketLike;
  TREASURY_VAULT?: R2BucketLike;
}

interface CoinbaseSpotQuote {
  pair: string;
  base: string;
  quote: string;
  amount: number;
  source: 'coinbase-v2-live' | 'edge-fallback';
  fetchedAt: string;
}

interface EdgeNanotransaction {
  nanoTxId: string;
  sequence: number;
  prevCausalHash: string;
  causalHash: string;
  hmacSignature: string;
  ephemeralResourceId: string;
  arena: string;
  actionType: string;
  actorId: string;
  chain: 'xrpl' | 'base' | 'solana';
  shard: number;
  computeUnits: number;
  computeTimeMs: number;
  rewardTier: 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'MASSIVE';
  totalRewardSov: number;
  operatorShareSov: number;
  aiAgentShareSov: number;
  integrityScore: number;
  trustLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: 'PENDING_BATCH' | 'SETTLED_R2_VES1';
  colo: string;
  timestamp: string;
}

interface EdgeNanoLedgerState {
  totalMintedSov: number;
  operatorEarnedSov: number;
  aiAgentEarnedSov: number;
  settledSov: number;
  settledBatchCount: number;
  receipts: EdgeNanotransaction[];
}

const TRACKED_PAIRS: Array<{ pair: string; coinbaseSymbol: string; base: string; quote: string; fallbackPrice: number }> = [
  { pair: 'ETH/USDC', coinbaseSymbol: 'ETH-USD', base: 'ETH', quote: 'USDC', fallbackPrice: 3245.5 },
  { pair: 'BTC/USD', coinbaseSymbol: 'BTC-USD', base: 'BTC', quote: 'USD', fallbackPrice: 96420.0 },
  { pair: 'SOL/USD', coinbaseSymbol: 'SOL-USD', base: 'SOL', quote: 'USD', fallbackPrice: 214.8 },
  { pair: 'AERO/USDC', coinbaseSymbol: 'AERO-USD', base: 'AERO', quote: 'USDC', fallbackPrice: 1.48 },
  { pair: 'SUI/USDC', coinbaseSymbol: 'SUI-USD', base: 'SUI', quote: 'USDC', fallbackPrice: 3.92 },
];

const WORKER_TAG = 'aegentix-cybercore-stardust/3.2.0-zone-nanotx';
const R2_NANO_LEDGER_KEY = 'nanotransactions/edge-sov-ledger.json';

// Edge isolate memory cache backed by Cloudflare R2 (world-monitor-treasury-vault)
let isolateNanoLedger: EdgeNanoLedgerState = {
  totalMintedSov: 0,
  operatorEarnedSov: 0,
  aiAgentEarnedSov: 0,
  settledSov: 0,
  settledBatchCount: 0,
  receipts: [],
};
let r2Hydrated = false;

const CLOUDFLARE_ZONE_ANCHORS = [
  { host: 'aegentixcybernetics.com', role: 'Apex Sovereign Machine Economy Homebase', status: 'LIVE_ANCHORED' },
  { host: 'portal.aegentixcybernetics.com', role: 'Sovereign OS & Stardusk Portal (Live Cloudflare Deployment)', status: 'LIVE_ANCHORED' },
  { host: 'studio.aegentixcybernetics.com', role: '3D Avatar Broadcast Studio & Vision-Coder Sandbox', status: 'LIVE_ANCHORED' },
  { host: 'edge.aegentixcybernetics.com', role: 'Aegentix Edge Core Runtime (v80.2.4 · 58 Endpoints)', status: 'LIVE_ANCHORED' },
  { host: 'api.aegentixcybernetics.com', role: 'Aegentix Edge API Gateway (v80.2.4)', status: 'LIVE_ANCHORED' },
  { host: 'starlink-edge.aegentixcybernetics.com', role: 'Starlink MCP JSON-RPC 2.0 & Dish Telemetry Edge', status: 'LIVE_ANCHORED' },
  { host: 'starlink-mcp.aegentixcybernetics.com', role: 'Cloudflare Access Zero-Trust Starlink Conduit', status: 'ACCESS_GATED' },
  { host: 'stardusk.aegentixcybernetics.com', role: 'Stardusk Space Company · LEO Orbital Station & Strategy Ecosystem', status: 'CUSTOM_DOMAIN_BOUND' },
  { host: 'cybercore.aegentixcybernetics.com', role: 'CYBERCORE AI Studio Full-Stack Flagship', status: 'CUSTOM_DOMAIN_BOUND' },
  { host: 'cockpit.aegentixcybernetics.com', role: 'Unified 3-in-1 StarNet Orbital Cockpit', status: 'CUSTOM_DOMAIN_BOUND' },
  { host: 'openplanter.aegentixcybernetics.com', role: 'OpenPlanter RLM Recursive VM Spawner & Live Avatar Broadcast', status: 'CUSTOM_DOMAIN_BOUND' },
  { host: 'nano.aegentixcybernetics.com', role: 'Ephemeral Nanotransaction & AI Store-of-Value Settlement Engine', status: 'CUSTOM_DOMAIN_BOUND' },
];

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, X-Edge-HMAC, X-Starlink-Token',
};

function roundSov(v: number): number {
  return Math.round(v * 1e8) / 1e8;
}

async function sha256Hex(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeEdgeHmac(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hydrateNanoLedgerFromR2(env: Env): Promise<void> {
  if (r2Hydrated || !env.TREASURY_VAULT) return;
  r2Hydrated = true;
  try {
    const obj = await env.TREASURY_VAULT.get(R2_NANO_LEDGER_KEY);
    if (obj) {
      const parsed = JSON.parse(await obj.text()) as EdgeNanoLedgerState;
      if (parsed && Array.isArray(parsed.receipts)) {
        isolateNanoLedger = parsed;
      }
    }
  } catch {
    // Keep zero-initialized isolate ledger
  }
}

async function persistNanoLedgerToR2(env: Env): Promise<boolean> {
  if (!env.TREASURY_VAULT) return false;
  try {
    await env.TREASURY_VAULT.put(R2_NANO_LEDGER_KEY, JSON.stringify(isolateNanoLedger, null, 2), {
      httpMetadata: { contentType: 'application/json' },
    });
    return true;
  } catch {
    return false;
  }
}

async function emitEdgeNanotransaction(
  env: Env,
  colo: string,
  params: {
    ephemeralResourceId: string;
    arena: string;
    actionType: string;
    actorId: string;
    computeUnits?: number;
    computeTimeMs?: number;
    chain?: 'xrpl' | 'base' | 'solana';
  }
): Promise<EdgeNanotransaction> {
  await hydrateNanoLedgerFromR2(env);
  const timestamp = new Date().toISOString();
  const chain = params.chain || 'xrpl';
  const shard = chain === 'xrpl' ? 151 : chain === 'solana' ? 160 : 84;
  const computeUnits = Math.max(1, Math.round(params.computeUnits ?? 14));
  const computeTimeMs = Math.max(0.5, Number(params.computeTimeMs ?? 19.2));
  const rewardTier =
    computeTimeMs < 1
      ? 'MICRO'
      : computeTimeMs < 10
        ? 'SMALL'
        : computeTimeMs < 100
          ? 'MEDIUM'
          : computeTimeMs < 1000
            ? 'LARGE'
            : 'MASSIVE';

  const baseRates = { MICRO: 0.00001, SMALL: 0.00005, MEDIUM: 0.00025, LARGE: 0.001, MASSIVE: 0.005 };
  const chainMult = chain === 'xrpl' ? 0.95 : chain === 'solana' ? 0.9 : 0.8;
  const shardBonus = shard === 151 ? 1.2 : 1.1;

  const actionHash = await sha256Hex(`${params.ephemeralResourceId}:${params.arena}:${params.actionType}:${params.actorId}:${timestamp}`);
  const integrityScore = Math.round((96.5 + (Number.parseInt(actionHash.slice(0, 2), 16) / 255) * 3.4) * 100) / 100;
  const trustCoeff = integrityScore / 100;
  const trustLevel = integrityScore >= 98 ? 'CRITICAL' : 'HIGH';

  const opSplit = Number.parseFloat(env.OPERATOR_REWARD_SPLIT || '0.70');
  const totalRewardSov = roundSov(Math.max(0.000001, baseRates[rewardTier] * computeUnits * chainMult * shardBonus * trustCoeff));
  const operatorShareSov = roundSov(totalRewardSov * (Number.isFinite(opSplit) ? opSplit : 0.7));
  const aiAgentShareSov = roundSov(totalRewardSov - operatorShareSov);

  const sequence = isolateNanoLedger.receipts.length + 1;
  const prevCausalHash = isolateNanoLedger.receipts[0]?.causalHash || '0'.repeat(64);
  const causalHash = await sha256Hex(`${prevCausalHash}:${sequence}:${actionHash}:${totalRewardSov}:${colo}`);
  const secret = env.EDGE_HMAC_SECRET || 'aegentix-championship-edge-hmac-v2';
  const hmacSignature = await computeEdgeHmac(secret, `${causalHash}:${operatorShareSov}:${aiAgentShareSov}`);

  const tx: EdgeNanotransaction = {
    nanoTxId: `edge-nano-${sequence}-${causalHash.slice(0, 10)}`,
    sequence,
    prevCausalHash,
    causalHash,
    hmacSignature,
    ephemeralResourceId: params.ephemeralResourceId,
    arena: params.arena,
    actionType: params.actionType,
    actorId: params.actorId,
    chain,
    shard,
    computeUnits,
    computeTimeMs,
    rewardTier,
    totalRewardSov,
    operatorShareSov,
    aiAgentShareSov,
    integrityScore,
    trustLevel,
    status: 'PENDING_BATCH',
    colo,
    timestamp,
  };

  isolateNanoLedger.receipts.unshift(tx);
  if (isolateNanoLedger.receipts.length > 150) isolateNanoLedger.receipts.length = 150;
  isolateNanoLedger.totalMintedSov = roundSov(isolateNanoLedger.totalMintedSov + totalRewardSov);
  isolateNanoLedger.operatorEarnedSov = roundSov(isolateNanoLedger.operatorEarnedSov + operatorShareSov);
  isolateNanoLedger.aiAgentEarnedSov = roundSov(isolateNanoLedger.aiAgentEarnedSov + aiAgentShareSov);

  await persistNanoLedgerToR2(env);
  return tx;
}

async function fetchCoinbaseSpotQuotes(): Promise<CoinbaseSpotQuote[]> {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.all(
    TRACKED_PAIRS.map(async (item): Promise<CoinbaseSpotQuote> => {
      try {
        const res = await fetch(`https://api.coinbase.com/v2/prices/${item.coinbaseSymbol}/spot`, {
          headers: {
            Accept: 'application/json',
            'User-Agent': WORKER_TAG,
          },
          cf: { cacheTtl: 5, cacheEverything: false },
        } as RequestInit);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: { amount?: string } };
        const parsed = Number.parseFloat(json?.data?.amount ?? '');
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Invalid Coinbase spot payload');
        return {
          pair: item.pair,
          base: item.base,
          quote: item.quote,
          amount: parsed,
          source: 'coinbase-v2-live',
          fetchedAt,
        };
      } catch {
        return {
          pair: item.pair,
          base: item.base,
          quote: item.quote,
          amount: item.fallbackPrice,
          source: 'edge-fallback',
          fetchedAt,
        };
      }
    })
  );
  return results;
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-aegentix-edge-worker': WORKER_TAG,
      'x-cloudflare-zone': 'aegentixcybernetics.com',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function buildSignedHeaders(
  env: Env,
  colo: string,
  method: string,
  pathname: string,
  baseHeaders?: HeadersInit
): Promise<Headers> {
  const headers = new Headers(baseHeaders);
  const timestamp = new Date().toISOString();
  const secret = env.EDGE_HMAC_SECRET || 'aegentix-championship-edge-hmac-v2';
  const signature = await computeEdgeHmac(secret, `${method}:${pathname}:${colo}:${timestamp}`);

  headers.set('X-Edge-HMAC', signature);
  headers.set('X-Edge-Colo', colo);
  headers.set('X-Edge-Timestamp', timestamp);
  headers.set('X-Aegentix-Edge-Worker', env.EDGE_WORKER_VERSION || WORKER_TAG);
  return headers;
}

async function callStarlinkMcpTool(env: Env, toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const base = (env.STARLINK_EDGE_URL || 'https://starlink-edge.aegentixcybernetics.com').replace(/\/+$/, '');
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`Starlink MCP HTTP ${res.status}`);
  const rpc = (await res.json()) as { result?: { content?: Array<{ text?: string }> } };
  const rawText = rpc?.result?.content?.[0]?.text;
  if (rawText) {
    try {
      return JSON.parse(rawText);
    } catch {
      return rawText;
    }
  }
  return rpc;
}

async function proxyWithFailover(request: Request, env: Env, colo: string): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const host = incomingUrl.hostname.toLowerCase();

  let effectivePath = incomingUrl.pathname;
  if (
    (host.startsWith('stardusk.') || host.startsWith('stardust.') || host.startsWith('cockpit.')) &&
    (effectivePath === '/' || effectivePath === '')
  ) {
    effectivePath = '/stardusk.html';
  }

  const origins = [env.ORIGIN_URL, env.FALLBACK_ORIGIN_URL].filter(Boolean);
  let lastError: string | null = null;

  for (let i = 0; i < origins.length; i++) {
    const originBase = origins[i].replace(/\/+$/, '');
    const targetUrl = `${originBase}${effectivePath}${incomingUrl.search}`;

    try {
      const signedHeaders = await buildSignedHeaders(env, colo, request.method, effectivePath, request.headers);
      signedHeaders.set('X-Forwarded-Host', incomingUrl.host);
      signedHeaders.set('X-Origin-Tier', i === 0 ? 'primary' : 'fallback');

      const init: RequestInit = {
        method: request.method,
        headers: signedHeaders,
        redirect: 'follow',
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = await request.clone().arrayBuffer();
      }

      const upstreamRes = await fetch(targetUrl, init);
      if (upstreamRes.status >= 502 && upstreamRes.status <= 504 && i < origins.length - 1) {
        lastError = `Primary origin returned HTTP ${upstreamRes.status}`;
        continue;
      }

      const responseHeaders = new Headers(upstreamRes.headers);
      responseHeaders.set('X-Edge-Colo', colo);
      responseHeaders.set('X-Cloudflare-Zone', env.ZONE_NAME || 'aegentixcybernetics.com');
      responseHeaders.set('X-Aegentix-Edge-Worker', env.EDGE_WORKER_VERSION || WORKER_TAG);
      responseHeaders.set('X-Origin-Served', i === 0 ? 'primary' : 'fallback');

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown upstream error';
    }
  }

  return jsonResponse(
    {
      ok: false,
      error: 'All configured origins unreachable',
      detail: lastError,
      colo,
      zone: env.ZONE_NAME || 'aegentixcybernetics.com',
    },
    502,
    { 'X-Edge-Colo': colo }
  );
}

async function dispatchCronTick(env: Env, colo: string, triggerSource: 'cron' | 'manual'): Promise<Response> {
  const t0 = Date.now();
  const quotes = await fetchCoinbaseSpotQuotes();
  const railwayUrl = (env.RAILWAY_GATEWAY_URL || 'https://aegentix-sovereign-gateway-production.up.railway.app').replace(/\/+$/, '');
  const starlinkUrl = (env.STARLINK_EDGE_URL || 'https://starlink-edge.aegentixcybernetics.com').replace(/\/+$/, '');

  const [railwaySync, starlinkHealth] = await Promise.allSettled([
    fetch(`${railwayUrl}/api/cloud-sync`).then((r) => (r.ok ? r.json() : null)),
    fetch(`${starlinkUrl}/health`).then((r) => (r.ok ? r.json() : null)),
  ]);

  const nanoTx = await emitEdgeNanotransaction(env, colo, {
    ephemeralResourceId: `cron-${triggerSource}-${Date.now()}`,
    arena: 'CLOUDFLARE_ZONE_CRON_SWEEP',
    actionType: 'AUTONOMOUS_EDGE_TELEMETRY_SWEEP',
    actorId: 'AEG-JARVIS-PRIME',
    computeUnits: 24,
    computeTimeMs: Math.max(1, Date.now() - t0),
    chain: 'xrpl',
  });

  return jsonResponse({
    ok: true,
    zone: env.ZONE_NAME || 'aegentixcybernetics.com',
    triggerSource,
    colo,
    quotesCount: quotes.length,
    quotes,
    nanotransaction: nanoTx,
    railwaySync: railwaySync.status === 'fulfilled' ? railwaySync.value : null,
    starlinkEdge: starlinkHealth.status === 'fulfilled' ? starlinkHealth.value : null,
    dispatchedAt: new Date().toISOString(),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const cf = (request as Request & { cf?: { colo?: string; country?: string; asn?: number } }).cf;
    const colo = cf?.colo || 'EDGE';

    // Native Cloudflare Worker Stardusk Research Bridge v1.0 (oRPC /api/rpc/research/* backed by R2)
    if (url.pathname === '/api/rpc/research' || url.pathname === '/api/rpc/research/contract') {
      return jsonResponse({
        ok: true,
        contractName: 'Stardusk Research Bridge',
        schemaVersion: '1.0',
        zoneHomebase: 'https://aegentixcybernetics.com',
        portalOrigin: 'https://portal.aegentixcybernetics.com',
        starduskOrigin: 'https://stardusk.aegentixcybernetics.com',
        moduleIdDefault: 'sovereign.research.orbital',
        tokenPrefix: 'sdk_',
        endpoints: {
          ingest: 'POST /api/rpc/research/ingest',
          decisions: 'POST /api/rpc/research/decisions',
        },
        envelopeFormat: '{"json": VALUE}',
        externalExecutionAuthorized: false,
        colo,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/rpc/research/ingest' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer sdk_')) {
        return jsonResponse({ json: { code: 'UNAUTHORIZED', status: 401, message: 'Bearer sdk_ module token required.' } }, 401);
      }
      const envBody = (await request.json().catch(() => null)) as { json?: { schemaVersion?: string; moduleId?: string; findings?: unknown[] } } | null;
      if (!envBody?.json || envBody.json.schemaVersion !== '1.0' || !Array.isArray(envBody.json.findings)) {
        return jsonResponse({ json: { code: 'BAD_REQUEST', status: 400, message: 'Expected {"json": {"schemaVersion": "1.0", "moduleId": "...", "findings": [...]}}' } }, 400);
      }
      const r2Key = `stardusk-research/${envBody.json.moduleId || 'sovereign.research.orbital'}/latest-brief.json`;
      if (env.TREASURY_VAULT) {
        await env.TREASURY_VAULT.put(r2Key, JSON.stringify(envBody.json, null, 2), {
          httpMetadata: { contentType: 'application/json' },
        });
      }
      const nanoTx = await emitEdgeNanotransaction(env, colo, {
        ephemeralResourceId: `stardusk-ingest-${Date.now()}`,
        arena: 'STARDUSK_ORBITAL_RESEARCH_EDGE',
        actionType: 'RESEARCH_BRIEF_INGEST_V1',
        actorId: String(envBody.json.moduleId || 'sovereign.research.orbital'),
        computeUnits: 20,
        computeTimeMs: 12.5,
        chain: 'xrpl',
      });
      return jsonResponse({
        json: {
          schemaVersion: '1.0',
          moduleId: envBody.json.moduleId || 'sovereign.research.orbital',
          insertedCount: envBody.json.findings.length,
          duplicateCount: 0,
          r2VaultKey: r2Key,
          nanotransactionId: nanoTx.nanoTxId,
          coEarnedSov: nanoTx.totalRewardSov,
        },
      });
    }

    if (url.pathname === '/api/rpc/research/decisions' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer sdk_')) {
        return jsonResponse({ json: { code: 'UNAUTHORIZED', status: 401, message: 'Bearer sdk_ module token required.' } }, 401);
      }
      const envBody = (await request.json().catch(() => null)) as { json?: { moduleId?: string } } | null;
      return jsonResponse({
        json: {
          schemaVersion: '1.0',
          moduleId: envBody?.json?.moduleId || 'sovereign.research.orbital',
          items: [],
          hasMore: false,
          nextCursor: null,
          externalExecutionAuthorized: false,
          policy: 'Approved internally records review intent only and never authorizes external execution.',
        },
      });
    }

    // Native Cloudflare Worker Nanotransaction & Store-of-Value Routes (also served on nano.aegentixcybernetics.com/)
    if (
      url.pathname === '/edge/nanotransactions/status' ||
      url.pathname === '/api/nanotransactions/status' ||
      (host.startsWith('nano.') && url.pathname === '/')
    ) {
      await hydrateNanoLedgerFromR2(env);
      return jsonResponse({
        ok: true,
        zone: env.ZONE_NAME || 'aegentixcybernetics.com',
        colo,
        r2VaultBound: Boolean(env.TREASURY_VAULT),
        zeroPreseedEnforced: true,
        unbondedFiatUsd: 0,
        operatorSplitRatio: 0.7,
        aiAgentSplitRatio: 0.3,
        ...isolateNanoLedger,
        timestamp: new Date().toISOString(),
      });
    }

    if (
      (url.pathname === '/edge/nanotransactions/emit' || url.pathname === '/api/nanotransactions/emit') &&
      request.method === 'POST'
    ) {
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {}
      const tx = await emitEdgeNanotransaction(env, colo, {
        ephemeralResourceId: String(body.ephemeralResourceId || `edge-eph-${Date.now()}`),
        arena: String(body.arena || 'CLOUDFLARE_EPHEMERAL_WORKER'),
        actionType: String(body.actionType || 'EPHEMERAL_EXECUTION'),
        actorId: String(body.actorId || 'AEGIS-PRIME'),
        computeUnits: Number(body.computeUnits || 16),
        computeTimeMs: Number(body.computeTimeMs || 15),
        chain: (body.chain as 'xrpl' | 'base' | 'solana') || 'xrpl',
      });
      return jsonResponse({
        ok: true,
        zone: env.ZONE_NAME || 'aegentixcybernetics.com',
        colo,
        nanotransaction: tx,
        ledger: isolateNanoLedger,
      });
    }

    if (
      (url.pathname === '/edge/nanotransactions/settle-batch' || url.pathname === '/api/nanotransactions/settle-batch') &&
      request.method === 'POST'
    ) {
      await hydrateNanoLedgerFromR2(env);
      const pending = isolateNanoLedger.receipts.filter((r) => r.status === 'PENDING_BATCH');
      const merkleRoot = await sha256Hex(pending.map((r) => r.causalHash).join(':') || 'EMPTY');
      for (const r of pending) r.status = 'SETTLED_R2_VES1';
      const batchAmount = roundSov(pending.reduce((s, r) => s + r.totalRewardSov, 0));
      isolateNanoLedger.settledSov = roundSov(isolateNanoLedger.settledSov + batchAmount);
      if (pending.length > 0) isolateNanoLedger.settledBatchCount += 1;

      const batchKey = `nanotransactions/batches/ves1-batch-${Date.now()}-${merkleRoot.slice(0, 8)}.json`;
      let persistedToR2 = false;
      if (env.TREASURY_VAULT && pending.length > 0) {
        try {
          await env.TREASURY_VAULT.put(
            batchKey,
            JSON.stringify({ batchKey, merkleRoot, count: pending.length, batchAmount, settledAt: new Date().toISOString() }, null, 2),
            { httpMetadata: { contentType: 'application/json' } }
          );
          persistedToR2 = await persistNanoLedgerToR2(env);
        } catch {}
      }

      return jsonResponse({
        ok: true,
        zone: env.ZONE_NAME || 'aegentixcybernetics.com',
        colo,
        settledCount: pending.length,
        batchAmountSov: batchAmount,
        ves1MerkleRoot: merkleRoot,
        r2ObjectKey: batchKey,
        persistedToR2,
        ledger: isolateNanoLedger,
      });
    }

    if (url.pathname === '/edge/health' || url.pathname === '/health') {
      await hydrateNanoLedgerFromR2(env);
      const signedHeaders = await buildSignedHeaders(env, colo, 'GET', url.pathname);
      return jsonResponse(
        {
          ok: true,
          service: 'aegentix-cybercore-stardust',
          version: env.EDGE_WORKER_VERSION || WORKER_TAG,
          zone: env.ZONE_NAME || 'aegentixcybernetics.com',
          colo,
          country: cf?.country || 'US',
          clientAsn: cf?.asn || null,
          starlinkUplinkDetected: cf?.asn === 14593,
          originUrl: env.ORIGIN_URL,
          starlinkEdgeUrl: env.STARLINK_EDGE_URL || 'https://starlink-edge.aegentixcybernetics.com',
          railwayGatewayUrl: env.RAILWAY_GATEWAY_URL || 'https://aegentix-sovereign-gateway-production.up.railway.app',
          nanotransactionSummary: {
            totalMintedSov: isolateNanoLedger.totalMintedSov,
            operatorEarnedSov: isolateNanoLedger.operatorEarnedSov,
            aiAgentEarnedSov: isolateNanoLedger.aiAgentEarnedSov,
            receiptCount: isolateNanoLedger.receipts.length,
          },
          zoneAnchors: CLOUDFLARE_ZONE_ANCHORS,
          timestamp: new Date().toISOString(),
        },
        200,
        {
          'X-Edge-HMAC': signedHeaders.get('X-Edge-HMAC') || '',
          'X-Edge-Colo': colo,
        }
      );
    }

    if (url.pathname === '/edge/zone-map') {
      return jsonResponse({
        ok: true,
        zone: env.ZONE_NAME || 'aegentixcybernetics.com',
        colo,
        anchors: CLOUDFLARE_ZONE_ANCHORS,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/edge/stardusk/overview' || url.pathname === '/edge/stardust/overview') {
      const t0 = Date.now();
      const railwayBase = (env.RAILWAY_GATEWAY_URL || 'https://aegentix-sovereign-gateway-production.up.railway.app').replace(/\/+$/, '');
      const [mesh, autonomy, starlink, r2, railway] = await Promise.allSettled([
        callStarlinkMcpTool(env, 'mesh_posture'),
        callStarlinkMcpTool(env, 'autonomy_status'),
        callStarlinkMcpTool(env, 'starlink_link_status'),
        callStarlinkMcpTool(env, 'r2_vault_status'),
        fetch(`${railwayBase}/api/cloud-sync`).then((r) => (r.ok ? r.json() : null)),
      ]);
      const nanoTx = await emitEdgeNanotransaction(env, colo, {
        ephemeralResourceId: `stardust-overview-${Date.now()}`,
        arena: 'STARDUST_EDGE_OVERVIEW',
        actionType: 'MULTI_SERVICE_BINDING_QUERY',
        actorId: 'NEXUS-ROUTER',
        computeUnits: 18,
        computeTimeMs: Math.max(1, Date.now() - t0),
        chain: 'xrpl',
      });
      return jsonResponse({
        ok: true,
        zone: env.ZONE_NAME || 'aegentixcybernetics.com',
        colo,
        starlinkAsnDetected: cf?.asn === 14593,
        meshPosture: mesh.status === 'fulfilled' ? mesh.value : null,
        autonomyStatus: autonomy.status === 'fulfilled' ? autonomy.value : null,
        starlinkStatus: starlink.status === 'fulfilled' ? starlink.value : null,
        r2VaultStatus: r2.status === 'fulfilled' ? r2.value : null,
        railwayCloudSync: railway.status === 'fulfilled' ? railway.value : null,
        nanotransaction: nanoTx,
        nanotransactionLedger: isolateNanoLedger,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/edge/coinbase-spot') {
      const quotes = await fetchCoinbaseSpotQuotes();
      return jsonResponse({
        ok: true,
        zone: env.ZONE_NAME || 'aegentixcybernetics.com',
        colo,
        source: 'coinbase-v2-public-spot',
        quotes,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/edge/r2/list') {
      if (!env.AEGENTIX_ASSETS) {
        return jsonResponse({ ok: false, error: 'R2 bucket AEGENTIX_ASSETS not bound', colo }, 503);
      }
      const prefix = url.searchParams.get('prefix') || undefined;
      const listed = await env.AEGENTIX_ASSETS.list({ limit: 100, prefix });
      return jsonResponse({
        ok: true,
        bucket: 'space-bunny-alpha',
        colo,
        count: listed.objects.length,
        objects: listed.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })),
      });
    }

    if (url.pathname.startsWith('/edge/r2/object/')) {
      if (!env.AEGENTIX_ASSETS) {
        return jsonResponse({ ok: false, error: 'R2 bucket AEGENTIX_ASSETS not bound', colo }, 503);
      }
      const key = decodeURIComponent(url.pathname.slice('/edge/r2/object/'.length));
      const obj = await env.AEGENTIX_ASSETS.get(key);
      if (!obj || !obj.body) {
        return jsonResponse({ ok: false, error: 'Object not found', key }, 404);
      }
      return new Response(obj.body, {
        status: 200,
        headers: {
          'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
          'x-edge-colo': colo,
          ...CORS_HEADERS,
        },
      });
    }

    if (url.pathname === '/edge/championship-pulse') {
      const quotes = await fetchCoinbaseSpotQuotes();
      return jsonResponse({
        ok: true,
        zone: env.ZONE_NAME || 'aegentixcybernetics.com',
        colo,
        quotes,
        championship: {
          rank: 1,
          verifiedBaseOnChainBalanceUsd: 0,
          zeroFakeBalanceEnforced: true,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/edge/trigger-alpha' && (request.method === 'POST' || request.method === 'GET')) {
      return dispatchCronTick(env, colo, 'manual');
    }

    return proxyWithFailover(request, env, colo);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(dispatchCronTick(env, 'CRON-EDGE', 'cron'));
  },
};
