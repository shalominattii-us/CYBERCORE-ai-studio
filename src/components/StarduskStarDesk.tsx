import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Shield } from 'lucide-react';

/**
 * Read-only Stardusk Star Desk. Renders under the live 3D avatar
 * (Anchor Desk) in OpenPlanterStudioSuite. Fetches GET /api/stardusk-desk/feed
 * with the operator session cookie. The module token never enters the
 * browser. Decisions are display-only and never trigger actions.
 */

interface DecisionCursor {
  createdAt: string;
  id: string;
}

interface DeskDecision {
  id?: string;
  recordId?: string;
  moduleId?: string;
  externalId?: string;
  title?: string;
  decision?: string;
  rationale?: string;
  createdAt?: string;
  currentStatus?: string;
  recordUpdatedAt?: string;
}

interface DeskFeed {
  ok: boolean;
  moduleId?: string;
  originHost?: string | null;
  source?: string;
  scope?: string;
  fetchedAt?: string;
  items?: DeskDecision[];
  nextCursor?: DecisionCursor | null;
  externalExecutionAuthorized?: boolean;
  error?: string;
  detail?: string;
}

function formatWhen(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function describeDeskError(error: string): string {
  if (
    error === 'MISSING_TOKEN' ||
    error === 'UNAUTHORIZED' ||
    error === 'MALFORMED_TOKEN' ||
    error === 'INVALID_SIGNATURE' ||
    error === 'TOKEN_EXPIRED' ||
    error === 'STUDIO_SESSION_REQUIRED' ||
    error === 'ORIGIN_NOT_ALLOWED'
  ) {
    return `${error}. Sign in through Cloudflare Access. The desk uses the operator session, not a module token in the browser.`;
  }
  if (error === 'DESK_NOT_CONFIGURED') {
    return 'The desk proxy is not configured. Set STARDUSK_ORIGIN and STARDUSK_DESK_TOKEN on the server. Do not paste a module token into the browser.';
  }
  return error;
}

export const StarduskStarDesk: React.FC = () => {
  const [feed, setFeed] = useState<DeskFeed | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = useCallback(async (cursor?: DecisionCursor | null, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', JSON.stringify(cursor));
      const query = params.toString();
      const res = await fetch(`/api/stardusk-desk/feed${query ? `?${query}` : ''}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = (await res.json()) as DeskFeed;
      if (!res.ok || !data.ok) {
        if (!append) setFeed(data);
        setError(describeDeskError(data.detail || data.error || `Desk feed failed (${res.status})`));
        return;
      }
      setFeed((prev) =>
        append && prev?.items ? { ...data, items: [...prev.items, ...(data.items || [])] } : data
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Desk feed failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const items = feed?.items || [];

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-900/80 p-3.5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-cyan-300 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">Stardusk Star Desk</h2>
            <p className="text-[11px] font-mono text-slate-400 truncate">
              Reviewed decisions · read-only · under the avatar
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadFeed()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono border border-slate-700 bg-slate-950 text-cyan-300 hover:border-cyan-400/50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <p className="text-[11px] text-slate-400">
        Display only. A decision never spends, contracts, outreaches, or commands anything.
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-slate-400">
        {feed?.originHost ? <span>origin {feed.originHost}</span> : null}
        {feed?.scope ? <span>{feed.scope}</span> : null}
        {feed?.moduleId ? <span>{feed.moduleId}</span> : null}
        {feed?.fetchedAt ? <span>{formatWhen(feed.fetchedAt)}</span> : null}
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      {!error && !loading && items.length === 0 ? (
        <p className="text-xs text-slate-400">
          No reviewed decisions yet. Pending findings appear here after the Protected Research Control Center records a decision.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto">
          {items.map((item, index) => (
            <li
              key={String(item.id || item.externalId || item.recordId || index)}
              className="rounded-lg border border-slate-700/80 bg-slate-950/80 p-2.5 flex flex-col gap-1"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-white min-w-0">
                  {item.title || item.externalId || 'Decision'}
                </p>
                {item.decision || item.currentStatus ? (
                  <span className="shrink-0 text-[10px] font-mono uppercase tracking-wide text-cyan-300">
                    {String(item.decision || item.currentStatus)}
                  </span>
                ) : null}
              </div>
              {item.externalId ? <p className="text-[11px] font-mono text-slate-500">{item.externalId}</p> : null}
              {item.rationale ? <p className="text-xs text-slate-300">{item.rationale}</p> : null}
              {item.createdAt ? (
                <p className="text-[10px] font-mono text-slate-500">{formatWhen(item.createdAt)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {feed?.nextCursor ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadFeed(feed.nextCursor, true)}
          className="self-start px-2 py-1 rounded text-[11px] font-mono border border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-400/50 disabled:opacity-50"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
};

export default StarduskStarDesk;
