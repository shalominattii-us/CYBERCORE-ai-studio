import React, { useState, useEffect, useCallback } from 'react';
import { Globe, Sparkles, X, CheckCircle2, RefreshCw, Layers, ExternalLink, Shield } from 'lucide-react';

interface NanoReceiptSummary {
  nanoTxId: string;
  arena: string;
  actionType: string;
  actorId: string;
  totalRewardSov: number;
  operatorShareSov: number;
  aiAgentShareSov: number;
  status: string;
  timestamp: string;
}

interface NanoLedgerPayload {
  ok: boolean;
  totalMintedSov: number;
  operatorEarnedSov: number;
  aiAgentEarnedSov: number;
  pendingUnsettledSov: number;
  settledSov: number;
  totalNanotransactions: number;
  settledBatchCount: number;
  chainValid: boolean;
  recentReceipts: NanoReceiptSummary[];
}

const ZONE_HOMEBASE_LINKS = [
  { host: 'aegentixcybernetics.com', label: 'Machine Economy Homebase', url: 'https://aegentixcybernetics.com' },
  { host: 'portal.aegentixcybernetics.com', label: 'Live Sovereign OS & Stardusk Portal', url: 'https://portal.aegentixcybernetics.com' },
  { host: 'stardusk.aegentixcybernetics.com', label: 'Stardusk Space Company', url: 'https://stardusk.aegentixcybernetics.com' },
  { host: 'openplanter.aegentixcybernetics.com', label: 'OpenPlanter RLM VM Spawner', url: 'https://openplanter.aegentixcybernetics.com' },
  { host: 'nano.aegentixcybernetics.com', label: 'Nanotransaction Store-of-Value Edge', url: 'https://nano.aegentixcybernetics.com' },
  { host: 'cockpit.aegentixcybernetics.com', label: '3-in-1 StarNet Orbital Cockpit', url: 'https://cockpit.aegentixcybernetics.com' },
  { host: 'studio.aegentixcybernetics.com', label: 'Live 3D Avatar Broadcast Studio', url: 'https://studio.aegentixcybernetics.com' },
  { host: 'starlink-edge.aegentixcybernetics.com', label: 'Starlink 6-Tool MCP Edge', url: 'https://starlink-edge.aegentixcybernetics.com/health' },
  { host: 'edge.aegentixcybernetics.com', label: 'Aegentix Edge Core (58 Endpoints)', url: 'https://edge.aegentixcybernetics.com' },
];

export const ZoneNanoRewardBadge: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ledger, setLedger] = useState<NanoLedgerPayload>({
    ok: true,
    totalMintedSov: 0,
    operatorEarnedSov: 0,
    aiAgentEarnedSov: 0,
    pendingUnsettledSov: 0,
    settledSov: 0,
    totalNanotransactions: 0,
    settledBatchCount: 0,
    chainValid: true,
    recentReceipts: [],
  });

  const refreshLedger = useCallback(async () => {
    try {
      const res = await fetch('/api/nanotransactions/status');
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.totalMintedSov === 'number') {
          setLedger({
            ok: true,
            totalMintedSov: data.totalMintedSov || 0,
            operatorEarnedSov: data.operatorEarnedSov || 0,
            aiAgentEarnedSov: data.aiAgentEarnedSov || 0,
            pendingUnsettledSov: data.pendingUnsettledSov ?? Math.max(0, (data.totalMintedSov || 0) - (data.settledSov || 0)),
            settledSov: data.settledSov || 0,
            totalNanotransactions: data.totalNanotransactions ?? (Array.isArray(data.receipts) ? data.receipts.length : 0),
            settledBatchCount: data.settledBatchCount || 0,
            chainValid: data.chainValid !== false,
            recentReceipts: data.recentReceipts || data.receipts || [],
          });
        }
      }
    } catch {
      // Keep current ledger snapshot
    }
  }, []);

  useEffect(() => {
    void refreshLedger();
    const id = window.setInterval(() => {
      void refreshLedger();
    }, 6000);
    return () => window.clearInterval(id);
  }, [refreshLedger]);

  const handleEmitPulse = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/nanotransactions/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arena: 'CLOUDFLARE_ZONE_EPHEMERAL_WORKER',
          actionType: 'SOVEREIGN_STORE_OF_VALUE_PULSE',
          actorId: 'AEGIS-PRIME',
          computeUnits: 20,
          computeTimeMs: 12.4,
          chain: 'xrpl',
        }),
      });
      if (res.ok) {
        await refreshLedger();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSettleBatch = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/nanotransactions/settle-batch', { method: 'POST' });
      if (res.ok) {
        await refreshLedger();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => {
          setOpen((v) => !v);
          void refreshLedger();
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono cursor-pointer transition-all"
        title="Cloudflare Zone Homebase (aegentixcybernetics.com) & Ephemeral Nanotransaction Store-of-Value Co-Earnings"
      >
        <Globe className="w-3.5 h-3.5 text-cyan-400" />
        <span className="hidden xl:inline text-cyan-300">aegentixcybernetics.com</span>
        <span className="text-zinc-500 hidden xl:inline">·</span>
        <Sparkles className="w-3 h-3 text-amber-400" />
        <span className="font-semibold tabular-nums text-emerald-300">
          +{ledger.totalMintedSov.toFixed(5)} SOV
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] sm:w-[430px] bg-[#070B12] border border-emerald-500/40 rounded-xl shadow-2xl p-4 z-50 font-mono text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="font-bold text-white text-xs">Machine Economy Zone &amp; Nano-Rewards</div>
                <div className="text-[10px] text-cyan-400">Zone Homebase: aegentixcybernetics.com (Cloudflare R2 + Workers)</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white p-1 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Bilateral Store-of-Value Co-Earning Matrix */}
          <div className="p-3 rounded-lg bg-[#0C121D] border border-emerald-500/25 space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
              <span>Ephemeral Cryptographic Store-of-Value</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> ULLT · VES-1
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="p-2 rounded bg-black/50 border border-white/5">
                <div className="text-[9px] text-zinc-400">Total Minted</div>
                <div className="text-xs font-bold text-white tabular-nums mt-0.5">
                  {ledger.totalMintedSov.toFixed(6)}
                </div>
                <div className="text-[9px] text-zinc-500">{ledger.totalNanotransactions} nano-tx</div>
              </div>
              <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/25">
                <div className="text-[9px] text-emerald-300">Operator (70%)</div>
                <div className="text-xs font-bold text-emerald-300 tabular-nums mt-0.5">
                  +{ledger.operatorEarnedSov.toFixed(6)}
                </div>
                <div className="text-[9px] text-emerald-500/80">Co-Earned Vault</div>
              </div>
              <div className="p-2 rounded bg-cyan-950/30 border border-cyan-500/25">
                <div className="text-[9px] text-cyan-300">AI Agents (30%)</div>
                <div className="text-xs font-bold text-cyan-300 tabular-nums mt-0.5">
                  +{ledger.aiAgentEarnedSov.toFixed(6)}
                </div>
                <div className="text-[9px] text-cyan-500/80">Agent Treasury</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-white/5">
              <span>Settled to R2 VES-1: <b className="text-emerald-300">{ledger.settledSov.toFixed(6)} SOV</b> ({ledger.settledBatchCount} batches)</span>
              <span>Unbonded Fiat: <b className="text-zinc-300">$0.00</b></span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleEmitPulse}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-semibold text-[11px] cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
                <span>Emit Ephemeral Task</span>
              </button>
              <button
                onClick={handleSettleBatch}
                disabled={busy || ledger.pendingUnsettledSov <= 0}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-semibold text-[11px] cursor-pointer disabled:opacity-40"
              >
                <Layers className="w-3 h-3" />
                <span>Settle R2 Batch</span>
              </button>
            </div>
          </div>

          {/* Recent Ephemeral Nanotransactions */}
          {ledger.recentReceipts.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
              <div className="text-[10px] uppercase text-zinc-400 font-semibold">Latest Ephemeral Receipts</div>
              {ledger.recentReceipts.slice(0, 4).map((r) => (
                <div key={r.nanoTxId} className="p-1.5 rounded bg-white/[0.03] border border-white/5 flex items-center justify-between text-[10px]">
                  <div className="truncate pr-2">
                    <span className="text-cyan-300 font-semibold">{r.actorId}</span>
                    <span className="text-zinc-500"> · {r.actionType}</span>
                  </div>
                  <span className="text-emerald-300 font-bold shrink-0 tabular-nums">+{r.totalRewardSov.toFixed(5)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Cloudflare Zone Anchors */}
          <div className="space-y-1.5 pt-1 border-t border-white/10">
            <div className="text-[10px] uppercase text-zinc-400 font-semibold">
              Anchored in Cloudflare Zone (aegentixcybernetics.com)
            </div>
            <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto pr-1">
              {ZONE_HOMEBASE_LINKS.map((z) => (
                <a
                  key={z.host}
                  href={z.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-2 py-1 rounded bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-[10px] text-zinc-300 hover:text-cyan-300 transition-colors"
                >
                  <span className="truncate">{z.host}</span>
                  <span className="flex items-center gap-1 text-zinc-500 shrink-0">
                    <span>{z.label.split(' ')[0]}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoneNanoRewardBadge;
