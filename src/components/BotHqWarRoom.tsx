import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  GitBranch,
  Hash,
  Lock,
  Pause,
  Play,
  Plus,
  Radio,
  Send,
  Shield,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

type BotStatus = 'Working' | 'Needs you' | 'Idle';
type BotId = 'hermes-arb' | 'aether-ofi' | 'sentinel-risk' | 'alpha-scout';

interface BotAgent {
  id: BotId;
  name: string;
  handle: string;
  role: string;
  screen: string;
  cdpPort: number;
  status: BotStatus;
  specialty: string;
  queueDepth: number;
  lastHeartbeat: string;
  metrics: {
    latencyMs: number;
    tasksCompleted: number;
    activeSubagents: number;
  };
}

interface Channel {
  id: string;
  name: string;
  type: 'group' | 'dm';
  botId?: BotId;
  description: string;
  unreadCount: number;
}

interface ToolCallTrace {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  output: string;
  durationMs: number;
  status: 'ok' | 'blocked' | 'pending_approval';
}

interface TranscriptMessage {
  id: string;
  revision: number;
  channelId: string;
  senderId: string;
  senderName: string;
  senderType: 'operator' | 'bot' | 'subagent' | 'system';
  content: string;
  mentions: string[];
  timestamp: string;
  toolTraces?: ToolCallTrace[];
  approvalId?: string;
}

interface ApprovalCard {
  id: string;
  botId: BotId;
  botName: string;
  channelId: string;
  actionType: string;
  summary: string;
  policyKey: string;
  payload: Record<string, unknown>;
  riskCheck: {
    dailyDrawdownPct: number;
    maxDrawdownCapPct: number;
    estimatedSlippagePct: number;
    maxSlippagePct: number;
    gasGwei: number;
    maxGasGwei: number;
    kellyFraction: number;
    verifiedBaseL2BalanceUsd: number;
  };
  status: 'pending' | 'allowed' | 'always_allowed' | 'denied';
  createdAt: string;
  resolvedAt?: string;
}

interface AutoAllowPolicy {
  id: string;
  policyKey: string;
  botId: BotId;
  actionType: string;
  createdAt: string;
  matchCount: number;
}

interface Routine {
  id: string;
  name: string;
  triggerType: 'cron' | 'event';
  triggerExpr: string;
  targetBotId: BotId;
  channelId: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  runCount: number;
}

interface DelegatedSubagent {
  id: string;
  parentBotId: BotId;
  name: string;
  pair: string;
  objective: string;
  status: 'spawning' | 'analyzing' | 'reported' | 'terminated';
  spreadBps: number;
  finding: string;
  createdAt: string;
  reportedAt?: string;
}

interface MemoryEntry {
  id: string;
  section: 'INVARIANTS' | 'RISK_LIMITS' | 'EXECUTION_NOTES' | 'ALPHA_INTEL';
  title: string;
  content: string;
  author: string;
  updatedAt: string;
  locked?: boolean;
}

interface BotHqState {
  revision: number;
  verifiedBaseL2BalanceUsd: number;
  bots: BotAgent[];
  channels: Channel[];
  messages: TranscriptMessage[];
  approvals: ApprovalCard[];
  autoAllowPolicies: AutoAllowPolicy[];
  routines: Routine[];
  subagents: DelegatedSubagent[];
  memory: MemoryEntry[];
}

type RightTab = 'routines' | 'subagents' | 'memory';

const STATUS_STYLES: Record<BotStatus, { dot: string; badge: string }> = {
  Working: {
    dot: 'bg-emerald-400 animate-pulse',
    badge: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  },
  'Needs you': {
    dot: 'bg-amber-400 animate-pulse',
    badge: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  },
  Idle: {
    dot: 'bg-slate-400',
    badge: 'text-slate-300 bg-slate-500/10 border-slate-600/40',
  },
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const BotHqWarRoom: React.FC = () => {
  const [state, setState] = useState<BotHqState | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string>('championship-war-room');
  const [rightTab, setRightTab] = useState<RightTab>('routines');
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Composer
  const [draft, setDraft] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>({});

  // Routine form
  const [showAddRoutine, setShowAddRoutine] = useState<boolean>(false);
  const [routineName, setRoutineName] = useState<string>('');
  const [routineTriggerType, setRoutineTriggerType] = useState<'cron' | 'event'>('event');
  const [routineTriggerExpr, setRoutineTriggerExpr] = useState<string>('event:SPREAD_GT_0.50');
  const [routineBotId, setRoutineBotId] = useState<BotId>('hermes-arb');
  const [routinePrompt, setRoutinePrompt] = useState<string>('');

  // Subagent form
  const [subParentBot, setSubParentBot] = useState<BotId>('hermes-arb');
  const [subPair, setSubPair] = useState<string>('ETH-USDC');
  const [subObjective, setSubObjective] = useState<string>('');

  // Memory form
  const [memSection, setMemSection] = useState<MemoryEntry['section']>('EXECUTION_NOTES');
  const [memTitle, setMemTitle] = useState<string>('');
  const [memContent, setMemContent] = useState<string>('');

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadInitial = async () => {
      try {
        const res = await fetch('/api/bot-hq/state');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as BotHqState;
        if (mounted) {
          setState(data);
          setErrorBanner(null);
        }
      } catch (err) {
        if (mounted) {
          setErrorBanner(err instanceof Error ? err.message : 'Failed to load Bot-HQ state');
        }
      }
    };
    void loadInitial();

    const es = new EventSource('/api/bot-hq/events');
    es.addEventListener('connected', () => {
      if (mounted) setSseConnected(true);
    });
    es.onerror = () => {
      if (mounted) setSseConnected(false);
    };

    es.addEventListener('bot_status', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as {
        botId: BotId;
        status: BotStatus;
        queueDepth: number;
        lastHeartbeat: string;
        metrics: BotAgent['metrics'];
      };
      setState((prev) =>
        prev
          ? {
              ...prev,
              bots: prev.bots.map((b) =>
                b.id === payload.botId
                  ? {
                      ...b,
                      status: payload.status,
                      queueDepth: payload.queueDepth,
                      lastHeartbeat: payload.lastHeartbeat,
                      metrics: payload.metrics,
                    }
                  : b
              ),
            }
          : prev
      );
    });

    es.addEventListener('message', (evt) => {
      const msg = JSON.parse((evt as MessageEvent).data) as TranscriptMessage;
      setState((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return {
          ...prev,
          revision: Math.max(prev.revision, msg.revision),
          messages: [...prev.messages, msg],
        };
      });
    });

    es.addEventListener('approval', (evt) => {
      const card = JSON.parse((evt as MessageEvent).data) as ApprovalCard;
      setState((prev) => {
        if (!prev) return prev;
        const exists = prev.approvals.some((a) => a.id === card.id);
        return {
          ...prev,
          approvals: exists
            ? prev.approvals.map((a) => (a.id === card.id ? card : a))
            : [card, ...prev.approvals],
        };
      });
    });

    es.addEventListener('policy', (evt) => {
      const policy = JSON.parse((evt as MessageEvent).data) as AutoAllowPolicy;
      setState((prev) => {
        if (!prev) return prev;
        if (prev.autoAllowPolicies.some((p) => p.id === policy.id)) return prev;
        return { ...prev, autoAllowPolicies: [policy, ...prev.autoAllowPolicies] };
      });
    });

    es.addEventListener('routine', (evt) => {
      const routine = JSON.parse((evt as MessageEvent).data) as Routine;
      setState((prev) => {
        if (!prev) return prev;
        const exists = prev.routines.some((r) => r.id === routine.id);
        return {
          ...prev,
          routines: exists
            ? prev.routines.map((r) => (r.id === routine.id ? routine : r))
            : [routine, ...prev.routines],
        };
      });
    });

    es.addEventListener('subagent', (evt) => {
      const sub = JSON.parse((evt as MessageEvent).data) as DelegatedSubagent;
      setState((prev) => {
        if (!prev) return prev;
        const exists = prev.subagents.some((s) => s.id === sub.id);
        return {
          ...prev,
          subagents: exists
            ? prev.subagents.map((s) => (s.id === sub.id ? sub : s))
            : [sub, ...prev.subagents],
        };
      });
    });

    es.addEventListener('memory', (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as
        | { action: 'added'; entry: MemoryEntry }
        | { action: 'deleted'; id: string };
      setState((prev) => {
        if (!prev) return prev;
        if (payload.action === 'added') {
          if (prev.memory.some((m) => m.id === payload.entry.id)) return prev;
          return { ...prev, memory: [...prev.memory, payload.entry] };
        }
        return { ...prev, memory: prev.memory.filter((m) => m.id !== payload.id) };
      });
    });

    return () => {
      mounted = false;
      es.close();
    };
  }, []);

  const channelMessages = useMemo(() => {
    if (!state) return [];
    return state.messages.filter((m) => m.channelId === activeChannelId);
  }, [state, activeChannelId]);

  const approvalById = useMemo(() => {
    const map = new Map<string, ApprovalCard>();
    if (state) {
      for (const a of state.approvals) map.set(a.id, a);
    }
    return map;
  }, [state]);

  const activeChannel = useMemo(
    () => state?.channels.find((c) => c.id === activeChannelId) ?? null,
    [state, activeChannelId]
  );

  const pendingApprovalsCount = useMemo(
    () => state?.approvals.filter((a) => a.status === 'pending').length ?? 0,
    [state]
  );

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length, activeChannelId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/bot-hq/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannelId, content: draft.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setDraft('');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleResolveApproval = async (id: string, decision: 'allow' | 'always_allow' | 'deny') => {
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/bot-hq/approvals/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to resolve approval');
    }
  };

  const handleRunRoutine = async (id: string) => {
    setErrorBanner(null);
    try {
      await fetch(`/api/bot-hq/routines/${id}/run`, { method: 'POST' });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to run routine');
    }
  };

  const handleToggleRoutine = async (id: string) => {
    setErrorBanner(null);
    try {
      await fetch(`/api/bot-hq/routines/${id}/toggle`, { method: 'PATCH' });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to toggle routine');
    }
  };

  const handleAddRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routineName.trim() || !routineTriggerExpr.trim() || !routinePrompt.trim()) return;
    setErrorBanner(null);
    try {
      const res = await fetch('/api/bot-hq/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: routineName.trim(),
          triggerType: routineTriggerType,
          triggerExpr: routineTriggerExpr.trim(),
          targetBotId: routineBotId,
          prompt: routinePrompt.trim(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRoutineName('');
      setRoutinePrompt('');
      setShowAddRoutine(false);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to add routine');
    }
  };

  const handleSpawnSubagent = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    try {
      const res = await fetch('/api/bot-hq/subagents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentBotId: subParentBot,
          pair: subPair.trim() || 'ETH-USDC',
          objective: subObjective.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSubObjective('');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to spawn subagent');
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memTitle.trim() || !memContent.trim()) return;
    setErrorBanner(null);
    try {
      const res = await fetch('/api/bot-hq/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: memSection,
          title: memTitle.trim(),
          content: memContent.trim(),
          author: 'Commander',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMemTitle('');
      setMemContent('');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to save memory entry');
    }
  };

  const handleDeleteMemory = async (id: string) => {
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/bot-hq/memory/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to delete memory entry');
    }
  };

  const toggleTrace = (msgId: string) => {
    setExpandedTraces((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const insertMention = (handle: string) => {
    setDraft((prev) => (prev.includes(handle) ? prev : `${handle} ${prev}`.trimStart()));
  };

  return (
    <div
      className="min-h-[calc(100vh-4rem)] w-full bg-[#080B10] text-slate-100 flex flex-col"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Top Institutional Telemetry Bar */}
      <header className="h-12 px-4 bg-[#0D121B] border-b border-slate-800/80 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-slate-100">
                BOT-HQ // MULTI-AGENT WAR ROOM
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono tabular-nums rounded bg-slate-800/90 border border-slate-700/70 text-cyan-300">
                REV {state?.revision ?? 0}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono tabular-nums">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#080B10] border border-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">BASE L2 BAL:</span>
            <span className="text-emerald-300 font-semibold">
              ${(state?.verifiedBaseL2BalanceUsd ?? 0).toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#080B10] border border-slate-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">PENDING APPROVALS:</span>
            <span className={pendingApprovalsCount > 0 ? 'text-amber-300 font-semibold' : 'text-slate-300'}>
              {pendingApprovalsCount}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#080B10] border border-slate-800">
            <Radio className={`w-3.5 h-3.5 ${sseConnected ? 'text-emerald-400' : 'text-rose-400'}`} />
            <span className={sseConnected ? 'text-emerald-300' : 'text-rose-300'}>
              {sseConnected ? 'SSE LIVE' : 'RECONNECTING'}
            </span>
          </div>
        </div>
      </header>

      {errorBanner && (
        <div className="px-4 py-2 bg-rose-950/60 border-b border-rose-500/30 text-rose-200 text-xs flex items-center justify-between">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-300 hover:text-white"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main 3-Column Institutional Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* LEFT RAIL: Channels & Squad Roster */}
        <aside className="lg:col-span-3 bg-[#0D121B] border-r border-slate-800/80 flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-800/80">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">
              War Room Channel
            </div>
            <button
              type="button"
              onClick={() => setActiveChannelId('championship-war-room')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left text-xs transition-colors border ${
                activeChannelId === 'championship-war-room'
                  ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                  : 'bg-[#080B10]/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="flex items-center gap-2 font-mono font-medium">
                <Hash className="w-3.5 h-3.5 text-cyan-400" />
                championship-war-room
              </span>
              {pendingApprovalsCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono tabular-nums rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>
          </div>

          <div className="p-3 flex-1 overflow-y-auto space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                Squad Roster ({state?.bots.length ?? 4})
              </span>
              <span className="text-[10px] font-mono text-slate-500">SERIAL QUEUES</span>
            </div>

            {(state?.bots ?? []).map((bot) => {
              const dmChannelId = `dm-${bot.id}`;
              const isSelected = activeChannelId === dmChannelId;
              const style = STATUS_STYLES[bot.status];
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => setActiveChannelId(dmChannelId)}
                  className={`w-full text-left p-2.5 rounded border transition-colors ${
                    isSelected
                      ? 'bg-slate-800/70 border-cyan-500/40'
                      : 'bg-[#080B10]/70 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                      <span className="text-xs font-semibold text-slate-100 truncate">{bot.name}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border shrink-0 ${style.badge}`}>
                      {bot.status}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 truncate mb-2">{bot.role}</div>

                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400 pt-1.5 border-t border-slate-800/70">
                    <span>
                      SCREEN <span className="text-cyan-300">{bot.screen}</span>
                    </span>
                    <span>
                      CDP <span className="text-cyan-300">:{bot.cdpPort}</span>
                    </span>
                    <span>{bot.metrics.latencyMs}ms</span>
                  </div>
                </button>
              );
            })}

            {/* Risk Envelope Summary */}
            <div className="mt-4 p-2.5 rounded bg-[#080B10] border border-slate-800/80 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                <Shield className="w-3 h-3 text-emerald-400" />
                Sentinel-Risk Guardrails
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono tabular-nums">
                <div className="px-2 py-1 rounded bg-[#0D121B] border border-slate-800/80">
                  <div className="text-slate-500">DD CAP</div>
                  <div className="text-emerald-300">-2.00%</div>
                </div>
                <div className="px-2 py-1 rounded bg-[#0D121B] border border-slate-800/80">
                  <div className="text-slate-500">SLIPPAGE</div>
                  <div className="text-emerald-300">0.15%</div>
                </div>
                <div className="px-2 py-1 rounded bg-[#0D121B] border border-slate-800/80">
                  <div className="text-slate-500">GAS MAX</div>
                  <div className="text-cyan-300">25 Gwei</div>
                </div>
                <div className="px-2 py-1 rounded bg-[#0D121B] border border-slate-800/80">
                  <div className="text-slate-500">SIZING</div>
                  <div className="text-cyan-300">0.25x Kelly</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER PANE: Live SSE Transcript + Approval Cards + @mention Input */}
        <main className="lg:col-span-5 bg-[#080B10] border-r border-slate-800/80 flex flex-col min-h-[540px] max-h-[calc(100vh-7rem)]">
          {/* Channel Header */}
          <div className="px-4 py-2.5 bg-[#0D121B]/80 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono font-semibold text-slate-100 flex items-center gap-1.5">
                {activeChannel?.type === 'group' ? (
                  <Hash className="w-3.5 h-3.5 text-cyan-400" />
                ) : (
                  <Bot className="w-3.5 h-3.5 text-cyan-400" />
                )}
                {activeChannel?.name ?? '#championship-war-room'}
              </div>
              <p className="text-[11px] text-slate-400">{activeChannel?.description}</p>
            </div>
          </div>

          {/* Transcript Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {channelMessages.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 font-mono">
                No messages in this channel yet. Mention a bot below to start a serial turn.
              </div>
            ) : (
              channelMessages.map((msg) => {
                const approval = msg.approvalId ? approvalById.get(msg.approvalId) : undefined;
                const tracesOpen = Boolean(expandedTraces[msg.id]);

                return (
                  <div
                    key={msg.id}
                    className={`p-3 rounded border ${
                      msg.senderType === 'operator'
                        ? 'bg-cyan-950/20 border-cyan-500/30'
                        : msg.senderType === 'subagent'
                        ? 'bg-indigo-950/20 border-indigo-500/30'
                        : 'bg-[#0D121B] border-slate-800/90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-100">{msg.senderName}</span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
                          {msg.senderType}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono tabular-nums text-slate-500">
                        r{msg.revision} · {formatTime(msg.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                    {/* Collapsible Tool-Call Trace Rows */}
                    {msg.toolTraces && msg.toolTraces.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/70">
                        <button
                          type="button"
                          onClick={() => toggleTrace(msg.id)}
                          className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-300 hover:text-cyan-200"
                        >
                          {tracesOpen ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          <Terminal className="w-3 h-3" />
                          <span>
                            {msg.toolTraces.length} tool call{msg.toolTraces.length > 1 ? 's' : ''}
                          </span>
                        </button>

                        {tracesOpen && (
                          <div className="mt-2 space-y-1.5">
                            {msg.toolTraces.map((tr) => (
                              <div
                                key={tr.id}
                                className="p-2 rounded bg-[#080B10] border border-slate-800 font-mono text-[11px] space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-cyan-300">{tr.tool}</span>
                                  <span className="text-slate-500 tabular-nums">{tr.durationMs}ms</span>
                                </div>
                                <div className="text-slate-400 break-all">
                                  args: {JSON.stringify(tr.args)}
                                </div>
                                <div
                                  className={
                                    tr.status === 'ok'
                                      ? 'text-emerald-300'
                                      : tr.status === 'blocked'
                                      ? 'text-rose-300'
                                      : 'text-amber-300'
                                  }
                                >
                                  out: {tr.output}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Interactive Approval Card */}
                    {approval && (
                      <div className="mt-3 p-3 rounded bg-[#080B10] border border-amber-500/40 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Approval Required · {approval.actionType}
                          </div>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            {approval.status}
                          </span>
                        </div>

                        <p className="text-xs text-slate-300">{approval.summary}</p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-mono tabular-nums">
                          <div className="p-1.5 rounded bg-[#0D121B] border border-slate-800">
                            <div className="text-slate-500">SLIPPAGE</div>
                            <div className="text-emerald-300">
                              {approval.riskCheck.estimatedSlippagePct}% / {approval.riskCheck.maxSlippagePct}%
                            </div>
                          </div>
                          <div className="p-1.5 rounded bg-[#0D121B] border border-slate-800">
                            <div className="text-slate-500">BASE GAS</div>
                            <div className="text-cyan-300">{approval.riskCheck.gasGwei} Gwei</div>
                          </div>
                          <div className="p-1.5 rounded bg-[#0D121B] border border-slate-800">
                            <div className="text-slate-500">KELLY</div>
                            <div className="text-cyan-300">{approval.riskCheck.kellyFraction}x</div>
                          </div>
                          <div className="p-1.5 rounded bg-[#0D121B] border border-slate-800">
                            <div className="text-slate-500">BASE BAL</div>
                            <div className="text-emerald-300">
                              ${approval.riskCheck.verifiedBaseL2BalanceUsd.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {approval.status === 'pending' ? (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => void handleResolveApproval(approval.id, 'allow')}
                              className="px-2.5 py-1.5 rounded text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Allow
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleResolveApproval(approval.id, 'always_allow')}
                              className="px-2.5 py-1.5 rounded text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-200 border border-cyan-500/40 flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Always allow
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleResolveApproval(approval.id, 'deny')}
                              className="px-2.5 py-1.5 rounded text-xs font-medium bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 border border-rose-500/40 flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              Don&apos;t allow
                            </button>
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono text-slate-400">
                            Resolved as <span className="text-slate-200">{approval.status}</span> at{' '}
                            {formatTime(approval.resolvedAt)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* @mention Quick Bar + Composer */}
          <form onSubmit={handleSendMessage} className="p-3 bg-[#0D121B] border-t border-slate-800/80 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {['@hermes-arb', '@aether-ofi', '@sentinel-risk', '@alpha-scout', '@all'].map((handle) => (
                <button
                  key={handle}
                  type="button"
                  onClick={() => insertMention(handle)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#080B10] border border-slate-800 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
                >
                  {handle}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${activeChannel?.name ?? '#championship-war-room'} (use @mention to route)...`}
                className="flex-1 px-3 py-2 rounded bg-[#080B10] border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="px-3 py-2 rounded bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-40 border border-cyan-500/40 text-cyan-200 text-xs font-medium flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </div>
          </form>
        </main>

        {/* RIGHT PANE: Tabbed Routines, Subagents, Tactical Memory */}
        <section className="lg:col-span-4 bg-[#0D121B] flex flex-col min-h-[540px] max-h-[calc(100vh-7rem)]">
          {/* Tabs */}
          <div className="grid grid-cols-3 border-b border-slate-800/80 bg-[#080B10]/50">
            <button
              type="button"
              onClick={() => setRightTab('routines')}
              className={`py-2.5 text-[11px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                rightTab === 'routines'
                  ? 'border-cyan-400 text-cyan-200 bg-[#0D121B]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Routines
            </button>
            <button
              type="button"
              onClick={() => setRightTab('subagents')}
              className={`py-2.5 text-[11px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                rightTab === 'subagents'
                  ? 'border-cyan-400 text-cyan-200 bg-[#0D121B]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Subagents
            </button>
            <button
              type="button"
              onClick={() => setRightTab('memory')}
              className={`py-2.5 text-[11px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                rightTab === 'memory'
                  ? 'border-cyan-400 text-cyan-200 bg-[#0D121B]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              MEMORY.md
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* TAB 1: ROUTINES & EVENT TRIGGERS */}
            {rightTab === 'routines' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    Cron &amp; Event Triggers ({state?.routines.length ?? 0})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddRoutine((v) => !v)}
                    className="px-2 py-1 rounded text-[11px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-200 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Routine
                  </button>
                </div>

                {showAddRoutine && (
                  <form
                    onSubmit={handleAddRoutine}
                    className="p-3 rounded bg-[#080B10] border border-cyan-500/30 space-y-2"
                  >
                    <input
                      type="text"
                      value={routineName}
                      onChange={(e) => setRoutineName(e.target.value)}
                      placeholder="Routine name"
                      className="w-full px-2.5 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs text-slate-100"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={routineTriggerType}
                        onChange={(e) => setRoutineTriggerType(e.target.value as 'cron' | 'event')}
                        className="px-2 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs text-slate-100"
                      >
                        <option value="event">event</option>
                        <option value="cron">cron</option>
                      </select>
                      <select
                        value={routineBotId}
                        onChange={(e) => setRoutineBotId(e.target.value as BotId)}
                        className="px-2 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs text-slate-100"
                      >
                        <option value="hermes-arb">Hermes-Arb</option>
                        <option value="aether-ofi">Aether-OFI</option>
                        <option value="sentinel-risk">Sentinel-Risk</option>
                        <option value="alpha-scout">Alpha-Scout</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      value={routineTriggerExpr}
                      onChange={(e) => setRoutineTriggerExpr(e.target.value)}
                      placeholder="cron:60s or event:SPREAD_GT_0.80"
                      className="w-full px-2.5 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs font-mono text-slate-100"
                    />
                    <textarea
                      rows={2}
                      value={routinePrompt}
                      onChange={(e) => setRoutinePrompt(e.target.value)}
                      placeholder="Routine instruction prompt..."
                      className="w-full px-2.5 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs text-slate-100"
                    />
                    <button
                      type="submit"
                      className="w-full py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-medium text-cyan-200"
                    >
                      Save Routine
                    </button>
                  </form>
                )}

                <div className="space-y-2">
                  {(state?.routines ?? []).map((rt) => (
                    <div
                      key={rt.id}
                      className="p-3 rounded bg-[#080B10] border border-slate-800/90 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-100">{rt.name}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono">
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                              {rt.triggerExpr}
                            </span>
                            <span className="text-slate-400">@{rt.targetBotId}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleRunRoutine(rt.id)}
                            title="Run Now"
                            className="p-1.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300"
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleRoutine(rt.id)}
                            title={rt.enabled ? 'Pause Routine' : 'Enable Routine'}
                            className={`p-1.5 rounded border ${
                              rt.enabled
                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            {rt.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400">{rt.prompt}</p>
                      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500 pt-1 border-t border-slate-800/70">
                        <span>STATUS: {rt.enabled ? 'ACTIVE' : 'PAUSED'}</span>
                        <span>RUNS: {rt.runCount}</span>
                        <span>LAST: {formatTime(rt.lastRunAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* TAB 2: DELEGATED SUBAGENTS */}
            {rightTab === 'subagents' && (
              <>
                <form
                  onSubmit={handleSpawnSubagent}
                  className="p-3 rounded bg-[#080B10] border border-slate-800/90 space-y-2"
                >
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    Spawn Isolated Child Auditor (Max 4 / Bot)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={subParentBot}
                      onChange={(e) => setSubParentBot(e.target.value as BotId)}
                      className="px-2 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs text-slate-100"
                    >
                      <option value="hermes-arb">Hermes-Arb</option>
                      <option value="aether-ofi">Aether-OFI</option>
                      <option value="sentinel-risk">Sentinel-Risk</option>
                      <option value="alpha-scout">Alpha-Scout</option>
                    </select>
                    <input
                      type="text"
                      value={subPair}
                      onChange={(e) => setSubPair(e.target.value)}
                      placeholder="ETH-USDC"
                      className="px-2.5 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs font-mono text-slate-100"
                    />
                  </div>
                  <input
                    type="text"
                    value={subObjective}
                    onChange={(e) => setSubObjective(e.target.value)}
                    placeholder="Objective (e.g. Audit Aerodrome vs Coinbase spread)..."
                    className="w-full px-2.5 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs text-slate-100"
                  />
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-xs font-medium text-indigo-200 flex items-center justify-center gap-1.5"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    Spawn Child Auditor
                  </button>
                </form>

                <div className="space-y-2">
                  {(state?.subagents ?? []).map((sub) => (
                    <div
                      key={sub.id}
                      className="p-3 rounded bg-[#080B10] border border-slate-800/90 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold text-indigo-300">{sub.name}</span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                            sub.status === 'reported'
                              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                              : 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>PARENT: @{sub.parentBotId}</span>
                        <span>PAIR: {sub.pair}</span>
                        <span className="tabular-nums text-cyan-300">{sub.spreadBps} bps</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{sub.finding}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* TAB 3: PERSISTENT TACTICAL MEMORY (MEMORY.md) */}
            {rightTab === 'memory' && (
              <>
                <form
                  onSubmit={handleAddMemory}
                  className="p-3 rounded bg-[#080B10] border border-slate-800/90 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Append to MEMORY.md
                    </span>
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={memSection}
                      onChange={(e) => setMemSection(e.target.value as MemoryEntry['section'])}
                      className="px-2 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs font-mono text-slate-100"
                    >
                      <option value="EXECUTION_NOTES">EXECUTION_NOTES</option>
                      <option value="ALPHA_INTEL">ALPHA_INTEL</option>
                      <option value="RISK_LIMITS">RISK_LIMITS</option>
                      <option value="INVARIANTS">INVARIANTS</option>
                    </select>
                    <input
                      type="text"
                      value={memTitle}
                      onChange={(e) => setMemTitle(e.target.value)}
                      placeholder="Entry title"
                      className="px-2.5 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs text-slate-100"
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={memContent}
                    onChange={(e) => setMemContent(e.target.value)}
                    placeholder="Persistent tactical rule or observation..."
                    className="w-full px-2.5 py-1.5 rounded bg-[#0D121B] border border-slate-800 text-xs text-slate-100"
                  />
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-medium text-cyan-200"
                  >
                    Persist Memory Entry
                  </button>
                </form>

                <div className="space-y-2">
                  {(state?.memory ?? []).map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded bg-[#080B10] border border-slate-800/90 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-cyan-300 shrink-0">
                            {entry.section}
                          </span>
                          <span className="text-xs font-semibold text-slate-100 truncate">{entry.title}</span>
                        </div>
                        {entry.locked ? (
                          <span title="Locked invariant" className="text-emerald-400 shrink-0">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleDeleteMemory(entry.id)}
                            className="text-slate-500 hover:text-rose-400 shrink-0"
                            title="Delete memory entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{entry.content}</p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                        <span>author: {entry.author}</span>
                        <span className="tabular-nums">{formatTime(entry.updatedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default BotHqWarRoom;
