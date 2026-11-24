import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type BotStatus = 'Working' | 'Needs you' | 'Idle';

export interface BotAgent {
  id: 'hermes-arb' | 'aether-ofi' | 'sentinel-risk' | 'alpha-scout';
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

export interface Channel {
  id: string;
  name: string;
  type: 'group' | 'dm';
  botId?: BotAgent['id'];
  description: string;
  unreadCount: number;
}

export interface ToolCallTrace {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  output: string;
  durationMs: number;
  status: 'ok' | 'blocked' | 'pending_approval';
}

export interface TranscriptMessage {
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

export type ApprovalDecision = 'allow' | 'always_allow' | 'deny';

export interface ApprovalCard {
  id: string;
  botId: BotAgent['id'];
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

export interface AutoAllowPolicy {
  id: string;
  policyKey: string;
  botId: BotAgent['id'];
  actionType: string;
  createdAt: string;
  matchCount: number;
}

export interface Routine {
  id: string;
  name: string;
  triggerType: 'cron' | 'event';
  triggerExpr: string;
  targetBotId: BotAgent['id'];
  channelId: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  runCount: number;
}

export interface DelegatedSubagent {
  id: string;
  parentBotId: BotAgent['id'];
  name: string;
  pair: string;
  objective: string;
  status: 'spawning' | 'analyzing' | 'reported' | 'terminated';
  spreadBps: number;
  finding: string;
  createdAt: string;
  reportedAt?: string;
}

export interface MemoryEntry {
  id: string;
  section: 'INVARIANTS' | 'RISK_LIMITS' | 'EXECUTION_NOTES' | 'ALPHA_INTEL';
  title: string;
  content: string;
  author: string;
  updatedAt: string;
  locked?: boolean;
}

interface PersistedState {
  memory: MemoryEntry[];
  autoAllowPolicies: AutoAllowPolicy[];
  routines: Routine[];
}

const STATE_FILE_PATH = path.resolve(process.cwd(), 'config', 'bot_hq_state.json');
const VERIFIED_BASE_L2_BALANCE_USD = 0.0;
const MAX_SUBAGENTS_PER_BOT = 4;

const nowIso = (): string => new Date().toISOString();
const makeId = (prefix: string): string => `${prefix}_${crypto.randomBytes(4).toString('hex')}`;

let stateRevision = 1;
const nextRevision = (): number => {
  stateRevision += 1;
  return stateRevision;
};

const bots: BotAgent[] = [
  {
    id: 'hermes-arb',
    name: 'Hermes-Arb',
    handle: '@hermes-arb',
    role: 'Cross-Venue Arbitrage Execution Lead',
    screen: ':1',
    cdpPort: 9201,
    status: 'Needs you',
    specialty: 'Coinbase REST v3 <-> Base Aerodrome/Uniswap V3 via CDP AgentKit & ERC-4337 Paymaster',
    queueDepth: 1,
    lastHeartbeat: nowIso(),
    metrics: { latencyMs: 18, tasksCompleted: 42, activeSubagents: 1 },
  },
  {
    id: 'aether-ofi',
    name: 'Aether-OFI',
    handle: '@aether-ofi',
    role: 'Order Flow Imbalance & Microstructure Analyst',
    screen: ':2',
    cdpPort: 9202,
    status: 'Working',
    specialty: 'L2/L3 order-book imbalance, queue depletion, and cross-venue basis velocity',
    queueDepth: 1,
    lastHeartbeat: nowIso(),
    metrics: { latencyMs: 11, tasksCompleted: 67, activeSubagents: 1 },
  },
  {
    id: 'sentinel-risk',
    name: 'Sentinel-Risk',
    handle: '@sentinel-risk',
    role: 'Deterministic Risk Governor',
    screen: ':3',
    cdpPort: 9203,
    status: 'Idle',
    specialty: '-2.00% daily drawdown cap, 0.15% slippage guard, 25 Gwei ceiling, 0.25x Half-Kelly',
    queueDepth: 0,
    lastHeartbeat: nowIso(),
    metrics: { latencyMs: 6, tasksCompleted: 118, activeSubagents: 0 },
  },
  {
    id: 'alpha-scout',
    name: 'Alpha-Scout',
    handle: '@alpha-scout',
    role: 'Base L2 Incentive & Liquidity Scout',
    screen: ':4',
    cdpPort: 9204,
    status: 'Idle',
    specialty: 'Aerodrome gauge incentives, Uniswap V3 fee tiers, and Coinbase volume-tier rebates',
    queueDepth: 0,
    lastHeartbeat: nowIso(),
    metrics: { latencyMs: 24, tasksCompleted: 29, activeSubagents: 0 },
  },
];

const channels: Channel[] = [
  {
    id: 'championship-war-room',
    name: '#championship-war-room',
    type: 'group',
    description: 'Multi-agent War Room for cross-venue arbitrage, OFI telemetry, and deterministic risk governance.',
    unreadCount: 0,
  },
  {
    id: 'dm-hermes-arb',
    name: 'Hermes-Arb',
    type: 'dm',
    botId: 'hermes-arb',
    description: 'Direct serial turn queue with Hermes-Arb (SCREEN :1 / CDP :9201).',
    unreadCount: 1,
  },
  {
    id: 'dm-aether-ofi',
    name: 'Aether-OFI',
    type: 'dm',
    botId: 'aether-ofi',
    description: 'Direct serial turn queue with Aether-OFI (SCREEN :2 / CDP :9202).',
    unreadCount: 0,
  },
  {
    id: 'dm-sentinel-risk',
    name: 'Sentinel-Risk',
    type: 'dm',
    botId: 'sentinel-risk',
    description: 'Direct serial turn queue with Sentinel-Risk (SCREEN :3 / CDP :9203).',
    unreadCount: 0,
  },
  {
    id: 'dm-alpha-scout',
    name: 'Alpha-Scout',
    type: 'dm',
    botId: 'alpha-scout',
    description: 'Direct serial turn queue with Alpha-Scout (SCREEN :4 / CDP :9204).',
    unreadCount: 0,
  },
];

const defaultRoutines: Routine[] = [
  {
    id: 'rt_cron_60s',
    name: 'Base L2 Spread & Gas Heartbeat',
    triggerType: 'cron',
    triggerExpr: 'cron:60s',
    targetBotId: 'aether-ofi',
    channelId: 'championship-war-room',
    prompt: 'Sample Coinbase REST v3 vs Aerodrome/Uniswap V3 ETH-USDC & cbBTC-USDC mid-price spread and Base gas.',
    enabled: true,
    lastRunAt: nowIso(),
    runCount: 14,
  },
  {
    id: 'rt_evt_spread',
    name: 'Cross-Venue Spread Trigger (>0.80%)',
    triggerType: 'event',
    triggerExpr: 'event:SPREAD_GT_0.80',
    targetBotId: 'hermes-arb',
    channelId: 'championship-war-room',
    prompt: 'Stage atomic CDP AgentKit + ERC-4337 Paymaster dry-run bundle and request Sentinel-Risk pre-trade sign-off.',
    enabled: true,
    lastRunAt: nowIso(),
    runCount: 3,
  },
  {
    id: 'rt_evt_drawdown',
    name: 'Drawdown Guardrail Escalation',
    triggerType: 'event',
    triggerExpr: 'event:DRAWDOWN_WARNING',
    targetBotId: 'sentinel-risk',
    channelId: 'championship-war-room',
    prompt: 'Verify -2.00% daily drawdown cap, halt non-reducing orders, and audit open slippage exposure.',
    enabled: true,
    lastRunAt: null,
    runCount: 0,
  },
];

const defaultMemory: MemoryEntry[] = [
  {
    id: 'mem_base_balance_invariant',
    section: 'INVARIANTS',
    title: 'Verified Base L2 Balance Invariant ($0.00)',
    content:
      'Verified Base L2 wallet balance is strictly $0.00 USDC / 0.00 ETH. All execution paths run in simulation/dry-run until funded; never fabricate live fill PnL.',
    author: 'sentinel-risk',
    updatedAt: nowIso(),
    locked: true,
  },
  {
    id: 'mem_risk_envelope',
    section: 'RISK_LIMITS',
    title: 'Deterministic Risk Envelope',
    content:
      'Hard caps: -2.00% daily drawdown ceiling, 0.15% max slippage guard, 25 Gwei Base gas ceiling, 0.25x Half-Kelly position sizing.',
    author: 'sentinel-risk',
    updatedAt: nowIso(),
    locked: true,
  },
  {
    id: 'mem_aerodrome_route',
    section: 'EXECUTION_NOTES',
    title: 'ERC-4337 Paymaster & Aerodrome Routing',
    content:
      'Prefer Aerodrome Slipstream CL-0.05% pools for WETH/USDC when Coinbase REST v3 spread exceeds 35 bps; sponsor gas via CDP Paymaster.',
    author: 'hermes-arb',
    updatedAt: nowIso(),
  },
  {
    id: 'mem_volume_tier',
    section: 'ALPHA_INTEL',
    title: 'Coinbase Advanced Volume-Tier Rebate Target',
    content:
      'Maker-first limit posting on Coinbase REST v3 reduces effective taker drag by 15 bps; prioritize passive leg when OFI > +0.42.',
    author: 'alpha-scout',
    updatedAt: nowIso(),
  },
];

const defaultAutoAllowPolicies: AutoAllowPolicy[] = [
  {
    id: 'pol_ofi_read',
    policyKey: 'aether-ofi:read_orderbook_snapshot',
    botId: 'aether-ofi',
    actionType: 'read_orderbook_snapshot',
    createdAt: nowIso(),
    matchCount: 41,
  },
];

function loadPersistedState(): PersistedState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      const loadedMemory = Array.isArray(parsed.memory) && parsed.memory.length > 0 ? parsed.memory : defaultMemory;
      const hasInvariant = loadedMemory.some((m) => m.id === 'mem_base_balance_invariant');
      return {
        memory: hasInvariant ? loadedMemory : [defaultMemory[0], ...loadedMemory],
        autoAllowPolicies: Array.isArray(parsed.autoAllowPolicies)
          ? parsed.autoAllowPolicies
          : defaultAutoAllowPolicies,
        routines: Array.isArray(parsed.routines) && parsed.routines.length > 0 ? parsed.routines : defaultRoutines,
      };
    }
  } catch {
    // Safe fallback to in-memory defaults
  }
  return {
    memory: [...defaultMemory],
    autoAllowPolicies: [...defaultAutoAllowPolicies],
    routines: [...defaultRoutines],
  };
}

const persisted = loadPersistedState();
const memoryEntries: MemoryEntry[] = persisted.memory;
const autoAllowPolicies: AutoAllowPolicy[] = persisted.autoAllowPolicies;
const routines: Routine[] = persisted.routines;

function persistStateSafely(): void {
  try {
    const dir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload: PersistedState = {
      memory: memoryEntries,
      autoAllowPolicies,
      routines,
    };
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Safe in-memory fallback when filesystem is read-only or unavailable
  }
}

const initialApprovalId = 'apr_hermes_01';
const approvals: ApprovalCard[] = [
  {
    id: initialApprovalId,
    botId: 'hermes-arb',
    botName: 'Hermes-Arb',
    channelId: 'championship-war-room',
    actionType: 'stage_cdp_paymaster_arb_dryrun',
    summary: 'Stage ERC-4337 Paymaster dry-run bundle: Coinbase ETH-USDC vs Aerodrome Slipstream (+0.84% spread)',
    policyKey: 'hermes-arb:stage_cdp_paymaster_arb_dryrun',
    payload: {
      venueA: 'Coinbase REST v3 (ETH-USDC)',
      venueB: 'Base Aerodrome CL-0.05% (WETH/USDC)',
      detectedSpreadPct: 0.84,
      mode: 'DRY_RUN_SIMULATION',
      paymaster: 'CDP_ERC4337_SPONSORED',
      verifiedBaseL2BalanceUsd: VERIFIED_BASE_L2_BALANCE_USD,
    },
    riskCheck: {
      dailyDrawdownPct: 0.0,
      maxDrawdownCapPct: -2.0,
      estimatedSlippagePct: 0.09,
      maxSlippagePct: 0.15,
      gasGwei: 0.04,
      maxGasGwei: 25,
      kellyFraction: 0.25,
      verifiedBaseL2BalanceUsd: VERIFIED_BASE_L2_BALANCE_USD,
    },
    status: 'pending',
    createdAt: nowIso(),
  },
];

const delegatedSubagents: DelegatedSubagent[] = [
  {
    id: 'sub_eth_basis_01',
    parentBotId: 'aether-ofi',
    name: 'ofi-depth-auditor-1',
    pair: 'ETH-USDC',
    objective: 'Monitor top-5 bid/ask queue depletion across Coinbase REST v3 and Base Aerodrome',
    status: 'reported',
    spreadBps: 84,
    finding: 'OFI +0.46 bullish impulse on Coinbase; Aerodrome WETH/USDC lagging by 84 bps with 0.09% est. slippage.',
    createdAt: nowIso(),
    reportedAt: nowIso(),
  },
  {
    id: 'sub_cbbtc_arb_01',
    parentBotId: 'hermes-arb',
    name: 'paymaster-sim-auditor-1',
    pair: 'cbBTC-USDC',
    objective: 'Simulate ERC-4337 UserOp gas sponsorship on Uniswap V3 Base 0.05% pool',
    status: 'reported',
    spreadBps: 42,
    finding: 'Paymaster sponsorship verified (0.04 Gwei). Wallet balance invariant confirmed at $0.00 — dry-run only.',
    createdAt: nowIso(),
    reportedAt: nowIso(),
  },
];

const messages: TranscriptMessage[] = [
  {
    id: makeId('msg'),
    revision: nextRevision(),
    channelId: 'championship-war-room',
    senderId: 'sentinel-risk',
    senderName: 'Sentinel-Risk',
    senderType: 'bot',
    content:
      'Risk envelope online. Enforcing -2.00% daily drawdown cap, 0.15% slippage guard, 25 Gwei Base gas ceiling, and 0.25x Half-Kelly. Verified Base L2 balance invariant: $0.00.',
    mentions: [],
    timestamp: nowIso(),
    toolTraces: [
      {
        id: makeId('tr'),
        tool: 'sentinel.verify_invariants',
        args: { network: 'base-mainnet', maxDrawdownPct: -2.0, maxSlippagePct: 0.15, maxGasGwei: 25 },
        output: 'OK: verifiedBaseL2BalanceUsd=$0.00, gas=0.04 Gwei, drawdown=0.00%',
        durationMs: 6,
        status: 'ok',
      },
    ],
  },
  {
    id: makeId('msg'),
    revision: nextRevision(),
    channelId: 'championship-war-room',
    senderId: 'aether-ofi',
    senderName: 'Aether-OFI',
    senderType: 'bot',
    content:
      'Detected +0.84% cross-venue basis on ETH-USDC (Coinbase REST v3 vs Base Aerodrome CL-0.05%). Order Flow Imbalance at +0.46. Handing off to @hermes-arb for dry-run bundle staging.',
    mentions: ['hermes-arb'],
    timestamp: nowIso(),
    toolTraces: [
      {
        id: makeId('tr'),
        tool: 'aether.compute_ofi_snapshot',
        args: { pair: 'ETH-USDC', depthLevels: 5, venues: ['coinbase_v3', 'aerodrome_base'] },
        output: 'OFI=+0.46 | spread=+84 bps | estSlippage=0.09%',
        durationMs: 11,
        status: 'ok',
      },
    ],
  },
  {
    id: makeId('msg'),
    revision: nextRevision(),
    channelId: 'championship-war-room',
    senderId: 'hermes-arb',
    senderName: 'Hermes-Arb',
    senderType: 'bot',
    content:
      'Staged CDP AgentKit + ERC-4337 Paymaster dry-run bundle for ETH-USDC (+0.84% spread). Verified Base L2 balance is $0.00 so execution is strictly simulation-gated. Awaiting operator approval below.',
    mentions: [],
    timestamp: nowIso(),
    approvalId: initialApprovalId,
    toolTraces: [
      {
        id: makeId('tr'),
        tool: 'cdp_agentkit.simulate_userop',
        args: { route: 'aerodrome_cl_005', paymaster: 'erc4337_cdp', balanceUsd: 0.0 },
        output: 'PENDING_APPROVAL: dry-run bundle valid (0.04 Gwei, 0.09% est. slippage)',
        durationMs: 18,
        status: 'pending_approval',
      },
    ],
  },
];

// SSE subscriber registry
const sseClients = new Set<Response>();

function broadcastEvent(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function getBot(botId: string): BotAgent | undefined {
  return bots.find((b) => b.id === botId);
}

function updateBotStatus(botId: BotAgent['id'], status: BotStatus, queueDelta = 0): void {
  const bot = getBot(botId);
  if (!bot) return;
  bot.status = status;
  bot.queueDepth = Math.max(0, bot.queueDepth + queueDelta);
  bot.lastHeartbeat = nowIso();
  broadcastEvent('bot_status', {
    botId: bot.id,
    status: bot.status,
    queueDepth: bot.queueDepth,
    lastHeartbeat: bot.lastHeartbeat,
    metrics: bot.metrics,
  });
}

function pushMessage(msg: Omit<TranscriptMessage, 'id' | 'revision' | 'timestamp'>): TranscriptMessage {
  const full: TranscriptMessage = {
    ...msg,
    id: makeId('msg'),
    revision: nextRevision(),
    timestamp: nowIso(),
  };
  messages.push(full);
  if (messages.length > 250) {
    messages.splice(0, messages.length - 250);
  }
  broadcastEvent('message', full);
  return full;
}

// Per-bot serial turn queues
const botQueues = new Map<BotAgent['id'], Promise<void>>();

function enqueueBotTurn(botId: BotAgent['id'], task: () => Promise<void>): void {
  const prev = botQueues.get(botId) ?? Promise.resolve();
  updateBotStatus(botId, 'Working', 1);
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      try {
        await task();
      } finally {
        const hasPendingApproval = approvals.some((a) => a.botId === botId && a.status === 'pending');
        updateBotStatus(botId, hasPendingApproval ? 'Needs you' : 'Idle', -1);
      }
    });
  botQueues.set(botId, next);
}

function resolveMentionedBots(content: string, channelId: string): BotAgent['id'][] {
  const channel = channels.find((c) => c.id === channelId);
  if (channel?.type === 'dm' && channel.botId) {
    return [channel.botId];
  }
  const lower = content.toLowerCase();
  if (lower.includes('@all') || lower.includes('@squad')) {
    return bots.map((b) => b.id);
  }
  const matched: BotAgent['id'][] = [];
  for (const bot of bots) {
    if (lower.includes(bot.handle.toLowerCase()) || lower.includes(`@${bot.id}`)) {
      matched.push(bot.id);
    }
  }
  if (matched.length > 0) return matched;
  // Default war-room routing based on keywords
  if (lower.includes('risk') || lower.includes('drawdown') || lower.includes('kelly') || lower.includes('slippage')) {
    return ['sentinel-risk'];
  }
  if (lower.includes('ofi') || lower.includes('depth') || lower.includes('orderbook') || lower.includes('spread')) {
    return ['aether-ofi'];
  }
  if (lower.includes('incentive') || lower.includes('gauge') || lower.includes('tier') || lower.includes('rebate')) {
    return ['alpha-scout'];
  }
  return ['hermes-arb'];
}

function buildBotReply(
  botId: BotAgent['id'],
  channelId: string,
  operatorPrompt: string
): { content: string; toolTraces: ToolCallTrace[]; needsApproval?: Omit<ApprovalCard, 'id' | 'createdAt' | 'status'> } {
  const lower = operatorPrompt.toLowerCase();
  const isExecutionIntent =
    lower.includes('execute') ||
    lower.includes('arb') ||
    lower.includes('swap') ||
    lower.includes('bundle') ||
    lower.includes('rebalance');

  if (botId === 'hermes-arb') {
    const policyKey = 'hermes-arb:stage_cdp_paymaster_arb_dryrun';
    const autoPolicy = autoAllowPolicies.find((p) => p.policyKey === policyKey);
    if (isExecutionIntent && !autoPolicy) {
      return {
        content:
          'Prepared atomic dry-run route (Coinbase REST v3 <-> Base Aerodrome CL-0.05%) via CDP AgentKit & ERC-4337 Paymaster. Verified Base L2 balance is $0.00 (simulation only). Requesting operator sign-off.',
        toolTraces: [
          {
            id: makeId('tr'),
            tool: 'cdp_agentkit.quote_cross_venue',
            args: { venueA: 'coinbase_v3', venueB: 'aerodrome_base', pair: 'ETH-USDC' },
            output: 'spread=+68 bps | estSlippage=0.08% | gas=0.04 Gwei',
            durationMs: 17,
            status: 'ok',
          },
          {
            id: makeId('tr'),
            tool: 'erc4337_paymaster.stage_userop',
            args: { mode: 'DRY_RUN', verifiedBaseL2BalanceUsd: VERIFIED_BASE_L2_BALANCE_USD },
            output: 'PENDING_APPROVAL: operator confirmation required',
            durationMs: 12,
            status: 'pending_approval',
          },
        ],
        needsApproval: {
          botId: 'hermes-arb',
          botName: 'Hermes-Arb',
          channelId,
          actionType: 'stage_cdp_paymaster_arb_dryrun',
          summary: `Stage ERC-4337 Paymaster dry-run bundle triggered by: "${operatorPrompt.slice(0, 72)}"`,
          policyKey,
          payload: {
            venueA: 'Coinbase REST v3',
            venueB: 'Base Aerodrome / Uniswap V3',
            mode: 'DRY_RUN_SIMULATION',
            verifiedBaseL2BalanceUsd: VERIFIED_BASE_L2_BALANCE_USD,
          },
          riskCheck: {
            dailyDrawdownPct: 0.0,
            maxDrawdownCapPct: -2.0,
            estimatedSlippagePct: 0.08,
            maxSlippagePct: 0.15,
            gasGwei: 0.04,
            maxGasGwei: 25,
            kellyFraction: 0.25,
            verifiedBaseL2BalanceUsd: VERIFIED_BASE_L2_BALANCE_USD,
          },
        },
      };
    }

    if (isExecutionIntent && autoPolicy) {
      autoPolicy.matchCount += 1;
      persistStateSafely();
      return {
        content: `Auto-allow policy [${autoPolicy.policyKey}] matched. Executed CDP AgentKit + ERC-4337 Paymaster dry-run simulation (0.04 Gwei, 0.08% slippage). Verified Base L2 balance remains $0.00.`,
        toolTraces: [
          {
            id: makeId('tr'),
            tool: 'cdp_agentkit.execute_dryrun',
            args: { policyId: autoPolicy.id, verifiedBaseL2BalanceUsd: VERIFIED_BASE_L2_BALANCE_USD },
            output: 'SIMULATED_OK: txHash=dryrun_0x9f3a...c21e | netEdge=+56 bps',
            durationMs: 19,
            status: 'ok',
          },
        ],
      };
    }

    return {
      content:
        'Hermes-Arb standing by on SCREEN :1 / CDP :9201. Coinbase REST v3 <-> Base Aerodrome/Uniswap V3 bridge is synced; ERC-4337 Paymaster gas sponsorship ready (verified Base L2 balance: $0.00).',
      toolTraces: [
        {
          id: makeId('tr'),
          tool: 'hermes.check_bridge_health',
          args: { screen: ':1', cdpPort: 9201 },
          output: 'coinbase_v3=OK (14ms) | base_rpc=OK (18ms) | balance=$0.00',
          durationMs: 14,
          status: 'ok',
        },
      ],
    };
  }

  if (botId === 'aether-ofi') {
    return {
      content:
        'Aether-OFI microstructure scan complete: ETH-USDC L2 OFI is +0.44 with bid-side queue thickening on Coinbase REST v3; Aerodrome Slipstream pool shows 0.08% impact at $10k notional.',
      toolTraces: [
        {
          id: makeId('tr'),
          tool: 'aether.scan_orderflow_imbalance',
          args: { pairs: ['ETH-USDC', 'cbBTC-USDC'], windowSec: 30 },
          output: 'ETH-USDC OFI=+0.44 (spread 68 bps) | cbBTC-USDC OFI=+0.19 (spread 34 bps)',
          durationMs: 11,
          status: 'ok',
        },
      ],
    };
  }

  if (botId === 'sentinel-risk') {
    return {
      content:
        'Sentinel-Risk deterministic audit passed: Daily drawdown 0.00% (cap -2.00%), slippage guard 0.15%, Base gas 0.04 Gwei (ceiling 25 Gwei), sizing 0.25x Half-Kelly, verified Base L2 balance $0.00.',
      toolTraces: [
        {
          id: makeId('tr'),
          tool: 'sentinel.audit_risk_envelope',
          args: { drawdownCapPct: -2.0, slippageGuardPct: 0.15, gasCeilingGwei: 25, kelly: 0.25 },
          output: 'PASS: all 4 guardrails green | verifiedBaseL2BalanceUsd=$0.00',
          durationMs: 6,
          status: 'ok',
        },
      ],
    };
  }

  return {
    content:
      'Alpha-Scout Base L2 scan: Aerodrome WETH/USDC CL-0.05% gauge APR at 18.4% with deep TVL; Uniswap V3 cbBTC/USDC 0.05% tier shows lowest fee drag for cross-venue arbitrage.',
    toolTraces: [
      {
        id: makeId('tr'),
        tool: 'alpha_scout.scan_base_incentives',
        args: { protocols: ['aerodrome', 'uniswap_v3_base'], minTvlUsd: 1_000_000 },
        output: 'Top pool: Aerodrome WETH/USDC CL-0.05% | feeDrag=5 bps',
        durationMs: 22,
        status: 'ok',
      },
    ],
  };
}

export const botHqRouter = express.Router();

// GET /api/bot-hq/state
botHqRouter.get('/state', (_req: Request, res: Response) => {
  res.json({
    revision: stateRevision,
    verifiedBaseL2BalanceUsd: VERIFIED_BASE_L2_BALANCE_USD,
    bots,
    channels,
    messages,
    approvals,
    autoAllowPolicies,
    routines,
    subagents: delegatedSubagents,
    memory: memoryEntries,
  });
});

// GET /api/bot-hq/events (SSE)
botHqRouter.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      revision: stateRevision,
      verifiedBaseL2BalanceUsd: VERIFIED_BASE_L2_BALANCE_USD,
      timestamp: nowIso(),
    })}\n\n`
  );

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// POST /api/bot-hq/messages
botHqRouter.post('/messages', (req: Request, res: Response) => {
  const { channelId = 'championship-war-room', content } = req.body as {
    channelId?: string;
    content?: string;
  };

  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Message content is required' });
    return;
  }

  const trimmed = content.trim();
  const targetBots = resolveMentionedBots(trimmed, channelId);
  const operatorMsg = pushMessage({
    channelId,
    senderId: 'operator',
    senderName: 'Commander',
    senderType: 'operator',
    content: trimmed,
    mentions: targetBots,
  });

  for (const botId of targetBots) {
    enqueueBotTurn(botId, async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const bot = getBot(botId);
      if (!bot) return;
      const reply = buildBotReply(botId, channelId, trimmed);
      let createdApproval: ApprovalCard | undefined;
      if (reply.needsApproval) {
        createdApproval = {
          ...reply.needsApproval,
          id: makeId('apr'),
          status: 'pending',
          createdAt: nowIso(),
        };
        approvals.unshift(createdApproval);
        broadcastEvent('approval', createdApproval);
      }
      bot.metrics.tasksCompleted += 1;
      pushMessage({
        channelId,
        senderId: bot.id,
        senderName: bot.name,
        senderType: 'bot',
        content: reply.content,
        mentions: [],
        toolTraces: reply.toolTraces,
        approvalId: createdApproval?.id,
      });
    });
  }

  res.status(201).json({ message: operatorMsg, routedTo: targetBots });
});

// POST /api/bot-hq/approvals/:id/resolve
botHqRouter.post('/approvals/:id/resolve', (req: Request, res: Response) => {
  const { id } = req.params;
  const { decision } = req.body as { decision?: ApprovalDecision };

  if (decision !== 'allow' && decision !== 'always_allow' && decision !== 'deny') {
    res.status(400).json({ error: 'Decision must be allow, always_allow, or deny' });
    return;
  }

  const card = approvals.find((a) => a.id === id);
  if (!card) {
    res.status(404).json({ error: 'Approval card not found' });
    return;
  }
  if (card.status !== 'pending') {
    res.status(409).json({ error: `Approval already resolved as ${card.status}` });
    return;
  }

  card.resolvedAt = nowIso();
  if (decision === 'allow') {
    card.status = 'allowed';
  } else if (decision === 'always_allow') {
    card.status = 'always_allowed';
    const existing = autoAllowPolicies.find((p) => p.policyKey === card.policyKey);
    if (!existing) {
      const policy: AutoAllowPolicy = {
        id: makeId('pol'),
        policyKey: card.policyKey,
        botId: card.botId,
        actionType: card.actionType,
        createdAt: nowIso(),
        matchCount: 1,
      };
      autoAllowPolicies.unshift(policy);
      persistStateSafely();
      broadcastEvent('policy', policy);
    }
  } else {
    card.status = 'denied';
  }

  broadcastEvent('approval', card);

  const hasMorePending = approvals.some((a) => a.botId === card.botId && a.status === 'pending');
  updateBotStatus(card.botId, hasMorePending ? 'Needs you' : 'Idle');

  const outcomeMsg =
    decision === 'deny'
      ? `Operator DENIED [${card.actionType}]. Execution aborted safely; verified Base L2 balance remains $0.00.`
      : `Operator ${decision === 'always_allow' ? 'ALWAYS ALLOWED' : 'ALLOWED'} [${card.actionType}]. Dry-run simulation recorded cleanly (verified Base L2 balance: $0.00).`;

  pushMessage({
    channelId: card.channelId,
    senderId: card.botId,
    senderName: card.botName,
    senderType: 'bot',
    content: outcomeMsg,
    mentions: [],
    toolTraces: [
      {
        id: makeId('tr'),
        tool: `approval.${decision}`,
        args: { approvalId: card.id, policyKey: card.policyKey, verifiedBaseL2BalanceUsd: VERIFIED_BASE_L2_BALANCE_USD },
        output: decision === 'deny' ? 'ABORTED_BY_OPERATOR' : 'DRY_RUN_RECORDED_OK',
        durationMs: 9,
        status: decision === 'deny' ? 'blocked' : 'ok',
      },
    ],
  });

  res.json({ approval: card, autoAllowPolicies });
});

// POST /api/bot-hq/routines
botHqRouter.post('/routines', (req: Request, res: Response) => {
  const { name, triggerType, triggerExpr, targetBotId, prompt } = req.body as {
    name?: string;
    triggerType?: 'cron' | 'event';
    triggerExpr?: string;
    targetBotId?: BotAgent['id'];
    prompt?: string;
  };

  if (!name?.trim() || !triggerExpr?.trim() || !prompt?.trim()) {
    res.status(400).json({ error: 'name, triggerExpr, and prompt are required' });
    return;
  }

  const validBot = getBot(targetBotId ?? 'aether-ofi');
  const routine: Routine = {
    id: makeId('rt'),
    name: name.trim(),
    triggerType: triggerType === 'event' ? 'event' : 'cron',
    triggerExpr: triggerExpr.trim(),
    targetBotId: validBot ? validBot.id : 'aether-ofi',
    channelId: 'championship-war-room',
    prompt: prompt.trim(),
    enabled: true,
    lastRunAt: null,
    runCount: 0,
  };

  routines.unshift(routine);
  persistStateSafely();
  broadcastEvent('routine', routine);
  res.status(201).json({ routine });
});

// POST /api/bot-hq/routines/:id/run
botHqRouter.post('/routines/:id/run', (req: Request, res: Response) => {
  const routine = routines.find((r) => r.id === req.params.id);
  if (!routine) {
    res.status(404).json({ error: 'Routine not found' });
    return;
  }

  routine.lastRunAt = nowIso();
  routine.runCount += 1;
  persistStateSafely();
  broadcastEvent('routine', routine);

  enqueueBotTurn(routine.targetBotId, async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const bot = getBot(routine.targetBotId);
    if (!bot) return;
    const reply = buildBotReply(routine.targetBotId, routine.channelId, routine.prompt);
    pushMessage({
      channelId: routine.channelId,
      senderId: bot.id,
      senderName: bot.name,
      senderType: 'bot',
      content: `[Routine ${routine.triggerExpr}] ${reply.content}`,
      mentions: [],
      toolTraces: reply.toolTraces,
    });
  });

  res.json({ routine });
});

// PATCH /api/bot-hq/routines/:id/toggle
botHqRouter.patch('/routines/:id/toggle', (req: Request, res: Response) => {
  const routine = routines.find((r) => r.id === req.params.id);
  if (!routine) {
    res.status(404).json({ error: 'Routine not found' });
    return;
  }

  routine.enabled = !routine.enabled;
  persistStateSafely();
  broadcastEvent('routine', routine);
  res.json({ routine });
});

// POST /api/bot-hq/subagents
botHqRouter.post('/subagents', (req: Request, res: Response) => {
  const { parentBotId = 'hermes-arb', pair = 'ETH-USDC', objective } = req.body as {
    parentBotId?: BotAgent['id'];
    pair?: string;
    objective?: string;
  };

  const parent = getBot(parentBotId);
  if (!parent) {
    res.status(404).json({ error: 'Parent bot not found' });
    return;
  }

  const activeForParent = delegatedSubagents.filter(
    (s) => s.parentBotId === parent.id && s.status !== 'terminated'
  );
  if (activeForParent.length >= MAX_SUBAGENTS_PER_BOT) {
    res.status(400).json({
      error: `${parent.name} already has ${MAX_SUBAGENTS_PER_BOT}/${MAX_SUBAGENTS_PER_BOT} isolated subagents active`,
    });
    return;
  }

  const subagent: DelegatedSubagent = {
    id: makeId('sub'),
    parentBotId: parent.id,
    name: `${parent.id.split('-')[0]}-auditor-${activeForParent.length + 1}`,
    pair: pair.trim() || 'ETH-USDC',
    objective: objective?.trim() || `Audit live Coinbase REST v3 vs Base L2 spread on ${pair}`,
    status: 'analyzing',
    spreadBps: 0,
    finding: 'Sampling live order books and Base L2 pool reserves...',
    createdAt: nowIso(),
  };

  delegatedSubagents.unshift(subagent);
  parent.metrics.activeSubagents = activeForParent.length + 1;
  broadcastEvent('subagent', subagent);
  broadcastEvent('bot_status', {
    botId: parent.id,
    status: parent.status,
    queueDepth: parent.queueDepth,
    lastHeartbeat: nowIso(),
    metrics: parent.metrics,
  });

  // Simulated isolated child analysis reporting back via send_to_bot
  setTimeout(() => {
    const simulatedSpreadBps = Math.floor(28 + Math.random() * 72);
    subagent.status = 'reported';
    subagent.spreadBps = simulatedSpreadBps;
    subagent.reportedAt = nowIso();
    subagent.finding = `send_to_bot(${parent.id}): ${subagent.pair} cross-venue spread ${simulatedSpreadBps} bps | est. slippage 0.08% | Base gas 0.04 Gwei | balance invariant $0.00.`;
    broadcastEvent('subagent', subagent);

    pushMessage({
      channelId: 'championship-war-room',
      senderId: subagent.id,
      senderName: `${subagent.name} -> ${parent.name}`,
      senderType: 'subagent',
      content: subagent.finding,
      mentions: [parent.id],
      toolTraces: [
        {
          id: makeId('tr'),
          tool: 'subagent.send_to_bot',
          args: { targetBot: parent.id, pair: subagent.pair, spreadBps: simulatedSpreadBps },
          output: 'DELIVERED_TO_PARENT_QUEUE',
          durationMs: 14,
          status: 'ok',
        },
      ],
    });
  }, 900);

  res.status(201).json({ subagent });
});

// POST /api/bot-hq/memory
botHqRouter.post('/memory', (req: Request, res: Response) => {
  const { section = 'EXECUTION_NOTES', title, content, author = 'Commander' } = req.body as {
    section?: MemoryEntry['section'];
    title?: string;
    content?: string;
    author?: string;
  };

  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ error: 'title and content are required' });
    return;
  }

  const entry: MemoryEntry = {
    id: makeId('mem'),
    section,
    title: title.trim(),
    content: content.trim(),
    author: author.trim() || 'Commander',
    updatedAt: nowIso(),
  };

  memoryEntries.push(entry);
  persistStateSafely();
  broadcastEvent('memory', { action: 'added', entry });
  res.status(201).json({ entry });
});

// DELETE /api/bot-hq/memory/:id
botHqRouter.delete('/memory/:id', (req: Request, res: Response) => {
  const idx = memoryEntries.findIndex((m) => m.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Memory entry not found' });
    return;
  }
  if (memoryEntries[idx].locked) {
    res.status(403).json({ error: 'Core invariant memory entries cannot be deleted' });
    return;
  }

  const [removed] = memoryEntries.splice(idx, 1);
  persistStateSafely();
  broadcastEvent('memory', { action: 'deleted', id: removed.id });
  res.json({ deleted: removed.id });
});
