import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BatteryCharging,
  BookOpen,
  CheckCircle2,
  Cpu,
  FolderOpen,
  HardDrive,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Terminal,
  Zap,
} from 'lucide-react';

type Mt5ModuleType = 'EA' | 'INDICATOR';

interface Mt5ModuleConfig {
  lotSize: number;
  stopLossPips: number;
  takeProfitPips: number;
  magicNumber: number;
  demoOnly: boolean;
}

interface Mt5Module {
  id: string;
  filename: string;
  type: Mt5ModuleType;
  symbol: string;
  timeframe: string;
  enabled: boolean;
  installPath: string;
  deployedAt: string;
  config: Mt5ModuleConfig;
  lastSignal?: string;
}

interface BridgeLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'RECOVERY' | 'EXEC';
  source: string;
  message: string;
}

interface BridgeStatusResponse {
  ok: boolean;
  mode: string;
  deviceProfile: {
    device: string;
    containerEngine: string;
    wineVersion: string;
    vpsCostMonthlyUsd: number;
  };
  health: {
    cpuUsagePct: number;
    ramUsedMb: number;
    ramTotalMb: number;
    batteryPct: number;
    charging: boolean;
    thermalC: number;
    uptimeSeconds: number;
  };
  backgroundKeepAlive: {
    enabled: boolean;
    batteryOptimizationBypassed: boolean;
    wakeLockActive: boolean;
    dozeWhitelist: boolean;
    recentsLocked: boolean;
  };
  terminal: {
    processName: string;
    pid: number;
    status: string;
    broker: string;
    accountId: string;
    algoTradingEnabled: boolean;
    pingMs: number;
    recoveryCount: number;
    lastRecoveryIso: string | null;
    lastHeartbeatIso: string;
  };
  demoSafetyLock: {
    enabled: boolean;
    mode: string;
    liveTradingBlocked: boolean;
    note: string;
  };
  summary: {
    totalModules: number;
    activeEaCount: number;
    activeIndicatorCount: number;
  };
  modules: Mt5Module[];
  logs: BridgeLogEntry[];
}

interface SetupGuideStep {
  step: number;
  id: string;
  title: string;
  category: 'WINLATOR' | 'WINE' | 'MT5' | 'ANDROID_OS' | 'MQL5_FILES';
  summary: string;
  details: string[];
  pathHint?: string;
  critical?: boolean;
}

interface SetupGuideResponse {
  ok: boolean;
  title: string;
  mql5Paths: {
    experts: string;
    indicators: string;
    androidSharedDrive: string;
  };
  steps: SetupGuideStep[];
}

function formatUptime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const Mt5MobileEaSuite: React.FC = () => {
  const [status, setStatus] = useState<BridgeStatusResponse | null>(null);
  const [guide, setGuide] = useState<SetupGuideResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [recovering, setRecovering] = useState<boolean>(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Deploy form state
  const [filename, setFilename] = useState<string>('');
  const [moduleType, setModuleType] = useState<Mt5ModuleType>('EA');
  const [symbol, setSymbol] = useState<string>('XAUUSD');
  const [timeframe, setTimeframe] = useState<string>('M5');
  const [lotSize, setLotSize] = useState<string>('0.05');
  const [stopLossPips, setStopLossPips] = useState<string>('20');
  const [takeProfitPips, setTakeProfitPips] = useState<string>('40');
  const [magicNumber, setMagicNumber] = useState<string>('880199');

  const fetchBridgeData = useCallback(async () => {
    try {
      const [statusRes, guideRes] = await Promise.all([
        fetch('/api/mt5-mobile/status'),
        fetch('/api/mt5-mobile/setup-guide'),
      ]);

      if (!statusRes.ok) {
        throw new Error(`Bridge status HTTP ${statusRes.status}`);
      }
      const statusData = (await statusRes.json()) as BridgeStatusResponse;
      setStatus(statusData);

      if (guideRes.ok) {
        const guideData = (await guideRes.json()) as SetupGuideResponse;
        setGuide(guideData);
      }
      setErrorMsg(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach /api/mt5-mobile bridge';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBridgeData();
    const interval = window.setInterval(() => {
      void fetchBridgeData();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [fetchBridgeData]);

  const handleToggleModule = async (mod: Mt5Module) => {
    setTogglingId(mod.id);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/mt5-mobile/ea/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mod.id, enabled: !mod.enabled }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to toggle module');
      }
      setFeedbackMsg(`${mod.filename} ${!mod.enabled ? 'enabled' : 'disabled'} on ${mod.symbol} ${mod.timeframe}.`);
      await fetchBridgeData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setTogglingId(null);
    }
  };

  const handleTaskManagerRecover = async () => {
    setRecovering(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/mt5-mobile/task-manager/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as {
        ok: boolean;
        previousPid?: number;
        newPid?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Task Manager recovery failed');
      }
      setFeedbackMsg(
        `Winlator Task Manager recovered terminal64.exe (PID ${data.previousPid} -> ${data.newPid}).`
      );
      await fetchBridgeData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setRecovering(false);
    }
  };

  const handleDeploySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!filename.trim()) {
      setErrorMsg('Please enter an .ex5 / .mq5 / .ex4 / .mq4 filename.');
      return;
    }

    setDeploying(true);
    setErrorMsg(null);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/mt5-mobile/ea/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: filename.trim(),
          type: moduleType,
          symbol: symbol.trim().toUpperCase(),
          timeframe: timeframe.trim().toUpperCase(),
          lotSize: Number(lotSize),
          stopLossPips: Number(stopLossPips),
          takeProfitPips: Number(takeProfitPips),
          magicNumber: Number(magicNumber),
          demoOnly: true,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; module?: Mt5Module };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Deployment failed');
      }
      setFilename('');
      setFeedbackMsg(`Deployed ${data.module?.filename ?? 'module'} to Winlator MQL5 directory (Demo Lock ON).`);
      await fetchBridgeData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Deployment failed');
    } finally {
      setDeploying(false);
    }
  };

  const ramPercent = status
    ? Math.round((status.health.ramUsedMb / Math.max(1, status.health.ramTotalMb)) * 100)
    : 0;

  return (
    <div
      className="min-h-screen w-full bg-[#080B10] text-slate-100 px-4 py-6 sm:px-6 lg:px-8"
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      <div className="mx-auto max-w-7xl space-y-5">
        {/* Header */}
        <header className="rounded-lg border border-slate-800/90 bg-[#0D121B] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-emerald-300 uppercase">
                  <Smartphone className="h-3.5 w-3.5" />
                  Android / Winlator No-VPS ($0/mo)
                </span>
                <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-amber-300 uppercase">
                  <Lock className="h-3.5 w-3.5" />
                  Demo Account Safety Lock: ON
                </span>
                {status && (
                  <span className="inline-flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] text-cyan-300 tabular-nums">
                    PID {status.terminal.pid} · {status.terminal.pingMs}ms
                  </span>
                )}
              </div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-50">
                MT4 / MT5 Mobile EA &amp; Custom Indicator Runtime
              </h1>
              <p className="text-xs text-slate-400">
                {status
                  ? `${status.deviceProfile.device} · ${status.deviceProfile.containerEngine} · ${status.deviceProfile.wineVersion}`
                  : 'Connecting to local Android Winlator / Wine bridge...'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void fetchBridgeData()}
                className="inline-flex items-center gap-2 rounded border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleTaskManagerRecover()}
                disabled={recovering}
                className="inline-flex items-center gap-2 rounded border border-rose-500/50 bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${recovering ? 'animate-spin' : ''}`} />
                {recovering ? 'Recovering MT5...' : 'Task Manager Recover (Restart MT5)'}
              </button>
            </div>
          </div>

          {(errorMsg || feedbackMsg) && (
            <div className="mt-3.5 space-y-2">
              {errorMsg && (
                <div className="flex items-center gap-2 rounded border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {feedbackMsg && (
                <div className="flex items-center gap-2 rounded border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{feedbackMsg}</span>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Android Device Telemetry Bar */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-800/90 bg-[#0D121B] p-3.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider">
              <span>Battery &amp; Thermal</span>
              <BatteryCharging className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between tabular-nums">
              <span className="text-xl font-bold text-slate-50">
                {status ? `${status.health.batteryPct}%` : '--%'}
              </span>
              <span className="text-xs text-emerald-400">
                {status?.health.charging ? 'AC Charging' : 'On Battery'} · {status?.health.thermalC ?? '--'}°C
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#0D121B] p-3.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider">
              <span>Android Memory (RAM)</span>
              <HardDrive className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between tabular-nums">
              <span className="text-xl font-bold text-slate-50">
                {status ? `${status.health.ramUsedMb} MB` : '-- MB'}
              </span>
              <span className="text-xs text-slate-400">
                / {status?.health.ramTotalMb ?? '--'} MB ({ramPercent}%)
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#0D121B] p-3.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider">
              <span>Wine Container Uptime</span>
              <Cpu className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between tabular-nums">
              <span className="text-xl font-bold text-slate-50">
                {status ? formatUptime(status.health.uptimeSeconds) : '--h --m --s'}
              </span>
              <span className="text-xs text-indigo-300">
                CPU {status?.health.cpuUsagePct ?? '--'}%
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#0D121B] p-3.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider">
              <span>Background Keep-Alive</span>
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-base font-bold text-emerald-300">
                {status?.backgroundKeepAlive.batteryOptimizationBypassed ? 'UNRESTRICTED' : 'RESTRICTED'}
              </span>
              <span className="text-[11px] text-slate-400">
                {status?.backgroundKeepAlive.wakeLockActive ? 'WakeLock + Doze Bypass' : 'Check OS'}
              </span>
            </div>
          </div>
        </section>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Installed EAs & Indicators Table */}
          <section className="lg:col-span-2 rounded-lg border border-slate-800/90 bg-[#0D121B] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Installed Expert Advisors &amp; Custom Indicators
                </h2>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 tabular-nums">
                <span>Active EAs: {status?.summary.activeEaCount ?? 0}</span>
                <span>·</span>
                <span>Indicators: {status?.summary.activeIndicatorCount ?? 0}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800/90 bg-[#0A0E16] text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Module</th>
                    <th className="px-3 py-2.5">Chart</th>
                    <th className="px-3 py-2.5">Parameters</th>
                    <th className="px-3 py-2.5">Live Signal</th>
                    <th className="px-4 py-2.5 text-right">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {status?.modules.map((mod) => (
                    <tr key={mod.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                              mod.type === 'EA'
                                ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                                : 'border border-violet-500/30 bg-violet-500/10 text-violet-300'
                            }`}
                          >
                            {mod.type}
                          </span>
                          <span className="font-medium text-slate-100">{mod.filename}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500 truncate max-w-[260px]">
                          {mod.installPath}
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-300">
                        {mod.symbol} <span className="text-slate-500">{mod.timeframe}</span>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-300">
                        {mod.type === 'EA' ? (
                          <div className="space-y-0.5 text-[11px]">
                            <div>
                              Lot <span className="text-slate-100">{mod.config.lotSize.toFixed(2)}</span> · SL{' '}
                              <span className="text-rose-300">{mod.config.stopLossPips}</span> / TP{' '}
                              <span className="text-emerald-300">{mod.config.takeProfitPips}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Magic #{mod.config.magicNumber} · DemoOnly
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Chart Overlay · Read-Only</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-300">
                        {mod.lastSignal ?? 'Idle'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={togglingId === mod.id}
                          onClick={() => void handleToggleModule(mod)}
                          aria-pressed={mod.enabled}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                            mod.enabled
                              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                              : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              mod.enabled ? 'bg-emerald-400' : 'bg-slate-600'
                            }`}
                          />
                          {mod.enabled ? 'ON' : 'OFF'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && (!status || status.modules.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-500">
                        No EAs or indicators registered in the Winlator container.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Deploy Custom EA / Indicator Form */}
          <section className="rounded-lg border border-slate-800/90 bg-[#0D121B] p-4">
            <div className="flex items-center gap-2 border-b border-slate-800/90 pb-3">
              <Plus className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-100">
                Deploy Custom EA / Indicator
              </h2>
            </div>

            <form onSubmit={(e) => void handleDeploySubmit(e)} className="mt-3.5 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  MQL4 / MQL5 Filename (.ex5, .mq5, .ex4, .mq4)
                </label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="e.g. Breakout_Scalper_v2.ex5"
                  className="w-full rounded border border-slate-800 bg-[#080B10] px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-500/60 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Type</label>
                  <select
                    value={moduleType}
                    onChange={(e) => setModuleType(e.target.value as Mt5ModuleType)}
                    className="w-full rounded border border-slate-800 bg-[#080B10] px-2 py-2 text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
                  >
                    <option value="EA">EA</option>
                    <option value="INDICATOR">Indicator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Symbol</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-[#080B10] px-2 py-2 text-xs text-slate-100 uppercase focus:border-cyan-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">TF</label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-[#080B10] px-2 py-2 text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
                  >
                    <option value="M1">M1</option>
                    <option value="M5">M5</option>
                    <option value="M15">M15</option>
                    <option value="H1">H1</option>
                    <option value="H4">H4</option>
                  </select>
                </div>
              </div>

              {moduleType === 'EA' && (
                <div className="grid grid-cols-2 gap-2 tabular-nums">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Lot Size</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="10"
                      value={lotSize}
                      onChange={(e) => setLotSize(e.target.value)}
                      className="w-full rounded border border-slate-800 bg-[#080B10] px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Magic Number</label>
                    <input
                      type="number"
                      value={magicNumber}
                      onChange={(e) => setMagicNumber(e.target.value)}
                      className="w-full rounded border border-slate-800 bg-[#080B10] px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Stop Loss (Pips)</label>
                    <input
                      type="number"
                      min="1"
                      value={stopLossPips}
                      onChange={(e) => setStopLossPips(e.target.value)}
                      className="w-full rounded border border-slate-800 bg-[#080B10] px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Take Profit (Pips)</label>
                    <input
                      type="number"
                      min="1"
                      value={takeProfitPips}
                      onChange={(e) => setTakeProfitPips(e.target.value)}
                      className="w-full rounded border border-slate-800 bg-[#080B10] px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-200">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-amber-400" />
                  Demo-Account Safety Lock
                </span>
                <span className="font-semibold text-amber-300">ENFORCED</span>
              </div>

              <button
                type="submit"
                disabled={deploying}
                className="w-full inline-flex items-center justify-center gap-2 rounded border border-cyan-500/50 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
              >
                <Zap className="h-3.5 w-3.5" />
                {deploying ? 'Deploying to MQL5...' : 'Deploy to Winlator MT5'}
              </button>
            </form>
          </section>
        </div>

        {/* Bottom Grid: Setup Guide & Live Logs */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Step-by-Step Winlator + MT5 Setup Guide */}
          <section className="lg:col-span-2 rounded-lg border border-slate-800/90 bg-[#0D121B] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Winlator + MT5 Mobile Setup Guide &amp; Troubleshooting
                </h2>
              </div>
              <span className="text-[11px] text-slate-400">Zero-VPS Android Workflow</span>
            </div>

            {guide && (
              <div className="mt-3 rounded border border-slate-800 bg-[#080B10] p-3 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
                  <FolderOpen className="h-3.5 w-3.5" />
                  MQL5 Data Folder Paths Inside Winlator
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500">Experts:</span> {guide.mql5Paths.experts}
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500">Indicators:</span> {guide.mql5Paths.indicators}
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500">Android Drive:</span> {guide.mql5Paths.androidSharedDrive}
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {guide?.steps.map((item) => (
                <div
                  key={item.id}
                  className="rounded border border-slate-800/80 bg-[#080B10] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-cyan-300 tabular-nums">
                      STEP {item.step} · {item.category}
                    </span>
                    {item.critical && (
                      <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                        CRITICAL
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-semibold text-slate-100">{item.title}</h3>
                  <p className="text-[11px] text-slate-400">{item.summary}</p>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-300">
                    {item.details.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                  {item.pathHint && (
                    <div className="pt-1 text-[10px] text-emerald-300/90 break-all">
                      Path: {item.pathHint}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Container & Heartbeat Logs */}
          <section className="rounded-lg border border-slate-800/90 bg-[#0D121B] p-4 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800/90 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Wine / MT5 Heartbeat Log
                </h2>
              </div>
              <span className="text-[10px] text-slate-500 tabular-nums">
                {status?.logs.length ?? 0} events
              </span>
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-y-auto max-h-[460px] pr-1">
              {status?.logs.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded border border-slate-800/80 bg-[#080B10] p-2.5 text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 tabular-nums">
                    <span
                      className={`font-semibold ${
                        entry.level === 'RECOVERY'
                          ? 'text-rose-300'
                          : entry.level === 'EXEC'
                          ? 'text-cyan-300'
                          : entry.level === 'WARN'
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                      }`}
                    >
                      [{entry.level}] {entry.source}
                    </span>
                    <span className="text-[10px] text-slate-500">{formatTime(entry.timestamp)}</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{entry.message}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Mt5MobileEaSuite;
