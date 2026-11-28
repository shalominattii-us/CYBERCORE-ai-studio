import React, { useState, useEffect, useCallback } from 'react';
import { Shield, CheckCircle2, Copy, RefreshCw, ExternalLink, FileText } from 'lucide-react';

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
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch('/api/rpc/research/state', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        setRecords([]);
        setExportJson('');
        setStatusMsg('Studio operator session required. Sign in through Cloudflare Access. This panel does not mint or accept a module token.');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.records)) setRecords(data.records);
        if (data.exportBriefV1) {
          setExportJson(JSON.stringify(data.exportBriefV1, null, 2).replace(/sdk_[A-Za-z0-9_-]+/g, '[redacted]'));
        }
      }
    } catch {
      setStatusMsg('Research state is unavailable.');
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleReview = async (externalId: string, decision: 'Approved internally' | 'Changes requested') => {
    setBusy(true);
    try {
      const res = await fetch('/api/rpc/research/review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: 'sovereign.research.orbital',
          externalId,
          decision,
          rationale: `Owner review in Stardusk Sovereign Portal (${decision}).`,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setStatusMsg('Studio operator session required before a review can be recorded.');
        return;
      }
      if (res.ok) {
        await loadState();
        setStatusMsg(`Recorded "${decision}" on ${externalId}.`);
      }
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

          <div className="lg:col-span-5 space-y-2.5 bg-[#05080F] border border-slate-800 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase text-cyan-300 font-semibold">
                Operator session · no module token in the browser
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void loadState()}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
                  Refresh
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
            <p className="text-[11px] text-slate-400 leading-relaxed">
              State, review, and token minting require a studio operator session. Remote sync reads STARDUSK_ORIGIN and STARDUSK_MODULE_TOKEN on the server only. Reviewed decisions for the avatar desk use STARDUSK_DESK_TOKEN and never appear in this browser as a credential.
            </p>

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
