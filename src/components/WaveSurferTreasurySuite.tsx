import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  CheckCircle2,
  Flame,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Vault,
  Waves,
  Zap,
} from 'lucide-react';

interface SurfTierConfig {
  id: string;
  tierNumber: number;
  name: string;
  clearance: string;
  trancheUsd: number;
  maxWaveLegs: number;
  escrowReserveRatio: number;
  minStreak: number;
  description: string;
}

interface WaveLegExecution {
  id: string;
  timestamp: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  legSizeUsd: number;
  momentumScore: number;
  expectedValueBps: number;
  gateOutcome: 'POSITIVE_EV_EXECUTED' | 'MOMENTUM_REJECTED';
  realizedPnlUsd: number;
  escrowLockedUsd: number;
  tierAtExecution: string;
  streakAfter: number;
}

interface WaveSurferStatus {
  ok: boolean;
  engineVersion: string;
  activeTier: SurfTierConfig;
  clearance: string;
  currentStreak: number;
  bestStreak: number;
  activeWaveLegs: number;
  maxWaveLegs: number;
  treasury: {
    deployableTrancheUsd: number;
    escrowReserveUsd: number;
    escrowReserveRatio: number;
    lockedVaultProfitsUsd: number;
    cumulativeWavePnlUsd: number;
    unbondedOnChainBalanceUsd: number;
    lastRebalancedAt: string;
  };
  badgeProgress: {
    currentBadge: string;
    currentTierNumber: number;
    nextBadge: string | null;
    nextTierNumber: number | null;
    currentStreak: number;
    nextTierMinStreak: number | null;
    progressPct: number;
  };
  tiers: SurfTierConfig[];
  history: WaveLegExecution[];
}

const PAIRS = ['SOL/USDC', 'ETH/USDC', 'BTC/USDC', 'SUI/USDC'] as const;

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const WaveSurferTreasurySuite: React.FC = () => {
  const [status, setStatus] = useState<WaveSurferStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [riding, setRiding] = useState<boolean>(false);
  const [rebalancing, setRebalancing] = useState<boolean>(false);
  const [selectedPair, setSelectedPair] = useState<string>('SOL/USDC');
  const [selectedDirection, setSelectedDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/wave-surfer/status');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as WaveSurferStatus;
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Wave Surfer telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleRideWave = async () => {
    setRiding(true);
    setError(null);
    setBanner(null);
    try {
      const legSizeUsd = status
        ? Math.round((status.activeTier.trancheUsd / status.activeTier.maxWaveLegs) * 100) / 100
        : 125;
      const res = await fetch('/api/wave-surfer/wave/ride', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair: selectedPair,
          direction: selectedDirection,
          legSizeUsd,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as WaveSurferStatus & {
        execution?: WaveLegExecution;
        promoted?: boolean;
      };
      setStatus(data);
      if (data.promoted) {
        setBanner(`Tier Promoted: ${data.activeTier.name} (${data.clearance})`);
      } else if (data.execution) {
        setBanner(
          data.execution.gateOutcome === 'POSITIVE_EV_EXECUTED'
            ? `Executed ${data.execution.id} · ${data.execution.pair} ${data.execution.direction} (+${formatUsd(data.execution.realizedPnlUsd)})`
            : `Gate Hold ${data.execution.id} · Momentum below positive-EV threshold`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wave execution failed');
    } finally {
      setRiding(false);
    }
  };

  const handleRebalance = async () => {
    setRebalancing(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch('/api/wave-surfer/treasury/rebalance', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as WaveSurferStatus & {
        rebalanceSummary?: { lockedProfitDeltaUsd: number; targetEscrowUsd: number };
      };
      setStatus(data);
      if (data.rebalanceSummary) {
        setBanner(
          `Vault Rebalanced · Locked ${formatUsd(data.rebalanceSummary.lockedProfitDeltaUsd)} · Escrow synced to ${formatUsd(data.rebalanceSummary.targetEscrowUsd)}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Treasury rebalance failed');
    } finally {
      setRebalancing(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="min-h-[420px] bg-[#080B10] text-slate-200 p-6 flex items-center justify-center font-mono text-xs border border-slate-800/80 rounded-lg">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-cyan-400" />
        INITIALIZING WAVE SURFER &amp; VESSEL TREASURY TELEMETRY...
      </div>
    );
  }

  const activeTier = status?.activeTier;
  const treasury = status?.treasury;
  const badgeProgress = status?.badgeProgress;

  return (
    <div
      className="min-h-screen bg-[#080B10] text-slate-100 p-4 sm:p-6 space-y-5"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Top Institutional Header */}
      <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Waves className="w-4 h-4" />
            </div>
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">
              Wave Surfer &amp; Vessel Treasury
            </h1>
            {activeTier && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono tracking-wider uppercase">
                <Award className="w-3.5 h-3.5" />
                {activeTier.clearance}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Positive-EV momentum wave execution engine with segregated Vessel Treasury escrow reserves.
          </p>
        </div>

        {/* 1-Click Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Trading Pair"
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value)}
            className="bg-[#080B10] border border-slate-700/80 rounded px-2.5 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            {PAIRS.map((pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded border border-slate-700/80 overflow-hidden bg-[#080B10]">
            {(['LONG', 'SHORT'] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => setSelectedDirection(dir)}
                className={`px-2.5 py-2 text-[11px] font-mono font-medium transition-colors ${
                  selectedDirection === dir
                    ? dir === 'LONG'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleRideWave()}
            disabled={riding}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            {riding ? 'Riding...' : 'Ride Wave Leg'}
          </button>

          <button
            type="button"
            onClick={() => void handleRebalance()}
            disabled={rebalancing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#131A26] hover:bg-[#192233] border border-slate-700/80 disabled:opacity-50 text-slate-200 font-medium text-xs transition-colors cursor-pointer"
          >
            <Vault className="w-3.5 h-3.5 text-amber-400" />
            {rebalancing ? 'Rebalancing...' : 'Rebalance Escrow Vault'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-2.5 text-xs font-mono text-rose-300">
          ERROR: {error}
        </div>
      )}

      {banner && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2.5 text-xs font-mono text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{banner}</span>
        </div>
      )}

      {/* Primary KPI Grid */}
      {status && activeTier && treasury && badgeProgress && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Deployable Tranche */}
          <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Vessel Deployable Tranche</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-white">
              {formatUsd(treasury.deployableTrancheUsd)}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
              <span>{activeTier.name}</span>
              <span className="text-cyan-400">
                {status.activeWaveLegs}/{status.maxWaveLegs} LEGS
              </span>
            </div>
          </div>

          {/* 12% Escrow Reserve */}
          <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Locked Escrow Reserve ({Math.round(treasury.escrowReserveRatio * 100)}%)</span>
              <Lock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-amber-300">
              {formatUsd(treasury.escrowReserveUsd)}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
              <span>Vault Profits: {formatUsd(treasury.lockedVaultProfitsUsd)}</span>
              <span className="text-slate-500">ON-CHAIN: {formatUsd(treasury.unbondedOnChainBalanceUsd)}</span>
            </div>
          </div>

          {/* Live Streak Tracker */}
          <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Positive-EV Wave Streak</span>
              <Flame className="w-4 h-4 text-orange-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono tabular-nums text-white">
                {status.currentStreak}
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                / BEST {status.bestStreak}
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-300"
                  style={{ width: `${badgeProgress.progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
                <span>
                  {badgeProgress.nextBadge ? `Next: ${badgeProgress.nextBadge}` : 'MAX TIER UNLOCKED'}
                </span>
                <span>{badgeProgress.progressPct}%</span>
              </div>
            </div>
          </div>

          {/* Cumulative Wave PnL */}
          <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Cumulative Wave PnL</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-emerald-400">
              +{formatUsd(treasury.cumulativeWavePnlUsd)}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
              <span className="inline-flex items-center gap-1 text-emerald-400/90">
                <ShieldCheck className="w-3.5 h-3.5" />
                Segregated Vault
              </span>
              <span>Sync {formatTime(treasury.lastRebalancedAt)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Split: Tier 1-5 Progression Ladder + Live Wave Execution Ledger */}
      {status && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Tier 1-5 Progression Ladder */}
          <div className="xl:col-span-5 bg-[#0D121B] border border-slate-800/80 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-white">Tier 1–5 Progression Ladder</h2>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                STREAK {status.currentStreak}
              </span>
            </div>

            <div className="space-y-2">
              {status.tiers.map((tier) => {
                const isActive = tier.id === status.activeTier.id;
                const isUnlocked = status.currentStreak >= tier.minStreak;
                return (
                  <div
                    key={tier.id}
                    className={`rounded-md p-3 border transition-colors ${
                      isActive
                        ? 'bg-cyan-500/10 border-cyan-500/40'
                        : isUnlocked
                          ? 'bg-[#080B10]/80 border-slate-800/90'
                          : 'bg-[#080B10]/40 border-slate-800/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                            isActive
                              ? 'bg-cyan-500 text-slate-950 font-bold'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          T{tier.tierNumber}
                        </span>
                        <span className="text-xs font-semibold text-white">{tier.name}</span>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-cyan-300">
                        {formatUsd(tier.trancheUsd)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400">
                      <span>{tier.clearance}</span>
                      <span>
                        {tier.maxWaveLegs} legs · {Math.round(tier.escrowReserveRatio * 100)}% escrow · min streak {tier.minStreak}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Wave Execution Ledger */}
          <div className="xl:col-span-7 bg-[#0D121B] border border-slate-800/80 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Live Wave Execution Ledger</h2>
              </div>
              <button
                type="button"
                onClick={() => void fetchStatus()}
                className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-cyan-300 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                SYNC
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-[11px] font-mono uppercase text-slate-400">
                    <th className="py-2 pr-3">ID / Time</th>
                    <th className="py-2 pr-3">Pair</th>
                    <th className="py-2 pr-3">Size</th>
                    <th className="py-2 pr-3">Mom / EV</th>
                    <th className="py-2 pr-3">Escrow</th>
                    <th className="py-2 text-right">Wave PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                  {status.history.map((leg) => {
                    const isExecuted = leg.gateOutcome === 'POSITIVE_EV_EXECUTED';
                    return (
                      <tr key={leg.id} className="hover:bg-slate-800/20">
                        <td className="py-2.5 pr-3">
                          <div className="text-slate-200">{leg.id}</div>
                          <div className="text-[10px] text-slate-500">{formatTime(leg.timestamp)}</div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white">{leg.pair}</span>
                            <span
                              className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded ${
                                leg.direction === 'LONG'
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-rose-500/15 text-rose-300'
                              }`}
                            >
                              {leg.direction === 'LONG' ? (
                                <ArrowUpRight className="w-3 h-3 mr-0.5" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3 mr-0.5" />
                              )}
                              {leg.direction}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-200">{formatUsd(leg.legSizeUsd)}</td>
                        <td className="py-2.5 pr-3">
                          <span className={isExecuted ? 'text-cyan-300' : 'text-amber-400'}>
                            {leg.momentumScore}
                          </span>
                          <span className="text-slate-500"> / </span>
                          <span className={leg.expectedValueBps > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {leg.expectedValueBps > 0 ? `+${leg.expectedValueBps}` : leg.expectedValueBps}bps
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-amber-300">{formatUsd(leg.escrowLockedUsd)}</td>
                        <td className="py-2.5 text-right">
                          {isExecuted ? (
                            <span className="text-emerald-400">+{formatUsd(leg.realizedPnlUsd)}</span>
                          ) : (
                            <span className="text-slate-500">GATE HOLD</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaveSurferTreasurySuite;
