import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Vault,
  AlertTriangle,
} from 'lucide-react';

type SubsystemStatus = 'OPERATIONAL' | 'PAUSED' | 'DEGRADED' | 'AUDITING';
type SubsystemCategory = 'TREASURY' | 'EXECUTION' | 'VERIFICATION' | 'INFRASTRUCTURE' | 'VOICE_AI';
type SubsystemAction = 'restart' | 'audit' | 'pause' | 'resume';
type KernelEventSeverity = 'INFO' | 'SUCCESS' | 'WARN';

interface SovereignSubsystem {
  id: string;
  name: string;
  tabId: string;
  category: SubsystemCategory;
  endpoint: string;
  status: SubsystemStatus;
  version: string;
  latencyMs: number;
  cpuPct: number;
  memoryMb: number;
  restarts: number;
  auditScore: number;
  treasuryBalanceUsd?: number;
  lastHeartbeat: string;
  lastAuditAt: string;
  description: string;
}

interface KernelOrchestrationEvent {
  id: string;
  timestamp: string;
  subsystemId: string;
  subsystemName: string;
  action: SubsystemAction | 'SYNC_SWEEP' | 'KERNEL_BOOT';
  severity: KernelEventSeverity;
  message: string;
}

interface SovereignOsStatusPayload {
  kernel: {
    name: string;
    version: string;
    buildHash: string;
    bootedAt: string;
    uptimeSec: number;
    nodeVersion: string;
    status: 'NOMINAL' | 'DEGRADED';
  };
  reticulum: {
    peerCount: number;
    activeRelays: number;
    avgRttMs: number;
    encryptionCipher: string;
    packetLossPct: number;
    meshStatus: 'SYNCED' | 'CONVERGING';
  };
  summary: {
    totalManagedUsd: number;
    operationalCount: number;
    pausedCount: number;
    degradedCount: number;
    totalSubsystems: number;
    avgAuditScore: number;
    syncSweepCount: number;
    lastFullSyncAt: string;
  };
  subsystems: SovereignSubsystem[];
  events: KernelOrchestrationEvent[];
}

export interface SovereignOsCommandSuiteProps {
  onNavigateTab?: (tabId: string) => void;
}

const CATEGORY_FILTERS: Array<'ALL' | SubsystemCategory> = [
  'ALL',
  'TREASURY',
  'EXECUTION',
  'VERIFICATION',
  'INFRASTRUCTURE',
  'VOICE_AI',
];

function formatUptime(totalSec: number): string {
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function statusBadgeStyle(status: SubsystemStatus): string {
  switch (status) {
    case 'OPERATIONAL':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    case 'PAUSED':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    case 'DEGRADED':
      return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    case 'AUDITING':
      return 'bg-sky-500/10 text-sky-300 border-sky-500/30';
  }
}

function severityBadgeStyle(severity: KernelEventSeverity): string {
  switch (severity) {
    case 'SUCCESS':
      return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
    case 'WARN':
      return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
    default:
      return 'text-sky-300 border-sky-500/30 bg-sky-500/10';
  }
}

export const SovereignOsCommandSuite: React.FC<SovereignOsCommandSuiteProps> = ({
  onNavigateTab,
}) => {
  const [data, setData] = useState<SovereignOsStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncingAll, setSyncingAll] = useState<boolean>(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | SubsystemCategory>('ALL');
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sovereign-os/status');
      if (!res.ok) {
        throw new Error(`Kernel status returned HTTP ${res.status}`);
      }
      const payload = (await res.json()) as SovereignOsStatusPayload;
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Sovereign OS Kernel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = window.setInterval(() => {
      void fetchStatus();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [fetchStatus]);

  const handleSubsystemAction = useCallback(
    async (subsystemId: string, action: SubsystemAction) => {
      const key = `${subsystemId}:${action}`;
      setBusyKey(key);
      try {
        const res = await fetch('/api/sovereign-os/subsystem/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subsystemId, action }),
        });
        if (!res.ok) {
          throw new Error(`Action '${action}' failed (HTTP ${res.status})`);
        }
        await fetchStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Subsystem action failed');
      } finally {
        setBusyKey(null);
      }
    },
    [fetchStatus],
  );

  const handleSyncAll = useCallback(async () => {
    setSyncingAll(true);
    try {
      const res = await fetch('/api/sovereign-os/sync-all', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`Sync sweep failed (HTTP ${res.status})`);
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Full sync sweep failed');
    } finally {
      setSyncingAll(false);
    }
  }, [fetchStatus]);

  const filteredSubsystems = useMemo(() => {
    if (!data) return [];
    if (selectedCategory === 'ALL') return data.subsystems;
    return data.subsystems.filter((sub) => sub.category === selectedCategory);
  }, [data, selectedCategory]);

  return (
    <div
      className="min-h-screen w-full bg-[#080B10] text-slate-100 p-4 md:p-6"
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Kernel Header */}
        <header className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 md:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Cpu className="h-4 w-4 text-cyan-400" />
              </div>
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-slate-100">
                SOVEREIGN OS KERNEL CONSOLE
              </h1>
              <span className="px-2 py-0.5 text-[11px] rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 tabular-nums">
                {data?.kernel.version ?? 'v4.8.2-quantum'}
              </span>
              <span className="px-2 py-0.5 text-[11px] rounded border border-slate-700 bg-slate-900 text-slate-300 tabular-nums">
                {data?.kernel.status ?? 'BOOTING'}
              </span>
            </div>
            <p className="text-xs text-slate-400 tabular-nums">
              Unified Multi-Treasury Orchestrator · Build {data?.kernel.buildHash ?? '--------'} · Uptime{' '}
              <span className="text-slate-200">
                {data ? formatUptime(data.kernel.uptimeSec) : '--:--:--'}
              </span>{' '}
              · Node {data?.kernel.nodeVersion ?? '--'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void fetchStatus()}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700/80 bg-[#080B10] text-slate-200 hover:border-slate-500 hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              type="button"
              disabled={syncingAll}
              onClick={() => void handleSyncAll()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
              {syncingAll ? 'Syncing All Subsystems...' : 'Sync All Treasuries & Subsystems'}
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-2.5 text-xs text-rose-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Telemetry & Multi-Treasury KPI Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider">
              <span>Managed Multi-Treasury</span>
              <Vault className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-semibold text-slate-100 tabular-nums">
              {data ? formatUsd(data.summary.totalManagedUsd) : '$0'}
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              Last sweep: {data ? formatShortTime(data.summary.lastFullSyncAt) : '--:--:--'} (#
              {data?.summary.syncSweepCount ?? 0})
            </div>
          </div>

          <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider">
              <span>Core Subsystems</span>
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <div className="text-xl font-semibold text-slate-100 tabular-nums">
              {data ? `${data.summary.operationalCount} / ${data.summary.totalSubsystems}` : '0 / 10'}
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              Paused: {data?.summary.pausedCount ?? 0} · Degraded: {data?.summary.degradedCount ?? 0}
            </div>
          </div>

          <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider">
              <span>Reticulum Mesh</span>
              <Radio className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <div className="text-xl font-semibold text-slate-100 tabular-nums">
              {data?.reticulum.peerCount ?? 0} Peers
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              Relays: {data?.reticulum.activeRelays ?? 0} · RTT {data?.reticulum.avgRttMs ?? 0}ms ·{' '}
              {data?.reticulum.meshStatus ?? 'SYNCED'}
            </div>
          </div>

          <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider">
              <span>Formal Audit Score</span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-semibold text-slate-100 tabular-nums">
              {data ? `${data.summary.avgAuditScore.toFixed(1)} / 100` : '-- / 100'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {data?.reticulum.encryptionCipher ?? 'X25519 + AES-256-GCM'}
            </div>
          </div>
        </section>

        {/* Category Filter Bar */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_FILTERS.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors cursor-pointer ${
                    active
                      ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                      : 'border-slate-800 bg-[#0D121B] text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-slate-400 tabular-nums">
            Showing {filteredSubsystems.length} of {data?.subsystems.length ?? 10} registered subsystems
          </div>
        </section>

        {/* 10-Subsystem Orchestration Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredSubsystems.map((sub) => {
            const isPaused = sub.status === 'PAUSED';
            const toggleAction: SubsystemAction = isPaused ? 'resume' : 'pause';

            return (
              <div
                key={sub.id}
                className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between gap-3.5 hover:border-slate-700 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-100">{sub.name}</h2>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          v{sub.version}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {sub.category} · {sub.endpoint}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 text-[10px] font-medium rounded border shrink-0 ${statusBadgeStyle(
                        sub.status,
                      )}`}
                    >
                      {sub.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{sub.description}</p>

                  <div className="grid grid-cols-4 gap-2 pt-1 text-[11px] tabular-nums">
                    <div className="bg-[#080B10] border border-slate-800/80 rounded-md px-2 py-1.5">
                      <div className="text-[10px] text-slate-500">LATENCY</div>
                      <div className="text-slate-200">{sub.latencyMs}ms</div>
                    </div>
                    <div className="bg-[#080B10] border border-slate-800/80 rounded-md px-2 py-1.5">
                      <div className="text-[10px] text-slate-500">AUDIT</div>
                      <div className="text-emerald-300">{sub.auditScore}/100</div>
                    </div>
                    <div className="bg-[#080B10] border border-slate-800/80 rounded-md px-2 py-1.5">
                      <div className="text-[10px] text-slate-500">CPU / MEM</div>
                      <div className="text-slate-200">
                        {sub.cpuPct.toFixed(0)}% · {sub.memoryMb}M
                      </div>
                    </div>
                    <div className="bg-[#080B10] border border-slate-800/80 rounded-md px-2 py-1.5">
                      <div className="text-[10px] text-slate-500">
                        {typeof sub.treasuryBalanceUsd === 'number' ? 'TREASURY' : 'HEARTBEAT'}
                      </div>
                      <div className="text-slate-200 truncate">
                        {typeof sub.treasuryBalanceUsd === 'number'
                          ? formatUsd(sub.treasuryBalanceUsd)
                          : formatShortTime(sub.lastHeartbeat)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1-Click Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busyKey === `${sub.id}:audit`}
                      onClick={() => void handleSubsystemAction(sub.id, 'audit')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border border-slate-700/80 bg-[#080B10] text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Audit
                    </button>

                    <button
                      type="button"
                      disabled={busyKey === `${sub.id}:restart`}
                      onClick={() => void handleSubsystemAction(sub.id, 'restart')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border border-slate-700/80 bg-[#080B10] text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restart
                    </button>

                    <button
                      type="button"
                      disabled={busyKey === `${sub.id}:${toggleAction}`}
                      onClick={() => void handleSubsystemAction(sub.id, toggleAction)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border border-slate-700/80 bg-[#080B10] text-slate-200 hover:border-amber-500/50 hover:text-amber-300 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                  </div>

                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab(sub.tabId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-colors cursor-pointer"
                    >
                      Open
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Kernel Orchestration Event Log */}
        <section className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-cyan-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Kernel Orchestration Event Log
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {data?.events.length ?? 0} recent events
            </span>
          </div>

          <div className="divide-y divide-slate-800/70 max-h-64 overflow-y-auto">
            {(data?.events ?? []).map((evt) => (
              <div
                key={evt.id}
                className="py-2 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-xs"
              >
                <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                  {formatShortTime(evt.timestamp)}
                </span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded border uppercase w-fit shrink-0 ${severityBadgeStyle(
                    evt.severity,
                  )}`}
                >
                  {evt.action}
                </span>
                <span className="text-slate-300 font-medium shrink-0">{evt.subsystemName}</span>
                <span className="text-slate-400">{evt.message}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SovereignOsCommandSuite;
