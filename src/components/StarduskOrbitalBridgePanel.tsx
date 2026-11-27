import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Key, CheckCircle2, Copy, Send, RefreshCw, ExternalLink, FileText } from 'lucide-react';

interface OrbitalFindingRecord {
  recordId: string;
  externalId: string;
  kind: 'requirement' | 'funding' | 'draft';
  title: string;
  summary: string;
  category: string;
  evidence: 'Proposed' | 'Source-backed' | 'Unverified';
  currentStatus: string;
  sources: Array<{ url: string; title: string; publishedAt: string | null }>;
}

export const StarduskOrbitalBridgePanel: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const [records, setRecords] = useState<OrbitalFindingRecord[]>([]);
  const [exportJson, setExportJson] = useState<string>('');
  const [mintedSdkToken, setMintedSdkToken] = useState<string | null>(null);
  const [remoteOrigin, setRemoteOrigin] = useState<string>('');
  const [remoteToken, setRemoteToken] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch('/api/rpc/research/state');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.records)) setRecords(data.records);
        if (data.exportBriefV1) setExportJson(JSON.stringify(data.exportBriefV1, null, 2));
      }
    } catch {}
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleMintToken = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/rpc/research/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Runable <-> Sovereign OS Orbital Bridge' }),
      });
      if (res.ok) {
        const data = await res.json();
        setMintedSdkToken(data.plaintextTokenShownOnce || null);
        setStatusMsg('Scoped 90-day sdk_ module token minted (SHA-256 hash stored; copy plaintext now).');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReview = async (externalId: string, decision: 'Approved internally' | 'Changes requested') => {
    setBusy(true);
    try {
      const res = await fetch('/api/rpc/research/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: 'sovereign.research.orbital',
          externalId,
          decision,
          rationale: `Owner review in Stardusk Sovereign Portal (${decision}).`,
        }),
      });
      if (res.ok) {
        await loadState();
        setStatusMsg(`Recorded "${decision}" on ${externalId} (+Nanotransaction SOV minted).`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRemoteSync = async () => {
    if (!remoteOrigin || !remoteToken) {
      setStatusMsg('Enter published Runable Stardusk HTTPS origin and sdk_ module token to sync remotely.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/rpc/research/sync-remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starduskOrigin: remoteOrigin,
          moduleToken: remoteToken,
          moduleId: 'sovereign.research.orbital',
        }),
      });
      const data = await res.json();
      setStatusMsg(
        data.ok
          ? `Synced Workstreams 1 & 2 to ${remoteOrigin} (ingest ${data.ingestStatus}, decisions ${data.decisionsStatus}).`
          : `Remote sync error: ${data.error || 'Rejected'}`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-4 mt-3 rounded-xl border border-cyan-500/30 bg-[#080E18]/95 p-3.5 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white uppercase tracking-wide">
            Stardusk Uncrewed Orbital Research Lab · Runable ↔ Sovereign OS Bridge (Contract v1.0)
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            /api/rpc/research/ingest + /decisions LIVE
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="stardusk-bridge/contract.json"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px]"
          >
            <FileText className="w-3 h-3" />
            <span>contract.json</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] cursor-pointer"
          >
            {expanded ? 'Collapse' : 'Expand Bridge'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mt-3 pt-3 border-t border-slate-800/80">
          {/* Workstreams 1 & 2 */}
          <div className="lg:col-span-7 space-y-2">
            <div className="text-[10px] uppercase text-slate-400 font-semibold">
              Supervised Orbital Lab Workstreams (moduleId: sovereign.research.orbital · External Execution: FALSE)
            </div>
            {records.map((r) => (
              <div key={r.recordId} className="p-2.5 rounded-lg bg-[#05080F] border border-slate-800 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      {r.kind}
                    </span>
                    <span className="font-bold text-white text-[11px]">{r.title}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {r.currentStatus}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{r.summary}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>ID: {r.externalId}</span>
                    <span>·</span>
                    <span>Evidence: {r.evidence}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleReview(r.externalId, 'Approved internally')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Approve Internally
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleReview(r.externalId, 'Changes requested')}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] cursor-pointer"
                    >
                      Request Changes
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Scoped sdk_ Credential Mint + Runable Sync */}
          <div className="lg:col-span-5 space-y-2.5 bg-[#05080F] border border-slate-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-cyan-300 font-semibold">
                Scoped Module Credential &amp; Runable Sync
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleMintToken}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 text-[10px] cursor-pointer"
                >
                  <Key className="w-3 h-3" />
                  Mint sdk_ Token
                </button>
                {exportJson && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(exportJson);
                      setStatusMsg('Copied v1.0 Stardusk Research Brief JSON to clipboard.');
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    Copy v1.0 JSON
                  </button>
                )}
              </div>
            </div>

            {mintedSdkToken && (
              <div className="p-2 rounded bg-emerald-950/40 border border-emerald-500/40 space-y-1">
                <div className="text-[10px] text-emerald-300 font-bold">One-Time Scoped Module Token (90d · research:ingest + decisions:read):</div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[10px] text-white break-all">{mintedSdkToken}</code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(mintedSdkToken)}
                    className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 text-[10px] shrink-0 cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <input
                type="url"
                value={remoteOrigin}
                onChange={(e) => setRemoteOrigin(e.target.value)}
                placeholder="https://<published-stardusk-origin>"
                className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-[11px] text-white"
              />
              <input
                type="password"
                value={remoteToken}
                onChange={(e) => setRemoteToken(e.target.value)}
                placeholder="sdk_..."
                className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-[11px] text-white"
              />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleRemoteSync}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-semibold text-[11px] cursor-pointer"
            >
              {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Sync Sovereign OS Brief ↔ Runable Stardusk Control Center</span>
            </button>

            {statusMsg && (
              <div className="text-[10px] text-cyan-300 bg-cyan-950/30 border border-cyan-500/20 rounded px-2 py-1">
                {statusMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StarduskOrbitalBridgePanel;
