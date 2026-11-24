import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Cpu,
  Layers,
  Terminal,
  Bug,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  FileCode2,
  Scale,
} from 'lucide-react';

type ProofStatus = 'PROVEN' | 'BLOCKED_CHEAT' | 'COUNTEREXAMPLE_FOUND';
type RedTeamScenario =
  | 'cheat_false_goal'
  | 'weak_state'
  | 'small_subgroup'
  | 'mdd_bypass';

interface TheoremRecord {
  id: string;
  name: string;
  category: 'CRYPTOGRAPHIC_SECURITY' | 'TRADING_INVARIANT';
  layer: number;
  leanSignature: string;
  status: ProofStatus;
  proofLines: number;
  sorryCount: number;
  axiomCount: number;
  lastVerifiedAt: string;
  proofHash: string;
  detail: string;
  counterexample?: string;
}

interface ProofLayer {
  layer: number;
  title: string;
  subtitle: string;
  artifact: string;
  lineCount: number;
  status: 'VERIFIED' | 'HALTED';
  description: string;
}

interface VerificationLogEntry {
  id: string;
  timestamp: string;
  action: string;
  outcome: 'VERIFIED' | 'REJECTED_CHEAT' | 'COUNTEREXAMPLE_BLOCKED';
  theoremId?: string;
  scenario?: RedTeamScenario;
  summary: string;
  comparatorDiff?: string;
}

interface TcbAudit {
  assumedPrimitives: Array<{
    name: string;
    standard: string;
    role: string;
    auditStatus: string;
  }>;
  humanAuditedSpecLines: number;
  totalFormalProofLines: number;
  kernelVersion: string;
  outOfScopeBoundaries: string[];
}

interface FormalVerifierStatus {
  gatekeeperMode: 'HELD_OUT_COMPARATOR_ACTIVE';
  kernel: 'Lean 4.14 Formal Proof Kernel';
  motto: "Don't Trust the Writer, Trust the Checker";
  deploymentGate: 'OPEN_ALL_10_PROVEN' | 'BLOCKED_BY_GATEKEEPER';
  lastAuditAt: string;
  threeLayerStack: ProofLayer[];
  theorems: TheoremRecord[];
  tcbAudit: TcbAudit;
  verificationLog: VerificationLogEntry[];
}

const REDTEAM_ACTIONS: Array<{
  scenario: RedTeamScenario;
  label: string;
  subtitle: string;
}> = [
  {
    scenario: 'cheat_false_goal',
    label: 'Cheat: Redefine Goal as False',
    subtitle: 'Tests held-out comparator against False/sorry smuggling',
  },
  {
    scenario: 'weak_state',
    label: 'Inject: Weak State',
    subtitle: 'Low-entropy PRNG reuse targeting Post-Compromise Security',
  },
  {
    scenario: 'small_subgroup',
    label: 'Inject: Small Subgroup',
    subtitle: 'Low-order X25519 point targeting PQXDH Forward Secrecy',
  },
  {
    scenario: 'mdd_bypass',
    label: 'Inject: MDD Cap Bypass',
    subtitle: 'Force-flag override targeting -2.00% Daily MDD Breaker',
  },
];

export const FormalVerificationSuite: React.FC = () => {
  const [status, setStatus] = useState<FormalVerifierStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [auditing, setAuditing] = useState<boolean>(false);
  const [injecting, setInjecting] = useState<RedTeamScenario | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/formal-verify/status');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} loading formal verification status`);
      }
      const data = (await res.json()) as FormalVerifierStatus;
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load formal verifier status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleRunAudit = async () => {
    setAuditing(true);
    setError(null);
    try {
      const res = await fetch('/api/formal-verify/verify-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} running Lean 4 audit`);
      }
      const data = (await res.json()) as { status: FormalVerifierStatus };
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lean 4 audit failed');
    } finally {
      setAuditing(false);
    }
  };

  const handleInjectRedTeam = async (scenario: RedTeamScenario) => {
    setInjecting(scenario);
    setError(null);
    try {
      const res = await fetch('/api/formal-verify/inject-redteam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} running red-team injection`);
      }
      const data = (await res.json()) as { status: FormalVerifierStatus };
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Red-team injection failed');
    } finally {
      setInjecting(null);
    }
  };

  const provenCount = status?.theorems.filter((t) => t.status === 'PROVEN').length ?? 0;
  const totalCount = status?.theorems.length ?? 10;
  const isGateOpen = status?.deploymentGate === 'OPEN_ALL_10_PROVEN';

  return (
    <div className="min-h-screen bg-[#080B10] text-slate-100 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header Bar */}
        <header className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Don&apos;t Trust the Writer, Trust the Checker
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/30">
                <Cpu className="w-3.5 h-3.5" />
                {status?.kernel ?? 'Lean 4.14 Formal Proof Kernel'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                <Lock className="w-3.5 h-3.5" />
                {status?.gatekeeperMode ?? 'HELD_OUT_COMPARATOR_ACTIVE'}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-50">
              AlphaProof Code Formal Verification Gatekeeper
            </h1>
            <p className="text-xs md:text-sm text-slate-400">
              Machine-checked Lean 4 proofs &amp; held-out comparator enforcing cryptographic security and Aegentix trading invariants.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div
              className={`px-3.5 py-2 rounded border font-mono text-xs tabular-nums flex items-center gap-2 ${
                isGateOpen
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-500/50 text-rose-300'
              }`}
            >
              {isGateOpen ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-75">
                  Deployment Gate
                </div>
                <div className="font-semibold">
                  {isGateOpen ? `OPEN (${provenCount}/${totalCount} PROVEN)` : 'BLOCKED BY GATEKEEPER'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleRunAudit()}
              disabled={auditing || loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-semibold text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${auditing ? 'animate-spin' : ''}`} />
              {auditing ? 'Auditing Kernel...' : 'Run Full Lean 4 Kernel Audit'}
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-rose-950/40 border border-rose-500/40 rounded-lg p-3.5 text-xs font-mono text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 3-Layer Proof Stack Visualizer */}
        <section className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                3-Layer Formal Proof Stack
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              Total Verified Lines:{' '}
              <strong className="text-slate-100">
                {status?.tcbAudit.totalFormalProofLines.toLocaleString() ?? '—'}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(status?.threeLayerStack ?? []).map((layer, idx) => (
              <div
                key={layer.layer}
                className="relative bg-[#080B10] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400">
                      Layer 0{layer.layer}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                        layer.status === 'VERIFIED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {layer.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100">{layer.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{layer.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                  <span className="truncate flex items-center gap-1.5 text-slate-300">
                    <FileCode2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    {layer.artifact}
                  </span>
                  <span className="shrink-0 ml-2">{layer.lineCount.toLocaleString()} LOC</span>
                </div>

                {idx < 2 && (
                  <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-[#0D121B] border border-slate-700 items-center justify-center text-slate-400">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Red-Team Bug & Cheat Injection Simulator */}
        <section className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                Red-Team Bug &amp; Cheat Injection Simulator
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Inject adversarial proofs or vulnerabilities to test held-out comparator rejection
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {REDTEAM_ACTIONS.map((item) => {
              const isBusy = injecting === item.scenario;
              return (
                <button
                  key={item.scenario}
                  type="button"
                  disabled={injecting !== null || auditing}
                  onClick={() => void handleInjectRedTeam(item.scenario)}
                  className="text-left p-3.5 rounded-lg bg-[#080B10] hover:bg-rose-950/25 border border-slate-800 hover:border-rose-500/50 transition-colors disabled:opacity-50 cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-rose-300">
                      {isBusy ? 'Injecting...' : item.label}
                    </span>
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{item.subtitle}</p>
                </button>
              );
            })}
          </div>

          {/* Live Comparator Rejection Log */}
          <div className="bg-[#080B10] border border-slate-800/90 rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                Live Held-Out Comparator &amp; Kernel Log
              </span>
              <span className="tabular-nums">
                {status?.verificationLog.length ?? 0} events
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {(status?.verificationLog ?? []).map((entry) => (
                <div
                  key={entry.id}
                  className={`p-2.5 rounded border text-xs font-mono space-y-1.5 ${
                    entry.outcome === 'VERIFIED'
                      ? 'bg-emerald-950/20 border-emerald-500/25 text-emerald-200'
                      : 'bg-rose-950/25 border-rose-500/35 text-rose-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold">
                      [{entry.outcome}] {entry.action}
                      {entry.theoremId ? ` :: ${entry.theoremId}` : ''}
                    </span>
                    <span className="text-slate-400 tabular-nums">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{entry.summary}</p>
                  {entry.comparatorDiff && (
                    <pre className="text-[10px] bg-black/50 border border-slate-800 rounded p-2 overflow-x-auto text-amber-300 whitespace-pre-wrap">
                      {entry.comparatorDiff}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 10 Security & Trading Invariant Theorems Table */}
        <section className="bg-[#0D121B] border border-slate-800/80 rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                10 Security &amp; Trading Invariant Theorems
              </h2>
            </div>
            <div className="text-[11px] font-mono text-slate-400 tabular-nums">
              Proven: <span className="text-emerald-400 font-semibold">{provenCount}</span> /{' '}
              {totalCount} • Zero-Sorry &amp; Zero-Axiom Policy
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#080B10] border-b border-slate-800/80 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Theorem</th>
                  <th className="py-3 px-4">Lean 4 Signature</th>
                  <th className="py-3 px-4 text-right">LOC</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {(status?.theorems ?? []).map((thm) => (
                  <React.Fragment key={thm.id}>
                    <tr className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 align-top min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-sky-400 font-semibold">
                            {thm.id}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border ${
                              thm.category === 'CRYPTOGRAPHIC_SECURITY'
                                ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {thm.category === 'CRYPTOGRAPHIC_SECURITY' ? 'CRYPTO' : 'TRADING'}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-100 mt-1">{thm.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {thm.detail}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        <code className="block font-mono text-[11px] text-slate-300 bg-[#080B10] border border-slate-800/90 rounded px-2.5 py-2 break-words">
                          {thm.leanSignature}
                        </code>
                        <div className="mt-1.5 flex items-center gap-3 text-[10px] font-mono text-slate-500 tabular-nums">
                          <span>hash:{thm.proofHash}</span>
                          <span>sorry:{thm.sorryCount}</span>
                          <span>axioms:{thm.axiomCount}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {thm.proofLines}
                      </td>
                      <td className="py-3.5 px-4 align-top text-center whitespace-nowrap">
                        {thm.status === 'PROVEN' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            PROVEN
                          </span>
                        )}
                        {thm.status === 'BLOCKED_CHEAT' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/40">
                            <XCircle className="w-3.5 h-3.5" />
                            BLOCKED_CHEAT
                          </span>
                        )}
                        {thm.status === 'COUNTEREXAMPLE_FOUND' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            COUNTEREXAMPLE_FOUND
                          </span>
                        )}
                      </td>
                    </tr>
                    {thm.counterexample && (
                      <tr className="bg-rose-950/25">
                        <td colSpan={4} className="px-4 py-2.5 font-mono text-[11px] text-rose-300">
                          <strong>Gatekeeper Evidence:</strong> {thm.counterexample}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* TCB & Out-of-Scope Transparency Panel */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                Trusted Computing Base (TCB)
              </h2>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                Human-Audited Spec: {status?.tcbAudit.humanAuditedSpecLines ?? 412} LOC
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Assumed cryptographic primitives &amp; minimal Lean 4.14 kernel trusted outside the generated proof tree.
            </p>
            <div className="space-y-2">
              {(status?.tcbAudit.assumedPrimitives ?? []).map((prim) => (
                <div
                  key={prim.name}
                  className="bg-[#080B10] border border-slate-800/90 rounded p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-mono font-semibold text-slate-100">
                      {prim.name}{' '}
                      <span className="text-slate-500 font-normal">({prim.standard})</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{prim.role}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                    ASSUMED
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                Out-of-Scope Threat Boundaries
              </h2>
              <span className="text-[11px] font-mono text-amber-400">EXPLICIT EXCLUSIONS</span>
            </div>
            <p className="text-xs text-slate-400">
              Formal proofs guarantee mathematical invariants within the model; the following classes remain explicitly outside the proof boundary:
            </p>
            <ul className="space-y-2.5">
              {(status?.tcbAudit.outOfScopeBoundaries ?? []).map((boundary) => (
                <li
                  key={boundary}
                  className="bg-[#080B10] border border-slate-800/90 rounded p-3 text-xs text-slate-300 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{boundary}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
};

export default FormalVerificationSuite;
