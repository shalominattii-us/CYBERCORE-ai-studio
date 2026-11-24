import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Check,
  Clock,
  Copy,
  Play,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Terminal,
  TrendingDown,
  TrendingUp,
  Wifi,
} from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type TradeSignal = 'BUY' | 'SELL' | 'HOLD';

interface StrategyConfig {
  symbol: string;
  fastSma: number;
  slowSma: number;
  orderQty: number;
  schedule: string;
  autoScheduleEnabled: boolean;
  paperOnly: true;
}

interface PaperPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
}

interface PaperAccount {
  accountId: string;
  status: string;
  currency: string;
  cash: number;
  equity: number;
  buyingPower: number;
  paperOnly: true;
  mode: 'live-paper-api' | 'simulated-paper';
  positions: PaperPosition[];
}

interface DailyBarPoint {
  date: string;
  close: number;
  smaFast: number | null;
  smaSlow: number | null;
  sma20: number | null;
  sma50: number | null;
}

interface StarterPrompt {
  id: string;
  title: string;
  prompt: string;
}

interface StatusPayload {
  paperOnly: true;
  endpoint: string;
  account: PaperAccount;
  config: StrategyConfig;
  series: DailyBarPoint[];
  lastSignal: TradeSignal;
  signalSummary?: {
    signal: TradeSignal;
    latestClose: number;
    latestFast: number;
    latestSlow: number;
    hasPosition: boolean;
    reason: string;
  };
  lastEvaluationAt: string | null;
  mcpConfig: Record<string, unknown>;
  starterPrompts: StarterPrompt[];
}

interface TradeLogEntry {
  timestamp: string;
  symbol: string;
  signal: TradeSignal;
  qty: number;
  price: number;
  fastSma: number;
  slowSma: number;
  reason: string;
  mode: 'PAPER_API' | 'PAPER_SIM';
  rawLine: string;
}

interface ConnectionResult {
  connected: boolean;
  paperOnly: true;
  mode: 'live-paper-api' | 'simulated-paper';
  endpoint: string;
  latencyMs: number;
  message: string;
}

const PRESET_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'SPY', 'QQQ', 'TSLA'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export const AlpacaMcpBotSuite: React.FC = () => {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [logs, setLogs] = useState<TradeLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [testingConn, setTestingConn] = useState<boolean>(false);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [connResult, setConnResult] = useState<ConnectionResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Editable form state
  const [symbolInput, setSymbolInput] = useState<string>('AAPL');
  const [fastSmaInput, setFastSmaInput] = useState<number>(20);
  const [slowSmaInput, setSlowSmaInput] = useState<number>(50);
  const [orderQtyInput, setOrderQtyInput] = useState<number>(10);
  const [autoScheduleInput, setAutoScheduleInput] = useState<boolean>(true);

  const fetchStatusAndLogs = useCallback(async () => {
    try {
      setErrorMsg(null);
      const [statusRes, logsRes] = await Promise.all([
        fetch('/api/alpaca-bot/status'),
        fetch('/api/alpaca-bot/logs'),
      ]);
      if (!statusRes.ok) {
        throw new Error(`Status request failed (${statusRes.status})`);
      }
      const statusData = (await statusRes.json()) as StatusPayload;
      setStatus(statusData);
      setSymbolInput(statusData.config.symbol);
      setFastSmaInput(statusData.config.fastSma);
      setSlowSmaInput(statusData.config.slowSma);
      setOrderQtyInput(statusData.config.orderQty);
      setAutoScheduleInput(statusData.config.autoScheduleEnabled);

      if (logsRes.ok) {
        const logsData = (await logsRes.json()) as { entries: TradeLogEntry[] };
        setLogs(logsData.entries ?? []);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load Alpaca MCP Bot status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatusAndLogs();
  }, [fetchStatusAndLogs]);

  const handleTestConnection = async () => {
    setTestingConn(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/alpaca-bot/test-connection', { method: 'POST' });
      const data = (await res.json()) as ConnectionResult;
      setConnResult(data);
      await fetchStatusAndLogs();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTestingConn(false);
    }
  };

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/alpaca-bot/evaluate', { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Evaluation failed (${res.status})`);
      }
      await fetchStatusAndLogs();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to run SMA evaluation');
    } finally {
      setEvaluating(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/alpaca-bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbolInput,
          fastSma: Number(fastSmaInput),
          slowSma: Number(slowSmaInput),
          orderQty: Number(orderQtyInput),
          autoScheduleEnabled: autoScheduleInput,
        }),
      });
      if (!res.ok) {
        throw new Error(`Config update failed (${res.status})`);
      }
      await fetchStatusAndLogs();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save strategy config');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Clipboard API fallback ignored silently
    }
  };

  const signalBadgeStyle = (signal: TradeSignal) => {
    if (signal === 'BUY') {
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    }
    if (signal === 'SELL') {
      return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
    }
    return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
  };

  const mcpConfigJson = status
    ? JSON.stringify(status.mcpConfig, null, 2)
    : JSON.stringify(
        {
          mcpServers: {
            alpaca: {
              command: 'uvx',
              args: ['alpaca-mcp-server', 'serve'],
              env: {
                ALPACA_API_KEY: 'PK_YOUR_PAPER_API_KEY',
                ALPACA_SECRET_KEY: 'YOUR_PAPER_SECRET_KEY',
                ALPACA_PAPER_TRADE: 'True',
              },
            },
          },
        },
        null,
        2,
      );

  const fastLabel = `${status?.config.fastSma ?? fastSmaInput}-Day SMA`;
  const slowLabel = `${status?.config.slowSma ?? slowSmaInput}-Day SMA`;

  return (
    <div className="min-h-screen bg-[#080B10] text-slate-100 p-4 md:p-6 font-sans selection:bg-cyan-500/30">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Institutional Header */}
        <header className="bg-[#0D121B] border border-white/[0.08] rounded-xl p-4 md:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-cyan-400" />
              </div>
              <h1 className="text-lg md:text-xl font-semibold tracking-tight text-white">
                Claude AI + Alpaca MCP Trading Bot
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold tracking-wider uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                <ShieldCheck className="w-3.5 h-3.5" />
                PAPER TRADING ONLY
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              20/50-Day SMA Crossover • Daily Bars • 15m Pre-Close Execution (15:45 ET) • Audit Log:{' '}
              <span className="text-slate-200">trades.log</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingConn}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-medium bg-[#131B29] hover:bg-[#1A2436] text-slate-200 border border-white/[0.1] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Wifi className={`w-3.5 h-3.5 text-cyan-400 ${testingConn ? 'animate-pulse' : ''}`} />
              {testingConn ? 'Testing Paper API...' : 'Test Alpaca Connection'}
            </button>

            <button
              type="button"
              onClick={handleRunEvaluation}
              disabled={evaluating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#080B10] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {evaluating ? 'Evaluating SMA...' : 'Run Pre-Close SMA Check Now'}
            </button>
          </div>
        </header>

        {/* Connection Banner / Error Banner */}
        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-2.5 text-xs font-mono text-rose-300">
            {errorMsg}
          </div>
        )}

        {connResult && (
          <div
            className={`rounded-lg px-4 py-2.5 text-xs font-mono border flex flex-wrap items-center justify-between gap-2 ${
              connResult.connected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <span>
              [{connResult.mode.toUpperCase()}] {connResult.message}
            </span>
            <span className="tabular-nums opacity-80">
              {connResult.endpoint} • {connResult.latencyMs}ms
            </span>
          </div>
        )}

        {/* KPI Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-[#0D121B] border border-white/[0.08] rounded-xl p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Paper Equity
            </div>
            <div className="mt-1.5 text-lg font-mono font-semibold tabular-nums text-white">
              {status ? formatCurrency(status.account.equity) : '—'}
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500">
              Acct: {status?.account.accountId ?? 'PA3-SIM'}
            </div>
          </div>

          <div className="bg-[#0D121B] border border-white/[0.08] rounded-xl p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Paper Cash
            </div>
            <div className="mt-1.5 text-lg font-mono font-semibold tabular-nums text-white">
              {status ? formatCurrency(status.account.cash) : '—'}
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500">
              BP: {status ? formatCurrency(status.account.buyingPower) : '—'}
            </div>
          </div>

          <div className="bg-[#0D121B] border border-white/[0.08] rounded-xl p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Active Symbol
            </div>
            <div className="mt-1.5 text-lg font-mono font-semibold tabular-nums text-cyan-300">
              {status?.config.symbol ?? symbolInput}
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-400">
              Last Close:{' '}
              {status?.signalSummary ? `$${status.signalSummary.latestClose.toFixed(2)}` : '—'}
            </div>
          </div>

          <div className="bg-[#0D121B] border border-white/[0.08] rounded-xl p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Crossover Signal
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-mono font-semibold border ${signalBadgeStyle(
                  status?.lastSignal ?? 'HOLD',
                )}`}
              >
                {status?.lastSignal === 'BUY' && <TrendingUp className="w-3.5 h-3.5" />}
                {status?.lastSignal === 'SELL' && <TrendingDown className="w-3.5 h-3.5" />}
                {status?.lastSignal === 'HOLD' && <Activity className="w-3.5 h-3.5" />}
                {status?.lastSignal ?? 'HOLD'}
              </span>
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500 truncate">
              {status?.signalSummary
                ? `F:${status.signalSummary.latestFast.toFixed(2)} / S:${status.signalSummary.latestSlow.toFixed(2)}`
                : 'Awaiting bars'}
            </div>
          </div>

          <div className="bg-[#0D121B] border border-white/[0.08] rounded-xl p-4 col-span-2 lg:col-span-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Open Positions
            </div>
            <div className="mt-1.5 text-lg font-mono font-semibold tabular-nums text-white">
              {status?.account.positions.length ?? 0}
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500 truncate">
              {status?.account.positions[0]
                ? `${status.account.positions[0].symbol}: ${status.account.positions[0].qty} sh`
                : 'Flat (0 shares)'}
            </div>
          </div>
        </section>

        {/* Main Grid: Chart + Strategy Config */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* SMA Crossover Chart */}
          <div className="lg:col-span-2 bg-[#0D121B] border border-white/[0.08] rounded-xl p-4 md:p-5 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  60-Day Daily Close vs {fastLabel} &amp; {slowLabel}
                </h2>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  {status?.signalSummary?.reason ?? 'Loading daily bar series...'}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold border ${signalBadgeStyle(
                  status?.lastSignal ?? 'HOLD',
                )}`}
              >
                SIGNAL: {status?.lastSignal ?? 'HOLD'}
              </span>
            </div>

            <div className="h-[320px] w-full">
              {loading || !status ? (
                <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
                  Loading 60-day OHLCV &amp; SMA series...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={status.series}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'monospace' }}
                      tickFormatter={(val: string) => val.slice(5)}
                      minTickGap={24}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'monospace' }}
                      tickFormatter={(val: number) => `$${val.toFixed(0)}`}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#080B10',
                        borderColor: 'rgba(255,255,255,0.12)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                      labelStyle={{ color: '#E2E8F0', marginBottom: '4px' }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="close"
                      name="Daily Close"
                      stroke="#E2E8F0"
                      strokeWidth={1.75}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="smaFast"
                      name={fastLabel}
                      stroke="#22D3EE"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="smaSlow"
                      name={slowLabel}
                      stroke="#F59E0B"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Strategy Configuration Panel */}
          <form
            onSubmit={handleSaveConfig}
            className="bg-[#0D121B] border border-white/[0.08] rounded-xl p-4 md:p-5 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Strategy Configuration
                </h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  Paper Locked
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono uppercase text-slate-400">
                  Symbol
                </label>
                <input
                  type="text"
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                  className="w-full bg-[#080B10] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500/60"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PRESET_SYMBOLS.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setSymbolInput(sym)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                        symbolInput === sym
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-[#080B10] text-slate-400 border-white/[0.08] hover:text-slate-200'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono uppercase text-slate-400">
                    Fast SMA (Days)
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={100}
                    value={fastSmaInput}
                    onChange={(e) => setFastSmaInput(Number(e.target.value))}
                    className="w-full bg-[#080B10] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-white focus:outline-none focus:border-cyan-500/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono uppercase text-slate-400">
                    Slow SMA (Days)
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={200}
                    value={slowSmaInput}
                    onChange={(e) => setSlowSmaInput(Number(e.target.value))}
                    className="w-full bg-[#080B10] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-white focus:outline-none focus:border-cyan-500/60"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono uppercase text-slate-400">
                  Order Share Qty
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={orderQtyInput}
                  onChange={(e) => setOrderQtyInput(Number(e.target.value))}
                  className="w-full bg-[#080B10] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-white focus:outline-none focus:border-cyan-500/60"
                />
              </div>

              <div className="bg-[#080B10] border border-white/[0.08] rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    15m Pre-Close Daily Schedule
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    15:45 ET (Mon–Fri) • Paper Only
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoScheduleInput}
                  onClick={() => setAutoScheduleInput((prev) => !prev)}
                  className={`w-10 h-5 rounded-full transition-colors p-0.5 cursor-pointer ${
                    autoScheduleInput ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      autoScheduleInput ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="w-full py-2.5 rounded-lg text-xs font-mono font-semibold bg-[#131B29] hover:bg-[#1B263B] text-cyan-300 border border-cyan-500/30 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {savingConfig ? 'Saving Strategy...' : 'Apply Strategy Config'}
            </button>
          </form>
        </section>

        {/* Bottom Grid: Live trades.log Terminal + Claude Desktop MCP Setup */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Live trades.log Terminal Viewer */}
          <div className="bg-[#0D121B] border border-white/[0.08] rounded-xl p-4 md:p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Live <span className="font-mono text-emerald-300">trades.log</span> Viewer
              </h2>
              <button
                type="button"
                onClick={fetchStatusAndLogs}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-[#080B10] hover:bg-[#131B29] text-slate-300 border border-white/[0.08] cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>

            <div className="bg-[#080B10] border border-white/[0.08] rounded-lg p-3 h-[300px] overflow-y-auto font-mono text-[11px] space-y-2">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-4">
                  <p>No decisions logged to trades.log yet.</p>
                  <p className="mt-1 text-slate-600">
                    Click &quot;Run Pre-Close SMA Check Now&quot; to record a BUY / SELL / HOLD entry.
                  </p>
                </div>
              ) : (
                logs.map((entry, idx) => (
                  <div
                    key={`${entry.timestamp}-${idx}`}
                    className="border-b border-white/[0.05] pb-2 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-500 tabular-nums">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${signalBadgeStyle(
                          entry.signal,
                        )}`}
                      >
                        {entry.signal}
                      </span>
                      <span className="text-cyan-300 font-semibold">{entry.symbol}</span>
                      <span className="text-slate-300 tabular-nums">
                        qty={entry.qty} @ ${entry.price.toFixed(2)}
                      </span>
                      <span className="text-slate-500 tabular-nums">
                        [{entry.mode}]
                      </span>
                    </div>
                    <div className="text-slate-400 mt-1">{entry.reason}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Claude Desktop + Alpaca MCP Setup Panel */}
          <div className="bg-[#0D121B] border border-white/[0.08] rounded-xl p-4 md:p-5 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-400" />
                Claude Desktop + Alpaca MCP Setup
              </h2>
              <button
                type="button"
                onClick={() => handleCopy('mcp-json', mcpConfigJson)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-[#080B10] hover:bg-[#131B29] text-cyan-300 border border-cyan-500/30 cursor-pointer"
              >
                {copiedId === 'mcp-json' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied JSON
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy claude_desktop_config.json
                  </>
                )}
              </button>
            </div>

            <pre className="bg-[#080B10] border border-white/[0.08] rounded-lg p-3 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
              {mcpConfigJson}
            </pre>

            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Exact Starter Prompts
              </div>
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                {(status?.starterPrompts ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#080B10] border border-white/[0.08] rounded-lg p-2.5 flex items-start justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="text-[11px] font-mono font-semibold text-cyan-300">
                        {item.title}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">{item.prompt}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.id, item.prompt)}
                      className="shrink-0 p-1.5 rounded bg-[#131B29] hover:bg-[#1B263B] text-slate-300 border border-white/[0.08] cursor-pointer"
                      title="Copy prompt"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AlpacaMcpBotSuite;
