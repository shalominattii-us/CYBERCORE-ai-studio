import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  KeyRound,
  Landmark,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wallet,
} from 'lucide-react';

type ShieldLayerId =
  | 'pq_signing_gate'
  | 'mev_frontrun_shield'
  | 'zero_fake_balance_guard'
  | 'autonomous_circuit_breaker';

interface ShieldLayer {
  id: ShieldLayerId;
  name: string;
  description: string;
  enabled: boolean;
  lastToggledAt: string;
  enforcementsCount: number;
}

interface PqCryptoPosture {
  algorithm: string;
  kemScheme: string;
  signatureScheme: string;
  nistLevel: number;
  fingerprint: string;
  rotationCount: number;
  lastRotatedAt: string;
  status: 'VERIFIED' | 'ROTATING';
}

interface QuantumTreasuryVault {
  id: string;
  name: string;
  classification: string;
  allocationUsd: number;
  custodyMode: 'SOVEREIGN_COLD_PQ' | 'ESCROW_MULTISIG_PQ' | 'YIELD_TREASURY_PQ';
  integrityHash: string;
  lastReconciledAt: string;
  status: 'SEALED' | 'ACTIVE' | 'VERIFIED';
}

interface AuditEvent {
  id: string;
  timestamp: string;
  category: 'SHIELD' | 'PQ_CRYPTO' | 'TREASURY' | 'PERIMETER';
  severity: 'INFO' | 'NOTICE' | 'WARNING';
  action: string;
  detail: string;
  hash: string;
}

interface EagleShieldStatusPayload {
  perimeter: {
    status: 'ARMED' | 'DEGRADED';
    threatLevel: 'LOW' | 'ELEVATED' | 'GUARDED';
    activeShieldsCount: number;
    totalShieldsCount: number;
    uptimeSeconds: number;
    layers: ShieldLayer[];
  };
  postQuantum: PqCryptoPosture;
  treasury: {
    designation: 'US-SQTE';
    fullName: string;
    totalVaultedUsd: number;
    unbondedOnChainWalletUsd: 0;
    isolationStatus: 'STRICTLY_SEPARATED';
    lastReconciliationHash: string;
    lastReconciledAt: string;
    vaults: QuantumTreasuryVault[];
  };
  events: AuditEvent[];
}

const API_BASE = '/api/eagle-shield';

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

export const EagleShieldQuantumSuite: React.FC = () => {
  const [data, setData] = useState<EagleShieldStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [rotatingKeys, setRotatingKeys] = useState<boolean>(false);
  const [reconciling, setReconciling] = useState<boolean>(false);
  const [togglingLayerId, setTogglingLayerId] = useState<ShieldLayerId | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = (await res.json()) as EagleShieldStatusPayload;
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Eagle Shield telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = window.setInterval(() => {
      void fetchStatus();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [fetchStatus]);

  const handleRotateKeys = async () => {
    setRotatingKeys(true);
    try {
      const res = await fetch(`${API_BASE}/rotate-pq-keys`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as { status?: EagleShieldStatusPayload };
      if (result.status) {
        setData(result.status);
      } else {
        await fetchStatus();
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Key rotation failed');
    } finally {
      setRotatingKeys(false);
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await fetch(`${API_BASE}/reconcile`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as { status?: EagleShieldStatusPayload };
      if (result.status) {
        setData(result.status);
      } else {
        await fetchStatus();
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Treasury reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  const handleToggleLayer = async (layer: ShieldLayer) => {
    setTogglingLayerId(layer.id);
    try {
      const res = await fetch(`${API_BASE}/shield/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layerId: layer.id, enabled: !layer.enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as { status?: EagleShieldStatusPayload };
      if (result.status) {
        setData(result.status);
      } else {
        await fetchStatus();
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle defense layer');
    } finally {
      setTogglingLayerId(null);
    }
  };

  const isArmed = data?.perimeter.status === 'ARMED';

  return (
    <div className="min-h-screen bg-[#080B10] text-slate-100 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Institutional Header Bar */}
        <header className="bg-[#0D121B] border border-slate-800/80 rounded-lg px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-md bg-slate-900 border border-slate-700/70 text-emerald-400">
              {isArmed ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6 text-amber-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-base md:text-lg font-semibold tracking-tight text-slate-100">
                  EAGLE SHIELD DEFENSE &amp; US-SQTE QUANTUM TREASURY
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono tabular-nums border ${
                    isArmed
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                      : 'bg-amber-950/60 text-amber-300 border-amber-700/60'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isArmed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {data ? data.perimeter.status : 'SYNCING'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Post-Quantum Cryptographic Perimeter (ML-KEM / Kyber-1024 + CRYSTALS-Dilithium) &amp; Sovereign Vault Isolation Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="px-3 py-1.5 rounded bg-[#080B10] border border-slate-800/90 text-xs font-mono tabular-nums">
              <span className="text-slate-500 mr-2">THREAT</span>
              <span
                className={
                  data?.perimeter.threatLevel === 'LOW'
                    ? 'text-emerald-400'
                    : data?.perimeter.threatLevel === 'GUARDED'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }
              >
                {data?.perimeter.threatLevel ?? '---'}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded bg-[#080B10] border border-slate-800/90 text-xs font-mono tabular-nums">
              <span className="text-slate-500 mr-2">SHIELDS</span>
              <span className="text-slate-100">
                {data ? `${data.perimeter.activeShieldsCount}/${data.perimeter.totalShieldsCount}` : '--/--'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void fetchStatus()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-mono text-slate-200 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-rose-950/40 border border-rose-800/70 rounded-lg px-4 py-3 flex items-center gap-2.5 text-xs text-rose-200 font-mono">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>TELEMETRY ERROR: {error}</span>
          </div>
        )}

        {/* Primary Grid: Defense Perimeter + Post-Quantum Key Rotation */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Eagle Shield Defense Perimeter */}
          <section className="lg:col-span-7 bg-[#0D121B] border border-slate-800/80 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                    Eagle Shield Defense Perimeter
                  </h2>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  UPTIME {data ? `${data.perimeter.uptimeSeconds}s` : '--'}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {(data?.perimeter.layers ?? []).map((layer) => {
                  const busy = togglingLayerId === layer.id;
                  return (
                    <div
                      key={layer.id}
                      className="bg-[#080B10] border border-slate-800/90 rounded-md p-3.5 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-100">{layer.name}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                              layer.enabled
                                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/70'
                                : 'bg-rose-950/50 text-rose-300 border-rose-800/70'
                            }`}
                          >
                            {layer.enabled ? 'ARMED' : 'BYPASSED'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{layer.description}</p>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 pt-0.5">
                          ENFORCEMENTS: {layer.enforcementsCount.toLocaleString('en-US')} &middot; UPDATED:{' '}
                          {formatTimestamp(layer.lastToggledAt)}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggleLayer(layer)}
                        aria-pressed={layer.enabled}
                        className={`shrink-0 px-3 py-1.5 rounded text-xs font-mono border transition-colors cursor-pointer disabled:opacity-50 ${
                          layer.enabled
                            ? 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-700/70'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700/80'
                        }`}
                      >
                        {busy ? 'WAIT...' : layer.enabled ? 'DISABLE' : 'ARM'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Post-Quantum Cryptography Posture */}
          <section className="lg:col-span-5 bg-[#0D121B] border border-slate-800/80 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-violet-400" />
                  <h2 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                    Post-Quantum Key Rotation
                  </h2>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-violet-300 bg-violet-950/50 border border-violet-800/70 px-2 py-0.5 rounded">
                  NIST LEVEL {data?.postQuantum.nistLevel ?? 5}
                </span>
              </div>

              <div className="mt-4 space-y-3.5">
                <div className="bg-[#080B10] border border-slate-800/90 rounded-md p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>KEM / KEY ENCAPSULATION</span>
                    <span className="text-slate-200">{data?.postQuantum.kemScheme ?? 'ML-KEM / Kyber-1024'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>DIGITAL SIGNATURE</span>
                    <span className="text-slate-200">{data?.postQuantum.signatureScheme ?? 'CRYSTALS-Dilithium'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
                    <span>ROTATION EPOCH</span>
                    <span className="text-cyan-300">#{data?.postQuantum.rotationCount ?? '--'}</span>
                  </div>
                </div>

                <div className="bg-[#080B10] border border-slate-800/90 rounded-md p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                    <Cpu className="w-3.5 h-3.5 text-violet-400" />
                    <span>ACTIVE HYBRID KEY FINGERPRINT</span>
                  </div>
                  <div className="font-mono tabular-nums text-xs text-emerald-300 break-all bg-slate-950/90 border border-slate-800/80 rounded px-2.5 py-2">
                    {data?.postQuantum.fingerprint ?? 'LOADING...'}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    LAST ROTATED: {data ? formatTimestamp(data.postQuantum.lastRotatedAt) : '---'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800/80">
              <button
                type="button"
                disabled={rotatingKeys || !data}
                onClick={() => void handleRotateKeys()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/60 text-violet-200 text-xs font-mono tracking-wide transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rotatingKeys ? 'animate-spin' : ''}`} />
                {rotatingKeys ? 'ROTATING KYBER-1024 + DILITHIUM KEYS...' : 'ROTATE PQ KEYS (1-CLICK)'}
              </button>
            </div>
          </section>
        </div>

        {/* US-SQTE Quantum Treasury Vaults */}
        <section className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3.5 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <Landmark className="w-4 h-4 text-emerald-400" />
              <div>
                <h2 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                  US-SQTE Quantum Treasury Vaults
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sovereign reserve pools strictly segregated from unbonded on-chain wallet balances.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="px-3 py-1.5 rounded bg-[#080B10] border border-slate-800/90 text-xs font-mono tabular-nums">
                <span className="text-slate-500 mr-2">VAULTED</span>
                <span className="text-emerald-300">
                  {data ? formatUsd(data.treasury.totalVaultedUsd) : '$0.00'}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded bg-[#080B10] border border-amber-800/50 text-xs font-mono tabular-nums flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-400">UNBONDED ON-CHAIN:</span>
                <span className="text-amber-300">$0.00</span>
              </div>
              <button
                type="button"
                disabled={reconciling || !data}
                onClick={() => void handleReconcile()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/60 text-emerald-200 text-xs font-mono transition-colors cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${reconciling ? 'animate-pulse' : ''}`} />
                {reconciling ? 'RECONCILING...' : 'RECONCILE VAULTS'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(data?.treasury.vaults ?? []).map((vault) => (
              <div
                key={vault.id}
                className="bg-[#080B10] border border-slate-800/90 rounded-md p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      {vault.classification}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/60">
                      <Lock className="w-2.5 h-2.5" />
                      {vault.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100 mt-1.5">{vault.name}</h3>
                  <div className="text-xl font-mono tabular-nums font-semibold text-slate-50 mt-2">
                    {formatUsd(vault.allocationUsd)}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 space-y-1 text-[11px] font-mono tabular-nums text-slate-500">
                  <div className="flex items-center justify-between">
                    <span>CUSTODY</span>
                    <span className="text-slate-300">{vault.custodyMode}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>INTEGRITY</span>
                    <span className="text-cyan-400">{vault.integrityHash.slice(0, 14)}...</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#080B10] border border-slate-800/90 rounded-md px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400">
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                MASTER INTEGRITY HASH:{' '}
                <span className="text-slate-200">{data?.treasury.lastReconciliationHash ?? '---'}</span>
              </span>
            </div>
            <span className="shrink-0 text-slate-500">
              VERIFIED: {data ? formatTimestamp(data.treasury.lastReconciledAt) : '---'}
            </span>
          </div>
        </section>

        {/* Live Security & Treasury Audit Log */}
        <section className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-5">
          <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                Security &amp; Treasury Audit Log
              </h2>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              {data ? `${data.events.length} EVENTS` : '0 EVENTS'}
            </span>
          </div>

          <div className="mt-3 divide-y divide-slate-800/70 max-h-72 overflow-y-auto">
            {(data?.events ?? []).map((ev) => (
              <div
                key={ev.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] border ${
                      ev.severity === 'WARNING'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-800/70'
                        : ev.severity === 'NOTICE'
                          ? 'bg-violet-950/60 text-violet-300 border-violet-800/70'
                          : 'bg-slate-900 text-cyan-300 border-slate-700/70'
                    }`}
                  >
                    {ev.category}
                  </span>
                  <span className="text-slate-200 font-semibold shrink-0">{ev.action}</span>
                  <span className="text-slate-400 truncate font-sans">{ev.detail}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-[11px] tabular-nums text-slate-500">
                  <span className="text-slate-400">#{ev.hash}</span>
                  <span>{formatTimestamp(ev.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default EagleShieldQuantumSuite;
