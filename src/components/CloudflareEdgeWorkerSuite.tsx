import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Cloud,
  Code2,
  Copy,
  FileCode2,
  Globe,
  Play,
  Power,
  RefreshCw,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';

interface SpotQuote {
  pair: string;
  coinbaseSymbol: string;
  coinbaseSpot: number;
  baseDexPrice: number;
  spreadBps: number;
  spreadUsdPer10k: number;
  estimatedNetAlphaUsd: number;
  liquidityTier: 'DEEP' | 'HIGH' | 'MEDIUM';
  source: 'coinbase-v2-live' | 'synthetic-fallback';
  updatedAt: string;
}

interface ConnectedPortal {
  name: string;
  route: string;
  role: string;
  status: 'ACTIVE' | 'STANDBY';
  hmacSigned: boolean;
}

interface EdgeEvaluation {
  id: string;
  timestamp: string;
  pair: string;
  edgeColo: string;
  triggerSource: 'cron' | 'manual' | 'autopilot-15s';
  coinbaseSpot: number;
  baseDexPrice: number;
  spreadBps: number;
  notionalUsd: number;
  expectedNetAlphaUsd: number;
  minFloorUsd: number;
  decision: 'EXECUTED_POSITIVE' | 'VETOED_LOW_EDGE';
  reason: string;
  executionId?: string;
}

interface EdgeWorkerStatus {
  workerName: string;
  version: string;
  autopilotEnabled: boolean;
  minPositiveAlphaUsd: number;
  cronSchedule: string;
  lastCronTickAt: string | null;
  totalCronSweeps: number;
  totalExecutedPositive: number;
  totalVetoedLowEdge: number;
  originUrl: string;
  fallbackOriginUrl: string;
  activeColo: string;
  quotes: SpotQuote[];
  connectedPortals: ConnectedPortal[];
  evaluations: EdgeEvaluation[];
  workerSource: string;
  wranglerConfig: string;
}

const FLOOR_PRESETS = [5, 10, 20, 35];

export const CloudflareEdgeWorkerSuite: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [status, setStatus] = useState<EdgeWorkerStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sweeping, setSweeping] = useState<boolean>(false);
  const [updatingConfig, setUpdatingConfig] = useState<boolean>(false);
  const [evalFilter, setEvalFilter] = useState<'ALL' | 'EXECUTED_POSITIVE' | 'VETOED_LOW_EDGE'>('ALL');
  const [codeTab, setCodeTab] = useState<'worker' | 'wrangler'>('worker');
  const [copiedKey, setCopiedKey] = useState<'worker' | 'wrangler' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/edge-worker/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EdgeWorkerStatus;
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load edge worker telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 8000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const updateConfig = async (patch: { autopilotEnabled?: boolean; minPositiveAlphaUsd?: number }) => {
    setUpdatingConfig(true);
    try {
      const res = await fetch('/api/edge-worker/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { state?: EdgeWorkerStatus };
      if (data.state) setStatus(data.state);
      else await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update edge config');
    } finally {
      setUpdatingConfig(false);
    }
  };

  const triggerCronSweep = async () => {
    setSweeping(true);
    try {
      const res = await fetch('/api/edge-worker/cron-tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerSource: 'manual', colo: status?.activeColo || 'IAD' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { edgeWorker?: EdgeWorkerStatus };
      if (data.edgeWorker) setStatus(data.edgeWorker);
      else await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual edge sweep failed');
    } finally {
      setSweeping(false);
    }
  };

  const handleCopy = async (kind: 'worker' | 'wrangler') => {
    const text = kind === 'worker' ? status?.workerSource || '' : status?.wranglerConfig || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(kind);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const filteredEvaluations = (status?.evaluations || []).filter((ev) =>
    evalFilter === 'ALL' ? true : ev.decision === evalFilter
  );

  return (
    <div className={`${embedded ? '' : 'min-h-screen bg-[#080B10] p-4 sm:p-6'} text-slate-100 font-sans`}>
      <div className="max-w-[1480px] mx-auto space-y-5">
        {/* Top Control Bar */}
        <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                <Cloud className="w-4 h-4 text-amber-400" />
              </div>
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white">
                Cloudflare Edge Worker Control Plane
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                {status?.workerName || 'aegentix-edge-worker'}
              </span>
              <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700/80">
                COLO: {status?.activeColo || 'IAD'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              HMAC-SHA256 signed edge proxy with automatic origin failover, live Coinbase v2 spot oracle, and strict positive-EV Cron sweep.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Autopilot Toggle */}
            <button
              type="button"
              disabled={updatingConfig || !status}
              onClick={() => updateConfig({ autopilotEnabled: !status?.autopilotEnabled })}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                status?.autopilotEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              Autopilot: {status?.autopilotEnabled ? 'ON (15s)' : 'OFF'}
            </button>

            {/* Min Positive Profit Floor */}
            <div className="flex items-center bg-[#080B10] border border-slate-800 rounded-lg p-0.5">
              <span className="px-2 text-[11px] text-slate-400 font-medium">Min Floor:</span>
              {FLOOR_PRESETS.map((floor) => {
                const active = status?.minPositiveAlphaUsd === floor;
                return (
                  <button
                    key={floor}
                    type="button"
                    disabled={updatingConfig}
                    onClick={() => updateConfig({ minPositiveAlphaUsd: floor })}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    +${floor}
                  </button>
                );
              })}
            </div>

            {/* Force Edge Cron Sweep */}
            <button
              type="button"
              disabled={sweeping}
              onClick={triggerCronSweep}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-60"
            >
              {sweeping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {sweeping ? 'Sweeping Edge...' : 'Force Edge Cron Sweep'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-2.5 text-xs text-rose-300">
            Edge telemetry warning: {error}
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Cron Sweeps</div>
            <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-white">
              {status?.totalCronSweeps ?? '—'}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 font-mono">
              Schedule: {status?.cronSchedule || '* * * * *'}
            </div>
          </div>

          <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Executed Positive</div>
            <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-emerald-400">
              {status?.totalExecutedPositive ?? '—'}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Strictly above +${(status?.minPositiveAlphaUsd ?? 5).toFixed(2)} net floor
            </div>
          </div>

          <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Vetoed Low Edge</div>
            <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-amber-400">
              {status?.totalVetoedLowEdge ?? '—'}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Protected Sharpe against fee drag
            </div>
          </div>

          <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Last Edge Sweep</div>
            <div className="mt-1 text-lg font-mono font-semibold tabular-nums text-cyan-300">
              {status?.lastCronTickAt ? new Date(status.lastCronTickAt).toLocaleTimeString() : '—'}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              HMAC-SHA256 Verified
            </div>
          </div>
        </div>

        {/* Live Coinbase Spot Quotes + Connected Portals */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Live Coinbase Spot Quotes */}
          <div className="xl:col-span-7 bg-[#0D121B] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Live Coinbase v2 Spot Quotes & Base L2 Spreads
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {loading ? 'Syncing...' : `${status?.quotes.length || 0} Pairs Active`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4 font-medium">Pair</th>
                    <th className="py-2.5 px-3 font-medium text-right">Coinbase Spot</th>
                    <th className="py-2.5 px-3 font-medium text-right">Base DEX</th>
                    <th className="py-2.5 px-3 font-medium text-right">Spread</th>
                    <th className="py-2.5 px-3 font-medium text-right">Est. Net Alpha</th>
                    <th className="py-2.5 px-4 font-medium text-right">Feed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                  {(status?.quotes || []).map((q) => (
                    <tr key={q.pair} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-white">{q.pair}</td>
                      <td className="py-2.5 px-3 text-right text-slate-200">
                        ${q.coinbaseSpot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        ${q.baseDexPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>
                      <td className="py-2.5 px-3 text-right text-cyan-300">{q.spreadBps.toFixed(1)} bps</td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          q.estimatedNetAlphaUsd >= (status?.minPositiveAlphaUsd ?? 5)
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {q.estimatedNetAlphaUsd >= 0 ? '+' : ''}${q.estimatedNetAlphaUsd.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            q.source === 'coinbase-v2-live'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {q.source === 'coinbase-v2-live' ? 'LIVE' : 'FALLBACK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Connected Cloudflare Portals */}
          <div className="xl:col-span-5 bg-[#0D121B] border border-slate-800/80 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Connected Cloudflare Portals & Routes
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400">FAILOVER READY</span>
            </div>
            <div className="p-3 space-y-2 flex-1">
              {(status?.connectedPortals || []).map((portal) => (
                <div
                  key={portal.route}
                  className="bg-[#080B10] border border-slate-800/80 rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">{portal.name}</span>
                      {portal.hmacSigned && (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                          HMAC-SHA256
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">{portal.route}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{portal.role}</div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                    {portal.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Real-Time Positive-EV Evaluation Log */}
        <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Real-Time Positive-EV Filter Log (EXECUTED_POSITIVE vs VETOED_LOW_EDGE)
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              {(['ALL', 'EXECUTED_POSITIVE', 'VETOED_LOW_EDGE'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setEvalFilter(f)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                    evalFilter === f
                      ? 'bg-slate-700 text-white'
                      : 'bg-[#080B10] text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#0D121B] z-10">
                <tr className="border-b border-slate-800/80 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 px-4 font-medium">Time</th>
                  <th className="py-2 px-3 font-medium">Pair</th>
                  <th className="py-2 px-3 font-medium">Colo</th>
                  <th className="py-2 px-3 font-medium text-right">Spread</th>
                  <th className="py-2 px-3 font-medium text-right">Expected Net</th>
                  <th className="py-2 px-3 font-medium">Decision</th>
                  <th className="py-2 px-4 font-medium">Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                {filteredEvaluations.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-900/50">
                    <td className="py-2 px-4 text-slate-400">{new Date(ev.timestamp).toLocaleTimeString()}</td>
                    <td className="py-2 px-3 text-white font-semibold">{ev.pair}</td>
                    <td className="py-2 px-3 text-slate-400">{ev.edgeColo}</td>
                    <td className="py-2 px-3 text-right text-cyan-300">{ev.spreadBps.toFixed(1)} bps</td>
                    <td
                      className={`py-2 px-3 text-right font-semibold ${
                        ev.expectedNetAlphaUsd >= ev.minFloorUsd ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {ev.expectedNetAlphaUsd >= 0 ? '+' : ''}${ev.expectedNetAlphaUsd.toFixed(2)}
                    </td>
                    <td className="py-2 px-3">
                      {ev.decision === 'EXECUTED_POSITIVE' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          EXECUTED_POSITIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/25">
                          <XCircle className="w-3 h-3" />
                          VETOED_LOW_EDGE
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">{ev.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inspect / Copy Worker Source & Wrangler Config */}
        <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Edge Worker Deployment Artifacts
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-[#080B10] border border-slate-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setCodeTab('worker')}
                  className={`px-3 py-1 rounded text-xs font-mono cursor-pointer ${
                    codeTab === 'worker' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  cloudflare-worker/src/index.ts
                </button>
                <button
                  type="button"
                  onClick={() => setCodeTab('wrangler')}
                  className={`px-3 py-1 rounded text-xs font-mono cursor-pointer ${
                    codeTab === 'wrangler' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  cloudflare-worker/wrangler.toml
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(codeTab)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                {copiedKey === codeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="p-4 bg-[#080B10] overflow-x-auto max-h-80 overflow-y-auto">
            <pre className="text-[11px] leading-relaxed font-mono text-slate-300 whitespace-pre">
              {codeTab === 'worker'
                ? status?.workerSource || '// Loading cloudflare-worker/src/index.ts...'
                : status?.wranglerConfig || '# Loading cloudflare-worker/wrangler.toml...'}
            </pre>
          </div>
          <div className="px-4 py-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span className="inline-flex items-center gap-1.5">
              <FileCode2 className="w-3.5 h-3.5 text-slate-400" />
              Origin: {status?.originUrl || 'https://studio-origin.aegentixcybernetics.com'}
            </span>
            <span>Fallback: {status?.fallbackOriginUrl || 'https://cybercore-ai-studio.onrender.com'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudflareEdgeWorkerSuite;
