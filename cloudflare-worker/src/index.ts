interface R2BucketLike {
  list(options?: { limit?: number; prefix?: string }): Promise<{ objects: Array<{ key: string; size: number; uploaded: Date }> }>;
  get(key: string): Promise<{ body: ReadableStream | null; httpMetadata?: { contentType?: string } } | null>;
}

export interface Env {
  ORIGIN_URL: string;
  FALLBACK_ORIGIN_URL: string;
  MIN_POSITIVE_ALPHA_USD: string;
  EDGE_WORKER_VERSION?: string;
  EDGE_HMAC_SECRET?: string;
  AEGENTIX_ASSETS?: R2BucketLike;
}

interface CoinbaseSpotQuote {
  pair: string;
  base: string;
  quote: string;
  amount: number;
  source: 'coinbase-v2-live' | 'edge-fallback';
  fetchedAt: string;
}

const TRACKED_PAIRS: Array<{ pair: string; coinbaseSymbol: string; base: string; quote: string; fallbackPrice: number }> = [
  { pair: 'ETH/USDC', coinbaseSymbol: 'ETH-USD', base: 'ETH', quote: 'USDC', fallbackPrice: 3245.5 },
  { pair: 'BTC/USD', coinbaseSymbol: 'BTC-USD', base: 'BTC', quote: 'USD', fallbackPrice: 96420.0 },
  { pair: 'SOL/USD', coinbaseSymbol: 'SOL-USD', base: 'SOL', quote: 'USD', fallbackPrice: 214.8 },
  { pair: 'AERO/USDC', coinbaseSymbol: 'AERO-USD', base: 'AERO', quote: 'USDC', fallbackPrice: 1.48 },
  { pair: 'SUI/USDC', coinbaseSymbol: 'SUI-USD', base: 'SUI', quote: 'USDC', fallbackPrice: 3.92 },
];

const WORKER_TAG = 'aegentix-edge-worker/2.4.0';

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
  const bytes = new Uint8Array(sig);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as { data?: { amount?: string } };
        const parsed = Number.parseFloat(json?.data?.amount ?? '');
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error('Invalid Coinbase spot payload');
        }
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

async function proxyWithFailover(request: Request, env: Env, colo: string): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const origins = [env.ORIGIN_URL, env.FALLBACK_ORIGIN_URL].filter(Boolean);

  let lastError: string | null = null;

  for (let i = 0; i < origins.length; i++) {
    const originBase = origins[i].replace(/\/+$/, '');
    const targetUrl = `${originBase}${incomingUrl.pathname}${incomingUrl.search}`;

    try {
      const signedHeaders = await buildSignedHeaders(env, colo, request.method, incomingUrl.pathname, request.headers);
      signedHeaders.set('X-Forwarded-Host', incomingUrl.host);
      signedHeaders.set('X-Origin-Tier', i === 0 ? 'primary' : 'fallback');

      const init: RequestInit = {
        method: request.method,
        headers: signedHeaders,
        redirect: 'manual',
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
    },
    502,
    { 'X-Edge-Colo': colo }
  );
}

async function dispatchCronTick(env: Env, colo: string, triggerSource: 'cron' | 'manual'): Promise<Response> {
  const quotes = await fetchCoinbaseSpotQuotes();
  const minPositiveAlphaUsd = Number.parseFloat(env.MIN_POSITIVE_ALPHA_USD || '5.00');
  const origins = [env.ORIGIN_URL, env.FALLBACK_ORIGIN_URL].filter(Boolean);

  const payload = JSON.stringify({
    triggerSource,
    colo,
    minPositiveAlphaUsd: Number.isFinite(minPositiveAlphaUsd) ? minPositiveAlphaUsd : 5.0,
    quotes,
    dispatchedAt: new Date().toISOString(),
  });

  for (let i = 0; i < origins.length; i++) {
    const targetUrl = `${origins[i].replace(/\/+$/, '')}/api/edge-worker/cron-tick`;
    try {
      const signedHeaders = await buildSignedHeaders(env, colo, 'POST', '/api/edge-worker/cron-tick', {
        'content-type': 'application/json',
      });
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: signedHeaders,
        body: payload,
      });
      if (res.ok) {
        const data = await res.json();
        return jsonResponse({ ok: true, originTier: i === 0 ? 'primary' : 'fallback', colo, data });
      }
    } catch {
      // failover to next origin
    }
  }

  return jsonResponse({
    ok: false,
    colo,
    triggerSource,
    quotesCount: quotes.length,
    error: 'Origin cron-tick unreachable; quotes collected at edge',
  }, 502);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cf = (request as Request & { cf?: { colo?: string; country?: string } }).cf;
    const colo = cf?.colo || 'EDGE';

    if (url.pathname === '/edge/health') {
      const signedHeaders = await buildSignedHeaders(env, colo, 'GET', '/edge/health');
      return jsonResponse(
        {
          ok: true,
          service: 'aegentix-edge-worker',
          version: env.EDGE_WORKER_VERSION || WORKER_TAG,
          colo,
          country: cf?.country || 'US',
          originUrl: env.ORIGIN_URL,
          fallbackOriginUrl: env.FALLBACK_ORIGIN_URL,
          minPositiveAlphaUsd: Number.parseFloat(env.MIN_POSITIVE_ALPHA_USD || '5.00'),
          timestamp: new Date().toISOString(),
        },
        200,
        {
          'X-Edge-HMAC': signedHeaders.get('X-Edge-HMAC') || '',
          'X-Edge-Colo': colo,
        }
      );
    }

    if (url.pathname === '/edge/coinbase-spot') {
      const quotes = await fetchCoinbaseSpotQuotes();
      return jsonResponse({
        ok: true,
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
          'access-control-allow-origin': '*',
        },
      });
    }

    if (url.pathname === '/edge/championship-pulse') {
      const quotes = await fetchCoinbaseSpotQuotes();
      const targetUrl = `${(env.ORIGIN_URL || '').replace(/\/+$/, '')}/api/championship/status`;
      try {
        const signedHeaders = await buildSignedHeaders(env, colo, 'GET', '/api/championship/status');
        const res = await fetch(targetUrl, { headers: signedHeaders });
        const championship = res.ok ? await res.json() : null;
        return jsonResponse({
          ok: true,
          colo,
          quotes,
          championship,
          timestamp: new Date().toISOString(),
        });
      } catch {
        return jsonResponse({
          ok: true,
          colo,
          quotes,
          championship: null,
          note: 'Origin offline; serving edge spot telemetry',
          timestamp: new Date().toISOString(),
        });
      }
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
