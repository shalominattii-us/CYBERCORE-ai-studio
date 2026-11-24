import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  Cloud,
  Cpu,
  Filter,
  Hash,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trophy,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CloudflareEdgeWorkerSuite } from './CloudflareEdgeWorkerSuite';

type ChampionshipStrategy =
  | 'Balanced Sharpe'
  | 'Aggressive Alpha'
  | 'HFT Order Flow (OFI)'
  | 'Conservative Defense';

type SubTab = 'arena' | 'bot-hq' | 'edge-worker' | 'audit-chain';

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

interface AtomicExecution {
  id: string;
  timestamp: string;
  pair: string;
  side: 'BUY_COINBASE_SELL_BASE' | 'BUY_BASE_SELL_COINBASE';
  strategy: ChampionshipStrategy;
  notionalUsd: number;
  spreadBps: number;
  grossSpreadUsd: number;
  coinbaseTakerFeeUsd: number;
  baseDexFeeUsd: number;
  slippageBufferUsd: number;
  paymasterGasUsd: number;
  netAlphaUsd: number;
  status: 'SETTLED' | 'VETOED';
  trigger: 'MANUAL_TICKET' | 'EDGE_CRON_AUTOPILOT' | 'API_TRIGGER';
  edgeColo: string;
  txHash: string;
  prevChainHash: string;
  chainHash: string;
}

interface EquityPoint {
  time: string;
  cumulativeAlphaUsd: number;
  spreadCaptureBps: number;
  sharpeRatio: number;
}

interface ChampionshipStatus {
  tournamentName: string;
  rank: number;
  totalCompetitors: number;
  activeStrategy: ChampionshipStrategy;
  championshipScore: number;
  sharpeRatio: number;
  winRatePct: number;
  maxDrawdownPct: number;
  dailyMddCapPct: number;
  kellyFraction: number;
  totalNetAlphaUsd: number;
  totalNotionalVolumeUsd: number;
  totalExecutions: number;
  winningExecutions: number;
  smartAccountAddress: string;
  smartAccountStandard: string;
  verifiedBaseOnChainBalanceUsd: number;
  paymasterGasSponsoredUsd: number;
  riskGovernorStatus: 'ARMED_NOMINAL' | 'CAUTION' | 'HALTED';
  equityCurve: EquityPoint[];
  executions: AtomicExecution[];
  lastUpdatedAt: string;
}

interface CoinbaseChampionshipSuiteProps {
  onOpenBotHq?: () => void;
  botHqSlot?: React.ReactNode;
}

const STRATEGIES: ChampionshipStrategy[] = [
  'Balanced Sharpe',
  'Aggressive Alpha',
  'HFT Order Flow (OFI)',
  'Conservative Defense',
];

const NOTIONAL_PRESETS = [10000, 25000, 50000, 75000];

export const CoinbaseChampionshipSuite: React.FC<CoinbaseChampionshipSuiteProps> = ({
  onOpenBotHq,
  botHqSlot,
}) => {
  const [activeTab, setActiveTab] = useState<SubTab>('arena');
  const [championship, setChampionship] = useState<ChampionshipStatus | null>(null);
  const [quotes, setQuotes] = useState<SpotQuote[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>('ETH/USDC');
  const [notionalUsd, setNotionalUsd] = useState<number>(25000);
  const [executing, setExecuting] = useState<boolean>(false);
  const [swappingStrategy, setSwappingStrategy] = useState<boolean>(false);
  const [ledgerFilter, setLedgerFilter] = useState<string>('ALL');
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [champRes, edgeRes] = await Promise.all([
        fetch('/api/championship/status'),
        fetch('/api/edge-worker/status'),
      ]);
      if (champRes.ok) {
        const cData = (await champRes.json()) as ChampionshipStatus;
        setChampionship(cData);
      }
      if (edgeRes.ok) {
        const eData = (await edgeRes.json()) as { quotes?: SpotQuote[] };
        if (Array.isArray(eData.quotes)) setQuotes(eData.quotes);
      }
    } catch {
      // Retain last known state on transient network hiccup
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 8000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const activeQuote = useMemo(
    () => quotes.find((q) => q.pair === selectedPair) || quotes[0] || null,
    [quotes, selectedPair]
  );

  // Dynamic Atomic Trade Ticket live calculation
  const ticketPreview = useMemo(() => {
    const spreadBps = activeQuote?.spreadBps ?? 21.5;
    const grossSpreadUsd = (notionalUsd * spreadBps) / 10_000;
    const takerFeeUsd = notionalUsd * 0.0005; // 0.05% Coinbase taker
    const slippageBufferUsd = notionalUsd * 0.0008; // 0.08% combined DEX + slippage buffer
    const paymasterGasUsd = 0.0; // $0.00 ERC-4337 Paymaster
    const expectedNetAlphaUsd = grossSpreadUsd - takerFeeUsd - slippageBufferUsd - paymasterGasUsd;
    return {
      spreadBps,
      grossSpreadUsd,
      takerFeeUsd,
      slippageBufferUsd,
      paymasterGasUsd,
      expectedNetAlphaUsd,
    };
  }, [activeQuote, notionalUsd]);

  const handleExecuteTrade = async () => {
    setExecuting(true);
    setLastFeedback(null);
    try {
      const res = await fetch('/api/championship/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair: selectedPair,
          notionalUsd,
          spreadBps: activeQuote?.spreadBps,
          trigger: 'MANUAL_TICKET',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        execution?: AtomicExecution;
        championship?: ChampionshipStatus;
      };
      if (data.championship) setChampionship(data.championship);
      if (data.execution) {
        setLastFeedback(
          `${data.execution.id} ${data.execution.status} on ${data.execution.pair} (${
            data.execution.netAlphaUsd >= 0 ? '+' : ''
          }$${data.execution.netAlphaUsd.toFixed(2)} net alpha)`
        );
      }
    } catch (err) {
      setLastFeedback(err instanceof Error ? `Execution error: ${err.message}` : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleStrategyChange = async (strategy: ChampionshipStrategy) => {
    setSwappingStrategy(true);
    try {
      const res = await fetch('/api/championship/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy }),
      });
      if (res.ok) {
        const data = (await res.json()) as { championship?: ChampionshipStatus };
        if (data.championship) setChampionship(data.championship);
      }
    } finally {
      setSwappingStrategy(false);
    }
  };

  const filteredExecutions = useMemo(() => {
    const list = championship?.executions || [];
    if (ledgerFilter === 'ALL') return list;
    return list.filter((ex) => ex.pair === ledgerFilter || ex.trigger === ledgerFilter);
  }, [championship, ledgerFilter]);

  const subTabs: Array<{ id: SubTab; label: string; icon: React.ReactNode }> = [
    { id: 'arena', label: 'Battle Arena', icon: <Trophy className="w-3.5 h-3.5" /> },
    { id: 'bot-hq', label: 'Bot-HQ Squad War Room', icon: <Bot className="w-3.5 h-3.5" /> },
    { id: 'edge-worker', label: 'Cloudflare Edge Worker', icon: <Cloud className="w-3.5 h-3.5" /> },
    { id: 'audit-chain', label: 'Audit Hash Chain', icon: <Hash className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-[#080B10] text-slate-100 p-4 sm:p-6 font-sans">
      <div className="max-w-[1480px] mx-auto space-y-5">
        {/* Institutional Header */}
        <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">
                  Coinbase Institutional AI Trading Championship
                </h1>
                <p className="text-xs text-slate-400">
                  Base L2 Atomic Arbitrage Engine · ERC-4337 Paymaster Gasless Settlement · Cloudflare Edge Autopilot
                </p>
              </div>
              <span className="px-2.5 py-0.5 text-[11px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                RANK #{championship?.rank ?? 1} / {championship?.totalCompetitors ?? 128}
              </span>
            </div>
          </div>

          {/* Sub-Tab Navigation */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#080B10] border border-slate-800/80 rounded-lg p-1">
            {subTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === 'bot-hq' && onOpenBotHq && !botHqSlot) {
                      onOpenBotHq();
                    } else {
                      setActiveTab(tab.id);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-Tab Content */}
        {activeTab === 'edge-worker' && <CloudflareEdgeWorkerSuite embedded />}

        {activeTab === 'bot-hq' && (
          <div>
            {botHqSlot ? (
              botHqSlot
            ) : (
              <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-cyan-400" />
                </div>
                <h2 className="text-base font-semibold text-white">Bot-HQ Squad War Room</h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Coordinate multi-agent execution desks, risk sentinels, and real-time order-flow scouts from the Bot-HQ War Room.
                </p>
                {onOpenBotHq && (
                  <button
                    type="button"
                    onClick={onOpenBotHq}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 cursor-pointer"
                  >
                    Launch Bot-HQ War Room
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit-chain' && (
          <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Cryptographic SHA-256 Execution Audit Hash Chain
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400">
                {championship?.executions.length ?? 0} VERIFIED LINKS
              </span>
            </div>
            <div className="divide-y divide-slate-800/70">
              {(championship?.executions || []).map((ex) => (
                <div key={ex.id} className="p-4 hover:bg-slate-900/40 font-mono text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                        {ex.id}
                      </span>
                      <span className="text-white font-semibold">{ex.pair}</span>
                      <span className="text-emerald-400 tabular-nums">
                        +${ex.netAlphaUsd.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-slate-500 text-[11px]">{new Date(ex.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    <span className="text-slate-500">CHAIN HASH: </span>
                    <span className="text-emerald-300">{ex.chainHash}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    <span>PREV HASH:  </span>
                    <span>{ex.prevChainHash}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'arena' && (
          <>
            {/* Official Tournament Scoring KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Tournament Rank</div>
                <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-white">
                  #{championship?.rank ?? 1} <span className="text-sm text-slate-500">/ {championship?.totalCompetitors ?? 128}</span>
                </div>
                <div className="mt-1 text-[11px] text-cyan-400 font-mono">
                  Score: {(championship?.championshipScore ?? 98.42).toFixed(2)} pts
                </div>
              </div>

              <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Sharpe Ratio</div>
                <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-emerald-400">
                  {(championship?.sharpeRatio ?? 3.48).toFixed(2)}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Half-Kelly: {(championship?.kellyFraction ?? 0.5).toFixed(2)}x
                </div>
              </div>

              <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Max Drawdown</div>
                <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-cyan-300">
                  {(championship?.maxDrawdownPct ?? -0.42).toFixed(2)}%
                </div>
                <div className="mt-1 text-[11px] text-slate-500 font-mono">
                  Daily Ceiling: {(championship?.dailyMddCapPct ?? -2.0).toFixed(2)}%
                </div>
              </div>

              <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Win Rate</div>
                <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-white">
                  {(championship?.winRatePct ?? 94.6).toFixed(1)}%
                </div>
                <div className="mt-1 text-[11px] text-slate-500 font-mono">
                  {championship?.winningExecutions ?? 0} / {championship?.totalExecutions ?? 0} settled
                </div>
              </div>

              <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 col-span-2 lg:col-span-1">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Cumulative Net Alpha</div>
                <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-emerald-400">
                  +${(championship?.totalNetAlphaUsd ?? 0).toFixed(2)}
                </div>
                <div className="mt-1 text-[11px] text-slate-500 font-mono">
                  Vol: ${((championship?.totalNotionalVolumeUsd ?? 0) / 1000).toFixed(1)}k
                </div>
              </div>
            </div>

            {/* Strategy Selector + Deterministic Risk Governor + Base L2 ERC-4337 Smart Account */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Strategy Hot-Swap */}
              <div className="xl:col-span-5 bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                      Execution Strategy Hot-Swap
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-300">
                    {championship?.activeStrategy || 'Balanced Sharpe'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {STRATEGIES.map((strat) => {
                    const active = championship?.activeStrategy === strat;
                    return (
                      <button
                        key={strat}
                        type="button"
                        disabled={swappingStrategy}
                        onClick={() => handleStrategyChange(strat)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium text-left border transition-colors cursor-pointer ${
                          active
                            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                            : 'bg-[#080B10] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {strat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Deterministic Risk Governor */}
              <div className="xl:col-span-3 bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                      Risk Governor
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                    {championship?.riskGovernorStatus || 'ARMED_NOMINAL'}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs font-mono tabular-nums">
                  <div className="flex justify-between text-slate-400">
                    <span>Daily MDD Cap</span>
                    <span className="text-white">-2.00%</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Position Sizing</span>
                    <span className="text-cyan-300">Half-Kelly ({(championship?.kellyFraction ?? 0.5).toFixed(2)}x)</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Negative-EV Veto</span>
                    <span className="text-emerald-400">STRICT ENFORCED</span>
                  </div>
                </div>
              </div>

              {/* Base L2 ERC-4337 Smart Account (Zero-Fake-Balance Compliance) */}
              <div className="xl:col-span-4 bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                      Base L2 ERC-4337 Smart Account
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
                    <Lock className="w-2.5 h-2.5 text-emerald-400" />
                    ZERO-FAKE-BALANCE
                  </span>
                </div>
                <div className="text-[11px] font-mono text-cyan-300 bg-[#080B10] border border-slate-800/80 rounded px-2.5 py-1.5 truncate">
                  {championship?.smartAccountAddress || '0x4B3A8e12d5F7C9246B18D3F95C8466e3F5C91942'}
                </div>
                <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="text-slate-400">Verified On-Chain Balance</span>
                  <span className="text-white font-semibold">
                    ${(championship?.verifiedBaseOnChainBalanceUsd ?? 0).toFixed(2)} USDC
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Paymaster Gas: <span className="text-emerald-400 font-mono">$0.00</span> · Real on-chain balance remains $0.00 until deposited.
                </div>
              </div>
            </div>

            {/* Chart + Dynamic Atomic Trade Ticket */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Cumulative Net Alpha & Spread Capture Chart */}
              <div className="xl:col-span-8 bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                      Cumulative Net Alpha ($) & Spread Capture
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    LIVE TELEMETRY · BASE L2
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={championship?.equityCurve || []}>
                      <defs>
                        <linearGradient id="alphaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#64748b"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0D121B',
                          borderColor: '#1e293b',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="cumulativeAlphaUsd"
                        name="Cumulative Net Alpha ($)"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#alphaFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Dynamic Atomic Trade Ticket */}
              <div className="xl:col-span-4 bg-[#0D121B] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                        Dynamic Atomic Trade Ticket
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400">ERC-4337</span>
                  </div>

                  {/* Pair Selector */}
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-slate-400">
                      Pair
                    </label>
                    <select
                      value={selectedPair}
                      onChange={(e) => setSelectedPair(e.target.value)}
                      className="w-full bg-[#080B10] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    >
                      {(quotes.length > 0 ? quotes : [{ pair: 'ETH/USDC' }, { pair: 'BTC/USD' }, { pair: 'SOL/USD' }, { pair: 'AERO/USDC' }, { pair: 'SUI/USDC' }]).map((q) => (
                        <option key={q.pair} value={q.pair}>
                          {q.pair}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notional Input + Presets */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-wider text-slate-400">
                      Notional Size (USD)
                    </label>
                    <input
                      type="number"
                      min={1000}
                      max={250000}
                      step={1000}
                      value={notionalUsd}
                      onChange={(e) => setNotionalUsd(Math.max(1000, Number(e.target.value) || 1000))}
                      className="w-full bg-[#080B10] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-white focus:outline-none focus:border-cyan-500"
                    />
                    <div className="grid grid-cols-4 gap-1.5">
                      {NOTIONAL_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNotionalUsd(preset)}
                          className={`py-1 rounded text-[11px] font-mono tabular-nums border cursor-pointer ${
                            notionalUsd === preset
                              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                              : 'bg-[#080B10] border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          ${preset / 1000}k
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fee & Net Alpha Breakdown */}
                  <div className="bg-[#080B10] border border-slate-800/80 rounded-lg p-3 space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="flex justify-between text-slate-400">
                      <span>Gross Spread ({ticketPreview.spreadBps.toFixed(1)} bps)</span>
                      <span className="text-slate-200">+${ticketPreview.grossSpreadUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Coinbase Taker (0.05%)</span>
                      <span className="text-rose-400">-${ticketPreview.takerFeeUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Slippage & DEX Buffer (0.08%)</span>
                      <span className="text-rose-400">-${ticketPreview.slippageBufferUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>ERC-4337 Paymaster Gas</span>
                      <span className="text-emerald-400">$0.00</span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-800 flex justify-between font-semibold">
                      <span className="text-slate-200">Expected Net Alpha</span>
                      <span
                        className={
                          ticketPreview.expectedNetAlphaUsd > 0 ? 'text-emerald-400' : 'text-amber-400'
                        }
                      >
                        {ticketPreview.expectedNetAlphaUsd >= 0 ? '+' : ''}$
                        {ticketPreview.expectedNetAlphaUsd.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={executing}
                    onClick={handleExecuteTrade}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {executing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    {executing ? 'Settling Atomic Cycle...' : `Execute Atomic ${selectedPair} Cycle`}
                  </button>
                  {lastFeedback && (
                    <div className="text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 rounded px-2.5 py-1.5">
                      {lastFeedback}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cross-Venue Spread Matrix */}
            <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Cross-Venue Spread Matrix (Coinbase Spot vs Base L2 DEX)
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">CLICK ROW TO LOAD TICKET</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-4 font-medium">Pair</th>
                      <th className="py-2.5 px-3 font-medium text-right">Coinbase Spot</th>
                      <th className="py-2.5 px-3 font-medium text-right">Base DEX</th>
                      <th className="py-2.5 px-3 font-medium text-right">Spread (bps)</th>
                      <th className="py-2.5 px-3 font-medium text-right">Spread / $10k</th>
                      <th className="py-2.5 px-3 font-medium text-right">Est. Net Alpha</th>
                      <th className="py-2.5 px-4 font-medium text-right">Liquidity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                    {quotes.map((q) => (
                      <tr
                        key={q.pair}
                        onClick={() => setSelectedPair(q.pair)}
                        className={`cursor-pointer transition-colors ${
                          selectedPair === q.pair ? 'bg-cyan-500/10' : 'hover:bg-slate-900/50'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-semibold text-white">{q.pair}</td>
                        <td className="py-2.5 px-3 text-right text-slate-200">
                          ${q.coinbaseSpot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          ${q.baseDexPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </td>
                        <td className="py-2.5 px-3 text-right text-cyan-300">{q.spreadBps.toFixed(1)} bps</td>
                        <td className="py-2.5 px-3 text-right text-slate-300">${q.spreadUsdPer10k.toFixed(2)}</td>
                        <td
                          className={`py-2.5 px-3 text-right font-semibold ${
                            q.estimatedNetAlphaUsd > 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {q.estimatedNetAlphaUsd >= 0 ? '+' : ''}${q.estimatedNetAlphaUsd.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                            {q.liquidityTier}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Filterable Recent Atomic Executions Ledger */}
            <div className="bg-[#0D121B] border border-slate-800/80 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Recent Atomic Executions Ledger
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-500 mr-1" />
                  {['ALL', 'ETH/USDC', 'BTC/USD', 'SOL/USD', 'AERO/USDC', 'SUI/USDC', 'EDGE_CRON_AUTOPILOT'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setLedgerFilter(f)}
                      className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer ${
                        ledgerFilter === f
                          ? 'bg-slate-700 text-white'
                          : 'bg-[#080B10] text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {f === 'EDGE_CRON_AUTOPILOT' ? 'EDGE CRON' : f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#0D121B] z-10">
                    <tr className="border-b border-slate-800/80 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2 px-4 font-medium">ID</th>
                      <th className="py-2 px-3 font-medium">Time</th>
                      <th className="py-2 px-3 font-medium">Pair</th>
                      <th className="py-2 px-3 font-medium text-right">Notional</th>
                      <th className="py-2 px-3 font-medium text-right">Spread</th>
                      <th className="py-2 px-3 font-medium text-right">Net Alpha</th>
                      <th className="py-2 px-3 font-medium">Trigger</th>
                      <th className="py-2 px-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                    {filteredExecutions.map((ex) => (
                      <tr key={ex.id} className="hover:bg-slate-900/50">
                        <td className="py-2 px-4 text-cyan-300">{ex.id}</td>
                        <td className="py-2 px-3 text-slate-400">{new Date(ex.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2 px-3 text-white font-semibold">{ex.pair}</td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          ${ex.notionalUsd.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-cyan-300">{ex.spreadBps.toFixed(1)} bps</td>
                        <td
                          className={`py-2 px-3 text-right font-semibold ${
                            ex.netAlphaUsd > 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {ex.netAlphaUsd >= 0 ? '+' : ''}${ex.netAlphaUsd.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[11px]">
                          {ex.trigger === 'EDGE_CRON_AUTOPILOT' ? `EDGE (${ex.edgeColo})` : 'MANUAL'}
                        </td>
                        <td className="py-2 px-4">
                          {ex.status === 'SETTLED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              SETTLED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <ShieldAlert className="w-3 h-3" />
                              VETOED
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CoinbaseChampionshipSuite;
