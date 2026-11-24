import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileJson,
  Filter,
  Hash,
  KeyRound,
  Link2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  TrendingUp,
} from 'lucide-react';

export interface ComplianceContextData {
  txHash?: string;
  pair?: string;
  venue?: string;
  strategy?: string;
  amount?: number | string;
  executionPrice?: number;
  spreadPct?: number;
  netAlphaUsd?: number;
  auditId?: string;
  blockHeight?: number;
  [key: string]: unknown;
}

export interface ComplianceBlockRecord {
  blockHeight: number;
  timestamp: string;
  actor: string;
  action: string;
  prevHash: string;
  hash: string;
  hmacAlgorithm: 'HMAC-SHA256';
  hmacSignature: string;
  status: string;
  contextData?: ComplianceContextData;
}

export interface EnrichedComplianceBlock extends ComplianceBlockRecord {
  isLinkValid: boolean;
  isHashValid: boolean;
  isSignatureValid: boolean;
  isExecutedTrade: boolean;
  integrityScore: number;
}

interface ChainApiResponse {
  complianceChain: ComplianceBlockRecord[];
  enrichedBlocks: EnrichedComplianceBlock[];
  chainIntegrityPct: number;
  totalBlocks: number;
  verifiedLinks: number;
  executedTradeCount: number;
}

interface VerifyApiResponse {
  valid: boolean;
  chainIntegrityPct: number;
  totalBlocks: number;
  verifiedLinks: number;
  executedTradeCount: number;
  brokenBlocks: number[];
  verifiedAt: string;
  algorithm: 'HMAC-SHA256';
}

type FilterMode = 'ALL' | 'EXECUTED_TRADES' | 'VERIFIED_LINKS';
type ViewMode = 'EXPLORER' | 'RAW_JSON';

const MONO_FONT_STYLE: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontVariantNumeric: 'tabular-nums',
};

function truncateHash(value: string, start = 12, end = 8): string {
  if (!value) return '—';
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatUsd(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const ComplianceAuditViewer: React.FC = () => {
  const [chainData, setChainData] = useState<ChainApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastVerifiedReport, setLastVerifiedReport] = useState<VerifyApiResponse | null>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('EXPLORER');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedHeight, setSelectedHeight] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchChain = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/compliance/chain');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to load compliance chain`);
      }
      const data: ChainApiResponse = await response.json();
      setChainData(data);
      setSelectedHeight((prev) => {
        if (prev !== null && data.enrichedBlocks.some((b) => b.blockHeight === prev)) {
          return prev;
        }
        return data.enrichedBlocks.length > 0
          ? data.enrichedBlocks[data.enrichedBlocks.length - 1].blockHeight
          : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch compliance chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchChain();
  }, [fetchChain]);

  const handleVerifyChain = async () => {
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch('/api/compliance/verify', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Verification failed`);
      }
      const report: VerifyApiResponse = await response.json();
      setLastVerifiedReport(report);
      await fetchChain();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chain verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1600);
    } catch {
      // Fallback ignored if clipboard permissions are restricted
    }
  };

  const handleExportJson = () => {
    if (!chainData) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `compliance_chain_audit_${timestamp}.json`;
    const payload = JSON.stringify(chainData.complianceChain, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const filteredBlocks = useMemo(() => {
    const blocks = chainData?.enrichedBlocks ?? [];
    const q = searchQuery.trim().toLowerCase();

    return blocks
      .filter((block) => {
        if (filterMode === 'EXECUTED_TRADES' && !block.isExecutedTrade) return false;
        if (
          filterMode === 'VERIFIED_LINKS' &&
          !(block.isLinkValid && block.isHashValid && block.isSignatureValid)
        ) {
          return false;
        }
        if (!q) return true;

        const haystack = [
          String(block.blockHeight),
          `#${block.blockHeight}`,
          block.hash,
          block.prevHash,
          block.actor,
          block.action,
          block.status,
          block.hmacSignature,
          block.contextData?.pair ?? '',
          block.contextData?.txHash ?? '',
          block.contextData?.venue ?? '',
          block.contextData?.auditId ?? '',
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(q);
      })
      .slice()
      .reverse();
  }, [chainData, filterMode, searchQuery]);

  const selectedBlock = useMemo(() => {
    const blocks = chainData?.enrichedBlocks ?? [];
    if (selectedHeight !== null) {
      const match = blocks.find((b) => b.blockHeight === selectedHeight);
      if (match) return match;
    }
    return filteredBlocks[0] ?? blocks[blocks.length - 1] ?? null;
  }, [chainData, filteredBlocks, selectedHeight]);

  const selectedRawBlock = useMemo(() => {
    if (!selectedBlock || !chainData) return null;
    return (
      chainData.complianceChain.find((b) => b.blockHeight === selectedBlock.blockHeight) ?? null
    );
  }, [chainData, selectedBlock]);

  const integrityPct = chainData?.chainIntegrityPct ?? 100;
  const isChainHealthy = integrityPct === 100;

  return (
    <div
      className="min-h-screen w-full text-slate-100 p-4 md:p-6"
      style={{ backgroundColor: '#080B10' }}
    >
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Institutional Header */}
        <div
          className="rounded-lg border border-slate-800/90 p-4 md:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
          style={{ backgroundColor: '#0D121B' }}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-semibold tracking-tight text-slate-100">
                  Cryptographic Compliance &amp; Audit Chain
                </h1>
                <p className="text-xs text-slate-400">
                  Append-only SHA-256 hash linkage with HMAC-SHA256 institutional attestation
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'EXPLORER' ? 'RAW_JSON' : 'EXPLORER')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                viewMode === 'RAW_JSON'
                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                  : 'border-slate-700/80 bg-slate-900/70 text-slate-300 hover:border-slate-600 hover:text-white'
              }`}
            >
              {viewMode === 'RAW_JSON' ? (
                <>
                  <Terminal className="w-3.5 h-3.5" />
                  Block Explorer
                </>
              ) : (
                <>
                  <FileJson className="w-3.5 h-3.5" />
                  Raw Array JSON
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              disabled={!chainData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-slate-700/80 bg-slate-900/70 text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export Audit JSON
            </button>

            <button
              type="button"
              onClick={() => void handleVerifyChain()}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
              {verifying ? 'Verifying...' : 'Re-Verify Chain'}
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            className="rounded-lg border border-slate-800/90 p-3.5"
            style={{ backgroundColor: '#0D121B' }}
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400">
              <span>Chain Integrity</span>
              {isChainHealthy ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <div
              className={`mt-1.5 text-2xl font-semibold ${
                isChainHealthy ? 'text-emerald-400' : 'text-rose-400'
              }`}
              style={MONO_FONT_STYLE}
            >
              {integrityPct.toFixed(2)}%
            </div>
            <div className="mt-1 text-[11px] text-slate-500" style={MONO_FONT_STYLE}>
              {lastVerifiedReport
                ? `Verified ${new Date(lastVerifiedReport.verifiedAt).toLocaleTimeString()}`
                : 'HMAC-SHA256 Continuity'}
            </div>
          </div>

          <div
            className="rounded-lg border border-slate-800/90 p-3.5"
            style={{ backgroundColor: '#0D121B' }}
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400">
              <span>Total Blocks</span>
              <Hash className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold text-slate-100" style={MONO_FONT_STYLE}>
              {chainData?.totalBlocks ?? 0}
            </div>
            <div className="mt-1 text-[11px] text-slate-500" style={MONO_FONT_STYLE}>
              Genesis #0 → Tip #{Math.max(0, (chainData?.totalBlocks ?? 1) - 1)}
            </div>
          </div>

          <div
            className="rounded-lg border border-slate-800/90 p-3.5"
            style={{ backgroundColor: '#0D121B' }}
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400">
              <span>Verified Links</span>
              <Link2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold text-slate-100" style={MONO_FONT_STYLE}>
              {chainData?.verifiedLinks ?? 0} / {chainData?.totalBlocks ?? 0}
            </div>
            <div className="mt-1 text-[11px] text-slate-500" style={MONO_FONT_STYLE}>
              prevHash === previous.hash
            </div>
          </div>

          <div
            className="rounded-lg border border-slate-800/90 p-3.5"
            style={{ backgroundColor: '#0D121B' }}
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400">
              <span>Executed Trades</span>
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold text-slate-100" style={MONO_FONT_STYLE}>
              {chainData?.executedTradeCount ?? 0}
            </div>
            <div className="mt-1 text-[11px] text-slate-500" style={MONO_FONT_STYLE}>
              Attested On-Chain / Venue
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void fetchChain()}
              className="underline hover:text-rose-200"
            >
              Retry
            </button>
          </div>
        )}

        {viewMode === 'RAW_JSON' ? (
          /* Raw Array JSON Inspector */
          <div
            className="rounded-lg border border-slate-800/90 overflow-hidden"
            style={{ backgroundColor: '#0D121B' }}
          >
            <div className="px-4 py-3 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Raw complianceChain[] JSON Inspector
                </span>
                <span
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300"
                  style={MONO_FONT_STYLE}
                >
                  {chainData?.complianceChain.length ?? 0} records
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    chainData &&
                    void handleCopy(JSON.stringify(chainData.complianceChain, null, 2), 'raw-array')
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
                >
                  {copiedKey === 'raw-array' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Array JSON
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .json
                </button>
              </div>
            </div>
            <pre
              className="p-4 text-xs text-slate-300 overflow-auto max-h-[620px] leading-relaxed"
              style={{ ...MONO_FONT_STYLE, backgroundColor: '#080B10' }}
            >
              {JSON.stringify(chainData?.complianceChain ?? [], null, 2)}
            </pre>
          </div>
        ) : (
          /* Block Hash Explorer + Executed Trade Drill-Down */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Block Hash Explorer & Filtering */}
            <div
              className="lg:col-span-5 rounded-lg border border-slate-800/90 flex flex-col overflow-hidden"
              style={{ backgroundColor: '#0D121B' }}
            >
              <div className="p-3.5 border-b border-slate-800/90 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                      Block Hash Explorer
                    </h2>
                  </div>
                  <span className="text-[11px] text-slate-400" style={MONO_FONT_STYLE}>
                    {filteredBlocks.length} shown
                  </span>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search height, hash, actor, action, pair, tx..."
                    className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-800 bg-[#080B10] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
                    style={MONO_FONT_STYLE}
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: 'ALL' },
                      { id: 'EXECUTED_TRADES', label: 'Executed Trades' },
                      { id: 'VERIFIED_LINKS', label: 'Verified Links' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilterMode(tab.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                        filterMode === tab.id
                          ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                          : 'border-slate-800 bg-[#080B10] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Block List */}
              <div className="divide-y divide-slate-800/80 overflow-y-auto max-h-[600px]">
                {loading && !chainData ? (
                  <div className="p-6 text-center text-xs text-slate-500" style={MONO_FONT_STYLE}>
                    Loading cryptographic audit chain...
                  </div>
                ) : filteredBlocks.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No blocks match the current filter criteria.
                  </div>
                ) : (
                  filteredBlocks.map((block) => {
                    const isSelected = selectedBlock?.blockHeight === block.blockHeight;
                    const verified =
                      block.isLinkValid && block.isHashValid && block.isSignatureValid;
                    return (
                      <button
                        key={block.blockHeight}
                        type="button"
                        onClick={() => setSelectedHeight(block.blockHeight)}
                        className={`w-full text-left p-3.5 transition-colors ${
                          isSelected
                            ? 'bg-cyan-500/10 border-l-2 border-l-cyan-400'
                            : 'hover:bg-slate-800/40 border-l-2 border-l-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="text-xs font-semibold text-cyan-300 shrink-0"
                              style={MONO_FONT_STYLE}
                            >
                              #{String(block.blockHeight).padStart(4, '0')}
                            </span>
                            <span className="text-xs font-medium text-slate-100 truncate">
                              {block.action}
                            </span>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${
                              verified
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                            }`}
                            style={MONO_FONT_STYLE}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {block.integrityScore}%
                          </span>
                        </div>

                        <div
                          className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400"
                          style={MONO_FONT_STYLE}
                        >
                          <span className="truncate">{block.actor}</span>
                          {block.contextData?.pair && (
                            <span className="text-amber-300 shrink-0 ml-2">
                              {block.contextData.pair}
                            </span>
                          )}
                        </div>

                        <div
                          className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500"
                          style={MONO_FONT_STYLE}
                        >
                          <span>HASH {truncateHash(block.hash, 10, 6)}</span>
                          <span>{new Date(block.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Executed Trade Drill-Down Panel */}
            <div
              className="lg:col-span-7 rounded-lg border border-slate-800/90 flex flex-col overflow-hidden"
              style={{ backgroundColor: '#0D121B' }}
            >
              {!selectedBlock ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  Select a block from the explorer to inspect cryptographic linkage and trade
                  metadata.
                </div>
              ) : (
                <div className="p-4 md:p-5 space-y-5 overflow-y-auto max-h-[710px]">
                  {/* Drill-Down Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-800/90">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"
                          style={MONO_FONT_STYLE}
                        >
                          BLOCK #{String(selectedBlock.blockHeight).padStart(4, '0')}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-200">
                          {selectedBlock.status}
                        </span>
                        {selectedBlock.isExecutedTrade && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300">
                            EXECUTED TRADE
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-slate-100">
                        {selectedBlock.action}
                      </h3>
                      <div className="mt-1 text-xs text-slate-400" style={MONO_FONT_STYLE}>
                        {selectedBlock.timestamp}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400">
                        Integrity Score
                      </div>
                      <div
                        className={`text-xl font-semibold ${
                          selectedBlock.integrityScore === 100
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                        style={MONO_FONT_STYLE}
                      >
                        {selectedBlock.integrityScore}%
                      </div>
                      <div className="text-[11px] text-slate-500" style={MONO_FONT_STYLE}>
                        {selectedBlock.hmacAlgorithm}
                      </div>
                    </div>
                  </div>

                  {/* Cryptographic Hash Linkage */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                      <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                      Cryptographic Hash Linkage
                    </div>

                    <div
                      className="rounded border border-slate-800/90 p-3 space-y-2.5"
                      style={{ backgroundColor: '#080B10' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">
                            Block SHA-256 Hash
                          </div>
                          <div
                            className="text-xs text-emerald-300 break-all mt-0.5"
                            style={MONO_FONT_STYLE}
                          >
                            {selectedBlock.hash}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopy(selectedBlock.hash, 'block-hash')}
                          className="shrink-0 p-1.5 rounded border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-white"
                          title="Copy block hash"
                        >
                          {copiedKey === 'block-hash' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="border-t border-slate-800/80 pt-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">
                            Previous Block Hash (prevHash)
                          </div>
                          <div
                            className="text-xs text-slate-300 break-all mt-0.5"
                            style={MONO_FONT_STYLE}
                          >
                            {selectedBlock.prevHash}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopy(selectedBlock.prevHash, 'prev-hash')}
                          className="shrink-0 p-1.5 rounded border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-white"
                          title="Copy previous hash"
                        >
                          {copiedKey === 'prev-hash' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Signer Identity & Correlated Trade Metadata */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      Signer Identity &amp; Correlated Trade Metadata
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div
                        className="rounded border border-slate-800/90 p-3"
                        style={{ backgroundColor: '#080B10' }}
                      >
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">
                          Signer Identity (Actor)
                        </div>
                        <div className="mt-1 text-xs text-slate-100" style={MONO_FONT_STYLE}>
                          {selectedBlock.actor}
                        </div>
                      </div>

                      <div
                        className="rounded border border-slate-800/90 p-3"
                        style={{ backgroundColor: '#080B10' }}
                      >
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">
                          Pair / Venue
                        </div>
                        <div className="mt-1 text-xs text-slate-100" style={MONO_FONT_STYLE}>
                          {selectedBlock.contextData?.pair ?? '—'}
                          {selectedBlock.contextData?.venue
                            ? ` · ${selectedBlock.contextData.venue}`
                            : ''}
                        </div>
                      </div>

                      <div
                        className="rounded border border-slate-800/90 p-3"
                        style={{ backgroundColor: '#080B10' }}
                      >
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">
                          Amount / Execution Price
                        </div>
                        <div className="mt-1 text-xs text-slate-100" style={MONO_FONT_STYLE}>
                          {selectedBlock.contextData?.amount !== undefined
                            ? String(selectedBlock.contextData.amount)
                            : '—'}
                          {' @ '}
                          {selectedBlock.contextData?.executionPrice !== undefined
                            ? `$${selectedBlock.contextData.executionPrice.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4,
                              })}`
                            : '—'}
                        </div>
                      </div>

                      <div
                        className="rounded border border-slate-800/90 p-3"
                        style={{ backgroundColor: '#080B10' }}
                      >
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">
                          Net Alpha (USD) / Status
                        </div>
                        <div className="mt-1 text-xs flex items-center gap-2" style={MONO_FONT_STYLE}>
                          <span
                            className={
                              (selectedBlock.contextData?.netAlphaUsd ?? 0) > 0
                                ? 'text-emerald-400 font-semibold'
                                : 'text-slate-200'
                            }
                          >
                            {formatUsd(selectedBlock.contextData?.netAlphaUsd)}
                          </span>
                          <span className="text-slate-500">·</span>
                          <span className="text-cyan-300">{selectedBlock.status}</span>
                        </div>
                      </div>

                      <div
                        className="sm:col-span-2 rounded border border-slate-800/90 p-3 flex items-center justify-between gap-2"
                        style={{ backgroundColor: '#080B10' }}
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">
                            Transaction Hash (txHash)
                          </div>
                          <div
                            className="mt-1 text-xs text-slate-200 break-all"
                            style={MONO_FONT_STYLE}
                          >
                            {selectedBlock.contextData?.txHash ?? 'N/A (Off-Chain Governance Event)'}
                          </div>
                        </div>
                        {selectedBlock.contextData?.txHash && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopy(selectedBlock.contextData?.txHash ?? '', 'tx-hash')
                            }
                            className="shrink-0 p-1.5 rounded border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-white"
                            title="Copy txHash"
                          >
                            {copiedKey === 'tx-hash' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      <div
                        className="sm:col-span-2 rounded border border-slate-800/90 p-3 flex items-center justify-between gap-2"
                        style={{ backgroundColor: '#080B10' }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                            <KeyRound className="w-3 h-3 text-emerald-400" />
                            HMAC-SHA256 Signature
                          </div>
                          <div
                            className="mt-1 text-xs text-emerald-300/90 break-all"
                            style={MONO_FONT_STYLE}
                          >
                            {selectedBlock.hmacSignature}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(selectedBlock.hmacSignature, 'hmac-sig')
                          }
                          className="shrink-0 p-1.5 rounded border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-white"
                          title="Copy HMAC signature"
                        >
                          {copiedKey === 'hmac-sig' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Raw ComplianceBlock JSON Payload */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                        <FileJson className="w-3.5 h-3.5 text-cyan-400" />
                        Raw ComplianceBlock JSON Payload
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          selectedRawBlock &&
                          void handleCopy(
                            JSON.stringify(selectedRawBlock, null, 2),
                            'single-block-json'
                          )
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-slate-800 bg-[#080B10] text-slate-300 hover:border-slate-600"
                      >
                        {copiedKey === 'single-block-json' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy JSON
                          </>
                        )}
                      </button>
                    </div>
                    <pre
                      className="rounded border border-slate-800/90 p-3 text-xs text-slate-300 overflow-x-auto leading-relaxed"
                      style={{ ...MONO_FONT_STYLE, backgroundColor: '#080B10' }}
                    >
                      {JSON.stringify(selectedRawBlock ?? selectedBlock, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComplianceAuditViewer;
