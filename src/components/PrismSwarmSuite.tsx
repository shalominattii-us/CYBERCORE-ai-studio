import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  GitBranch,
  History,
  Layers,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  Vote,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  BranchId,
  CriticVerdict,
  PrismMode,
  PrismStageId,
  PrismSwarmRun,
  PrismSwarmStatus,
} from '../api/prismSwarm';

const PRESET_PROMPTS: string[] = [
  'Audit cross-venue Alpaca MCP & MT5 Mobile execution invariants with fail-closed risk caps',
  'Verify zero-fake-balance compliance across Wave Surfer Treasury and Bot HQ telemetry',
  'Design formal verification proof gate for Sovereign OS autonomous circuit breakers',
];

const STAGE_META: Array<{
  id: PrismStageId;
  step: string;
  label: string;
  sublabel: string;
}> = [
  {
    id: 'SCHEMA_LINK',
    step: '01',
    label: 'Schema Linker',
    sublabel: 'Aegentix Module & Endpoint Binding',
  },
  {
    id: 'PARALLEL_EXPLORE',
    step: '02',
    label: '3x Parallel Explorers',
    sublabel: 'Risk-First · Cross-Venue · Formal Audit',
  },
  {
    id: 'SELF_CORRECTION',
    step: '03',
    label: 'Self-Correction Critic',
    sublabel: 'Adversarial Invariant & Zero-Fake Audit',
  },
  {
    id: 'CONSENSUS_VOTE',
    step: '04',
    label: 'Consensus Vote',
    sublabel: 'Weighted Tally & SHA-256 Digest Seal',
  },
];

function verdictBadgeClasses(verdict: CriticVerdict): string {
  switch (verdict) {
    case 'PASS':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    case 'PASS_WITH_CORRECTION':
      return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300';
    case 'REJECT':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
  }
}

export const PrismSwarmSuite: React.FC = () => {
  const [status, setStatus] = useState<PrismSwarmStatus | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [mode, setMode] = useState<PrismMode>('deepthink');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeRun, setActiveRun] = useState<PrismSwarmRun | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedDigest, setCopiedDigest] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/prism-swarm/status');
      if (!res.ok) {
        throw new Error(`Status endpoint returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as PrismSwarmStatus;
      setStatus(data);
      if (data.recentRuns.length > 0 && !activeRun) {
        setActiveRun(data.recentRuns[0]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach Prism Swarm engine.');
    }
  }, [activeRun]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleRunSwarm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isRunning) return;

    setIsRunning(true);
    setErrorMsg(null);
    setCopiedDigest(false);

    try {
      const res = await fetch('/api/prism-swarm/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed, mode }),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Prism Swarm run failed (HTTP ${res.status})`);
      }

      const run = (await res.json()) as PrismSwarmRun;
      setActiveRun(run);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              totalRuns: prev.totalRuns + 1,
              recentRuns: [run, ...prev.recentRuns].slice(0, 25),
            }
          : prev
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Prism Swarm execution failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyDigest = async (digest: string) => {
    try {
      await navigator.clipboard.writeText(digest);
      setCopiedDigest(true);
      setTimeout(() => setCopiedDigest(false), 1800);
    } catch {
      // Clipboard unavailable in non-secure contexts
    }
  };

  const stageLatency = (stageId: PrismStageId): number | null => {
    if (!activeRun) return null;
    switch (stageId) {
      case 'SCHEMA_LINK':
        return activeRun.schemaLink.latencyMs;
      case 'PARALLEL_EXPLORE':
        return Math.max(...activeRun.branches.map((b) => b.latencyMs));
      case 'SELF_CORRECTION':
        return activeRun.selfCorrection.latencyMs;
      case 'CONSENSUS_VOTE':
        return activeRun.consensus.latencyMs;
    }
  };

  const auditByBranch = new Map(
    (activeRun?.selfCorrection.audits ?? []).map((a) => [a.branchId, a])
  );

  return (
    <div className="min-h-screen bg-[#05070B] text-slate-100 px-4 py-6 md:px-8 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Telemetry Header */}
        <header className="rounded-xl bg-[#0B0F17] border border-white/10 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-lg md:text-xl font-semibold tracking-tight text-white">
                    Prism Swarm Orchestrator
                  </h1>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Zero-Fake-Balance Enforced
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  4-Stage Multi-Agent Reasoning: Schema Linking → 3x Parallel Exploration → Adversarial Critic → Consensus Vote
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 font-mono tabular-nums">
            <div className="rounded-lg bg-[#05070B] border border-white/10 px-3.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Branches</div>
              <div className="text-base font-semibold text-cyan-400">
                {status?.activeBranchCount ?? 3}
              </div>
            </div>
            <div className="rounded-lg bg-[#05070B] border border-white/10 px-3.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Session Runs</div>
              <div className="text-base font-semibold text-emerald-400">
                {status?.totalRuns ?? 0}
              </div>
            </div>
            <div className="rounded-lg bg-[#05070B] border border-white/10 px-3.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Engine</div>
              <div className="text-base font-semibold text-slate-200 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {status ? 'ONLINE' : 'SYNCING'}
              </div>
            </div>
          </div>
        </header>

        {/* Interactive Prism Swarm Command Bar */}
        <section className="rounded-xl bg-[#0B0F17] border border-white/10 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-400">
              <Terminal className="w-4 h-4" />
              Prism Swarm Command Bar
            </div>

            {/* DeepThink / Fast Mode Toggle */}
            <div className="inline-flex items-center rounded-lg bg-[#05070B] border border-white/10 p-1 font-mono text-xs">
              <button
                type="button"
                onClick={() => setMode('deepthink')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  mode === 'deepthink'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                DeepThink
              </button>
              <button
                type="button"
                onClick={() => setMode('fast')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  mode === 'fast'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Fast
              </button>
            </div>
          </div>

          <form onSubmit={handleRunSwarm} className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter an orchestration, verification, or cross-venue routing directive..."
              className="flex-1 rounded-lg bg-[#05070B] border border-white/15 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60 font-mono"
            />
            <button
              type="submit"
              disabled={isRunning || !prompt.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-[#05070B] font-semibold text-sm transition-colors shrink-0"
            >
              {isRunning ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  Executing Swarm...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Run Prism Swarm
                </>
              )}
            </button>
          </form>

          {/* Preset Prompt Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
              Presets:
            </span>
            {PRESET_PROMPTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPrompt(preset)}
                className="text-xs text-slate-300 hover:text-emerald-300 bg-[#05070B] border border-white/10 hover:border-emerald-500/40 rounded-md px-2.5 py-1 transition-colors text-left"
              >
                {preset}
              </button>
            ))}
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300 flex items-center gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}
        </section>

        {/* Live 4-Stage Pipeline Flow Visualizer */}
        <section className="rounded-xl bg-[#0B0F17] border border-white/10 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-300">
              <Cpu className="w-4 h-4 text-emerald-400" />
              4-Stage Prism Swarm Pipeline
            </div>
            {activeRun && (
              <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-400">
                <span>
                  Domain: <span className="text-cyan-300">{activeRun.schemaLink.detectedDomain}</span>
                </span>
                <span>
                  Total Latency:{' '}
                  <span className="text-emerald-400">{activeRun.totalLatencyMs} ms</span>
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {STAGE_META.map((stage, idx) => {
              const latency = stageLatency(stage.id);
              const isDone = Boolean(activeRun) && !isRunning;
              return (
                <div
                  key={stage.id}
                  className={`relative rounded-lg bg-[#05070B] border p-4 transition-colors ${
                    isRunning
                      ? 'border-cyan-500/50'
                      : isDone
                        ? 'border-emerald-500/40'
                        : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[11px] text-cyan-400 tabular-nums">
                      STAGE {stage.step}
                    </span>
                    {isDone ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400 tabular-nums">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {latency} ms
                      </span>
                    ) : isRunning ? (
                      <span className="font-mono text-[11px] text-cyan-300 animate-pulse">
                        RUNNING
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-500">IDLE</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-white">{stage.label}</div>
                  <div className="text-xs text-slate-400 mt-1">{stage.sublabel}</div>

                  {idx < STAGE_META.length - 1 && (
                    <ArrowRight className="hidden md:block w-4 h-4 text-slate-600 absolute -right-3.5 top-1/2 -translate-y-1/2 z-10" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Linked Aegentix Modules Row */}
          {activeRun && (
            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mr-1">
                Linked Schema:
              </span>
              {activeRun.schemaLink.linkedModules.map((mod) => (
                <span
                  key={mod.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#05070B] border border-cyan-500/25 px-2.5 py-1 text-xs font-mono text-cyan-300 tabular-nums"
                >
                  <span>{mod.endpoint}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-emerald-400">{Math.round(mod.relevanceScore * 100)}%</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 3-Column Branch Comparison Grid */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-300">
              <GitBranch className="w-4 h-4 text-cyan-400" />
              Parallel Exploration Branches & Adversarial Critic Audit
            </div>
            {activeRun && (
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                Rejected Branches: {activeRun.selfCorrection.rejectedCount} / 3
              </span>
            )}
          </div>

          {activeRun ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {activeRun.branches.map((branch) => {
                const audit = auditByBranch.get(branch.id);
                const votes = activeRun.consensus.voteTally[branch.id as BranchId] ?? 0;
                const isWinner = activeRun.consensus.winningBranchId === branch.id;

                return (
                  <div
                    key={branch.id}
                    className={`rounded-xl bg-[#0B0F17] border p-5 flex flex-col justify-between gap-4 ${
                      isWinner
                        ? 'border-emerald-500/60 shadow-[0_0_24px_-8px_rgba(16,185,129,0.35)]'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white">{branch.label}</h3>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">
                            Confidence: {Math.round(branch.confidence * 100)}% · {branch.latencyMs} ms
                          </div>
                        </div>
                        {isWinner && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                            Winner
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{branch.reasoning}</p>

                      <div className="space-y-1.5">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                          Proposed Steps
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-300">
                          {branch.steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="font-mono text-cyan-400 tabular-nums">
                                {i + 1}.
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Critic Audit & Vote Tally Footer */}
                    {audit && (
                      <div className="pt-3 border-t border-white/10 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${verdictBadgeClasses(
                              audit.verdict
                            )}`}
                          >
                            {audit.verdict === 'REJECT' ? (
                              <XCircle className="w-3 h-3" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            {audit.verdict}
                          </span>
                          <span className="text-xs font-mono text-slate-300 tabular-nums">
                            Critic: <strong className="text-white">{audit.criticScore}</strong>/100
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                          <div
                            className={`rounded px-2 py-1 border text-center ${
                              audit.zeroFakeBalanceCompliant
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                            }`}
                          >
                            Zero-Fake
                          </div>
                          <div
                            className={`rounded px-2 py-1 border text-center ${
                              audit.riskCapAdherent
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                            }`}
                          >
                            Risk-Cap
                          </div>
                          <div
                            className={`rounded px-2 py-1 border text-center ${
                              audit.executionValid
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                            }`}
                          >
                            Schema OK
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-snug">{audit.notes}</p>

                        <div className="flex items-center justify-between rounded-md bg-[#05070B] border border-white/10 px-3 py-1.5 font-mono text-xs tabular-nums">
                          <span className="text-slate-400 inline-flex items-center gap-1.5">
                            <Vote className="w-3.5 h-3.5 text-cyan-400" />
                            Consensus Votes
                          </span>
                          <span className={isWinner ? 'text-emerald-400 font-semibold' : 'text-slate-200'}>
                            {votes} / 5
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-[#0B0F17] border border-dashed border-white/15 p-10 text-center space-y-2">
              <GitBranch className="w-7 h-7 text-slate-500 mx-auto" />
              <div className="text-sm font-medium text-slate-300">
                No Prism Swarm run executed yet in this session
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Enter a directive in the Command Bar above or select a preset to launch 3 parallel explorers, adversarial critic auditing, and consensus voting.
              </p>
            </div>
          )}
        </section>

        {/* Winning Verified Output Card */}
        {activeRun && (
          <section className="rounded-xl bg-[#0B0F17] border border-emerald-500/40 p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Winning Verified Output — {activeRun.consensus.winningBranchLabel}
                  </h2>
                  <p className="text-xs text-slate-400">{activeRun.consensus.executiveSummary}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                <span className="px-2.5 py-1 rounded-md bg-[#05070B] border border-white/10 text-cyan-300 uppercase">
                  {activeRun.mode}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-[#05070B] border border-white/10 text-emerald-400 inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {activeRun.totalLatencyMs} ms
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-[#05070B] border border-white/10 p-4 space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400">
                Verified Execution Plan
              </div>
              <ol className="space-y-2 text-xs text-slate-200">
                {activeRun.consensus.verifiedPlan.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="font-mono text-emerald-400 tabular-nums">0{idx + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-[#05070B] border border-white/10 px-4 py-2.5 font-mono text-xs">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-slate-500 shrink-0">SHA-256 DIGEST:</span>
                <span className="text-cyan-300 truncate">{activeRun.sha256Digest}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyDigest(activeRun.sha256Digest)}
                className="inline-flex items-center gap-1.5 text-slate-300 hover:text-emerald-300 shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedDigest ? 'Copied' : 'Copy'}
              </button>
            </div>
          </section>
        )}

        {/* Session Run History */}
        <section className="rounded-xl bg-[#0B0F17] border border-white/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-300">
              <History className="w-4 h-4 text-cyan-400" />
              Session Run History
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {status?.recentRuns.length ?? 0} recorded
            </span>
          </div>

          {status && status.recentRuns.length > 0 ? (
            <div className="divide-y divide-white/10 border border-white/10 rounded-lg bg-[#05070B] overflow-hidden">
              {status.recentRuns.map((run) => {
                const isSelected = activeRun?.runId === run.runId;
                return (
                  <button
                    key={run.runId}
                    type="button"
                    onClick={() => setActiveRun(run)}
                    className={`w-full text-left px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2 transition-colors ${
                      isSelected ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-medium text-white truncate">{run.prompt}</div>
                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2 flex-wrap">
                        <span className="text-emerald-400">{run.consensus.winningBranchLabel}</span>
                        <span>·</span>
                        <span>{run.sha256Digest.slice(0, 16)}…</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums shrink-0">
                      <span className="uppercase text-cyan-300">{run.mode}</span>
                      <span className="text-slate-300">{run.totalLatencyMs} ms</span>
                      <span className="text-slate-500">
                        {new Date(run.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-xs font-mono text-slate-500 py-4 text-center border border-white/5 rounded-lg bg-[#05070B]">
              Session history is empty. Run Prism Swarm to record cryptographically sealed traces.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default PrismSwarmSuite;
