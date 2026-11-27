import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import {
  emitEphemeralNanotransaction,
  getNanotransactionSnapshot,
} from './nanotransactionRewards.ts';

export const STARLINK_EDGE_BASE =
  process.env.STARLINK_EDGE_URL || 'https://starlink-edge.aegentixcybernetics.com';

export const RAILWAY_GATEWAY_BASE =
  process.env.RAILWAY_GATEWAY_URL ||
  'https://aegentix-sovereign-gateway-production.up.railway.app';

export const ALLOWED_MCP_TOOLS = [
  'mesh_posture',
  'autonomy_status',
  'railway_cloud_sync',
  'solana_sbt_verify',
  'r2_vault_status',
  'starlink_link_status',
] as const;

export type StardustMcpToolName = (typeof ALLOWED_MCP_TOOLS)[number];
export type StardustMcpCallable = StardustMcpToolName | 'tools/list';

export type TransportId =
  | 'STARLINK_AS14593'
  | 'TELESAT_LIGHTSPEED'
  | 'BONDED_5G'
  | 'LORA_915'
  | 'QUANTUM_PQC';

export type TransportOperationalStatus = 'active' | 'standby' | 'online' | 'degraded';

export interface PhysicalTransportLink {
  id: TransportId;
  name: string;
  description: string;
  status: TransportOperationalStatus;
  latencyMs: number;
  priority: number;
  bandOrAsn: string;
  encryption: string;
  uplinkDetected?: boolean;
  lastUpdatedUtc: string;
}

export type StationRoomId =
  | 'COMMAND_BRIDGE'
  | 'STARLINK_ARRAY'
  | 'CYBERGYM_DOJO'
  | 'R2_VAULT'
  | 'XRPL_TREASURY';

export interface StationRoomMetadata {
  id: StationRoomId;
  name: string;
  sector: string;
  description: string;
}

export type StationAgentId =
  | 'AEGIS-PRIME'
  | 'QUANT-ALPHA'
  | 'SENTINEL-ZERO'
  | 'NEXUS-ROUTER';

export interface StarNetStationAgent {
  id: StationAgentId;
  callsign: string;
  role: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  room: StationRoomId;
  previousRoom: StationRoomId;
  posture: 'COMMANDING' | 'ANALYZING' | 'AUDITING' | 'ROUTING' | 'SPARRING';
  specialty: string;
  lastActionSummary: string;
  lastMovedUtc: string;
}

export interface StrategyLogEntry {
  id: string;
  sequence: number;
  timestamp: string;
  eventType: string;
  transport: string;
  summary: string;
  prevHash: string;
  entryHash: string;
  metadata?: Record<string, unknown>;
}

export interface CyberGymSparRound {
  roundId: string;
  timestamp: string;
  room: 'CYBERGYM_DOJO';
  drill: string;
  challengerId: StationAgentId;
  defenderId: StationAgentId;
  challengerScore: number;
  defenderScore: number;
  winnerId: StationAgentId | 'DRAW';
  challengerEloBefore: number;
  challengerEloAfter: number;
  defenderEloBefore: number;
  defenderEloAfter: number;
  eloDelta: number;
  proofSha256: string;
  narrative: string;
}

interface JsonRpcResponseEnvelope {
  jsonrpc?: string;
  id?: number | string;
  result?: {
    content?: Array<{ type?: string; text?: string }>;
    tools?: unknown[];
    [key: string]: unknown;
  };
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface OverviewSnapshotCache {
  expiresAtMs: number;
  payload: Record<string, unknown>;
}

const GENESIS_PREV_HASH = '0'.repeat(64);
const MAX_STRATEGY_LOGS = 200;
const HTTP_TIMEOUT_MS = 8_000;
const OVERVIEW_CACHE_TTL_MS = 10_000;

export const STATION_ROOMS: StationRoomMetadata[] = [
  {
    id: 'COMMAND_BRIDGE',
    name: 'Command Bridge',
    sector: 'DECK-01 // SOVEREIGN CORE',
    description: 'Primary fleet orchestration, VES-1 hash-chain governance, and FIDO2 command gate.',
  },
  {
    id: 'STARLINK_ARRAY',
    name: 'Starlink Array',
    sector: 'DECK-02 // LEO RF & LASER',
    description: 'AS14593 Starlink Mini Gen 3 beam tracking, Telesat optical relay, and Reticulum 915MHz mesh.',
  },
  {
    id: 'CYBERGYM_DOJO',
    name: 'CyberGym Dojo',
    sector: 'DECK-03 // ADVERSARIAL ARENA',
    description: 'Deterministic SHA-256 red-vs-blue agent sparring, PQC drill verification, and ELO rating engine.',
  },
  {
    id: 'R2_VAULT',
    name: 'R2 Telemetry Vault',
    sector: 'DECK-04 // IMMUTABLE STORAGE',
    description: 'Cloudflare R2 world-monitor-treasury-vault & space-bunny-alpha cryptographic archive.',
  },
  {
    id: 'XRPL_TREASURY',
    name: 'XRPL Sovereign Treasury',
    sector: 'DECK-05 // ON-CHAIN AUDIT',
    description: 'Live XRPL mainnet blackholed issuer & AMM reserve verification (Zero Fake Balances enforced).',
  },
];

const PATROL_ROOMS: StationRoomId[] = [
  'COMMAND_BRIDGE',
  'STARLINK_ARRAY',
  'R2_VAULT',
  'XRPL_TREASURY',
];

export function computeVes1EntryHash(
  prevHash: string,
  timestamp: string,
  eventType: string,
  summary: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${prevHash}:${timestamp}:${eventType}:${summary}`)
    .digest('hex');
}

const bootTimestamp = new Date().toISOString();
const genesisSummary =
  'VES-1 Sovereign Satellite Strategy Chain anchored at boot. Zero Fake Balances invariant active; live telemetry bound to starlink-edge.aegentixcybernetics.com.';
const genesisHash = computeVes1EntryHash(
  GENESIS_PREV_HASH,
  bootTimestamp,
  'GENESIS_VES1_ANCHOR',
  genesisSummary
);

let logSequenceCounter = 1;

/**
 * In-memory VES-1 Hash-Chained Satellite Strategy Log (max 200 entries).
 * Stored newest-first (`strategyLogs[0]` is latest) so `strategyLogs.slice(0, 50)`
 * returns the 50 most recent cryptographically chained entries.
 */
export const strategyLogs: StrategyLogEntry[] = [
  {
    id: 'ves1-log-0001',
    sequence: 1,
    timestamp: bootTimestamp,
    eventType: 'GENESIS_VES1_ANCHOR',
    transport: 'STARLINK_AS14593',
    summary: genesisSummary,
    prevHash: GENESIS_PREV_HASH,
    entryHash: genesisHash,
    metadata: {
      protocol: 'VES-1-SHA256',
      unbondedLocalUsdBalance: 0,
      edgeTarget: STARLINK_EDGE_BASE,
      railwayTarget: RAILWAY_GATEWAY_BASE,
    },
  },
];

export function appendStrategyLog(
  eventType: string,
  transport: string,
  summary: string,
  metadata?: Record<string, unknown>
): StrategyLogEntry {
  const latest = strategyLogs[0];
  const prevHash = latest ? latest.entryHash : GENESIS_PREV_HASH;
  const timestamp = new Date().toISOString();
  const cleanEventType = (eventType || 'OPERATOR_STRATEGY_EVENT').trim();
  const cleanTransport = (transport || activePrimaryTransport).trim();
  const cleanSummary = (summary || 'Strategy telemetry event recorded').trim();
  const entryHash = computeVes1EntryHash(prevHash, timestamp, cleanEventType, cleanSummary);

  logSequenceCounter += 1;
  const entry: StrategyLogEntry = {
    id: `ves1-log-${String(logSequenceCounter).padStart(4, '0')}`,
    sequence: logSequenceCounter,
    timestamp,
    eventType: cleanEventType,
    transport: cleanTransport,
    summary: cleanSummary,
    prevHash,
    entryHash,
    ...(metadata ? { metadata } : {}),
  };

  strategyLogs.unshift(entry);
  if (strategyLogs.length > MAX_STRATEGY_LOGS) {
    strategyLogs.length = MAX_STRATEGY_LOGS;
  }

  return entry;
}

export function verifyLogChain(): boolean {
  if (strategyLogs.length === 0) {
    return false;
  }

  for (let i = strategyLogs.length - 1; i >= 0; i -= 1) {
    const entry = strategyLogs[i];
    const expectedHash = computeVes1EntryHash(
      entry.prevHash,
      entry.timestamp,
      entry.eventType,
      entry.summary
    );
    if (entry.entryHash !== expectedHash) {
      return false;
    }

    if (i === strategyLogs.length - 1) {
      if (entry.sequence === 1 && entry.prevHash !== GENESIS_PREV_HASH) {
        return false;
      }
      if (!/^[0-9a-f]{64}$/.test(entry.prevHash)) {
        return false;
      }
    } else {
      const olderEntry = strategyLogs[i + 1];
      if (entry.prevHash !== olderEntry.entryHash) {
        return false;
      }
    }
  }

  return true;
}

export let activePrimaryTransport: TransportId = 'STARLINK_AS14593';
export let autoFailoverThresholdMs = 65;

export const transports: PhysicalTransportLink[] = [
  {
    id: 'STARLINK_AS14593',
    name: 'Starlink Mini Gen 3 / AS14593 LEO',
    description: 'Primary Ku/Ka-band phased-array LEO dish uplink via ROG RC73XA bridge (192.168.100.1:9200).',
    status: 'active',
    latencyMs: 31,
    priority: 1,
    bandOrAsn: 'AS14593 // Ku-Ka LEO',
    encryption: 'WireGuard + mTLS gRPC-Web',
    uplinkDetected: false,
    lastUpdatedUtc: bootTimestamp,
  },
  {
    id: 'TELESAT_LIGHTSPEED',
    name: 'LEO Optical Laser Link',
    description: 'Polar & inclined orbit optical inter-satellite laser mesh relay.',
    status: 'standby',
    latencyMs: 34,
    priority: 2,
    bandOrAsn: '1550nm Optical ISL',
    encryption: 'MACsec + TLS 1.3',
    lastUpdatedUtc: bootTimestamp,
  },
  {
    id: 'BONDED_5G',
    name: '4x Carrier Aggregated Coastal 5G',
    description: 'Multi-SIM sub-6GHz / C-band bonded terrestrial & littoral failover transport.',
    status: 'standby',
    latencyMs: 28,
    priority: 3,
    bandOrAsn: 'n77 / n41 / n71 4xCA',
    encryption: 'IPsec IKEv2 ChaCha20-Poly1305',
    lastUpdatedUtc: bootTimestamp,
  },
  {
    id: 'LORA_915',
    name: 'Reticulum 915MHz Sovereign Mesh',
    description: 'Zero-infrastructure sub-GHz long-range packet radio emergency command link.',
    status: 'online',
    latencyMs: 85,
    priority: 4,
    bandOrAsn: '915 MHz ISM LoRa',
    encryption: 'Reticulum Curve25519 + Fernet',
    lastUpdatedUtc: bootTimestamp,
  },
  {
    id: 'QUANTUM_PQC',
    name: 'ML-KEM Kyber-1024 Key-Encapsulated Control Channel',
    description: 'Post-quantum out-of-band cryptographic key rotation and attestation plane.',
    status: 'active',
    latencyMs: 12,
    priority: 5,
    bandOrAsn: 'NIST FIPS-203 ML-KEM-1024',
    encryption: 'ML-KEM-1024 + SHA3-512',
    lastUpdatedUtc: bootTimestamp,
  },
];

export const stationAgents: StarNetStationAgent[] = [
  {
    id: 'AEGIS-PRIME',
    callsign: 'AEGIS-PRIME',
    role: 'Commander',
    elo: 1840,
    wins: 14,
    losses: 2,
    draws: 1,
    room: 'COMMAND_BRIDGE',
    previousRoom: 'STARLINK_ARRAY',
    posture: 'COMMANDING',
    specialty: 'Sovereign Fleet Command, FIDO2 Gate & VES-1 Governance',
    lastActionSummary: 'Anchored VES-1 genesis block and verified Cloudflare Service Bindings.',
    lastMovedUtc: bootTimestamp,
  },
  {
    id: 'QUANT-ALPHA',
    callsign: 'QUANT-ALPHA',
    role: 'Arbitrage Strategist',
    elo: 1795,
    wins: 11,
    losses: 4,
    draws: 1,
    room: 'XRPL_TREASURY',
    previousRoom: 'COMMAND_BRIDGE',
    posture: 'ANALYZING',
    specialty: 'XRPL Mainnet AMM Reserve Auditing & Zero-Fake-Balance Enforcement',
    lastActionSummary: 'Audited live XRPL ledger snapshot & verified blackholed issuer integrity.',
    lastMovedUtc: bootTimestamp,
  },
  {
    id: 'SENTINEL-ZERO',
    callsign: 'SENTINEL-ZERO',
    role: 'Zero-Trust & PQC Auditor',
    elo: 1820,
    wins: 13,
    losses: 3,
    draws: 0,
    room: 'R2_VAULT',
    previousRoom: 'CYBERGYM_DOJO',
    posture: 'AUDITING',
    specialty: 'ML-KEM Kyber-1024 Key Encapsulation & R2 Telemetry Attestation',
    lastActionSummary: 'Verified RC73XA XDNA 2 NPU hardware SHA-256 attestation in R2 vault.',
    lastMovedUtc: bootTimestamp,
  },
  {
    id: 'NEXUS-ROUTER',
    callsign: 'NEXUS-ROUTER',
    role: 'LEO Satellite & Mesh Telemetry',
    elo: 1775,
    wins: 9,
    losses: 5,
    draws: 2,
    room: 'STARLINK_ARRAY',
    previousRoom: 'COMMAND_BRIDGE',
    posture: 'ROUTING',
    specialty: 'AS14593 LEO Beam Handoff, Telesat Laser Failover & Reticulum Mesh',
    lastActionSummary: 'Monitoring AS14593 dish uplink and 65ms auto-failover threshold.',
    lastMovedUtc: bootTimestamp,
  },
];

let overviewCache: OverviewSnapshotCache | null = null;
let jsonRpcIdCounter = 1;
let sparRoundCounter = 0;

export function invalidateOverviewCache(): void {
  overviewCache = null;
}

function safeJsonParse(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return raw;
  }
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = HTTP_TIMEOUT_MS
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    const parsed = safeJsonParse(text);

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} from ${url}: ${
          typeof parsed === 'string' ? parsed.slice(0, 180) : JSON.stringify(parsed).slice(0, 180)
        }`
      );
    }

    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export async function invokeStarlinkMcp(
  toolOrMethod: StardustMcpCallable,
  toolArgs: Record<string, unknown> = {},
  timeoutMs = HTTP_TIMEOUT_MS
): Promise<unknown> {
  jsonRpcIdCounter += 1;
  const rpcBody =
    toolOrMethod === 'tools/list'
      ? {
          jsonrpc: '2.0',
          id: jsonRpcIdCounter,
          method: 'tools/list',
          params: {},
        }
      : {
          jsonrpc: '2.0',
          id: jsonRpcIdCounter,
          method: 'tools/call',
          params: {
            name: toolOrMethod,
            arguments: toolArgs,
          },
        };

  const rawEnvelope = (await fetchJsonWithTimeout(
    `${STARLINK_EDGE_BASE}/mcp`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcBody),
    },
    timeoutMs
  )) as JsonRpcResponseEnvelope;

  if (rawEnvelope && typeof rawEnvelope === 'object' && rawEnvelope.error) {
    throw new Error(
      `MCP RPC error (${rawEnvelope.error.code ?? 'UNKNOWN'}): ${
        rawEnvelope.error.message || 'Unknown MCP error'
      }`
    );
  }

  if (toolOrMethod === 'tools/list') {
    return rawEnvelope?.result ?? rawEnvelope;
  }

  const firstText = rawEnvelope?.result?.content?.[0]?.text;
  if (typeof firstText === 'string') {
    return safeJsonParse(firstText);
  }

  return rawEnvelope?.result ?? rawEnvelope;
}

function isAllowedMcpTool(name: string): name is StardustMcpCallable {
  return (
    name === 'tools/list' ||
    (ALLOWED_MCP_TOOLS as readonly string[]).includes(name)
  );
}

function isTransportId(id: string): id is TransportId {
  return transports.some((t) => t.id === id);
}

function syncTransportStates(nextPrimary: TransportId): void {
  const now = new Date().toISOString();
  activePrimaryTransport = nextPrimary;

  for (const link of transports) {
    link.lastUpdatedUtc = now;
    if (link.id === nextPrimary) {
      link.status = 'active';
    } else if (link.id === 'QUANTUM_PQC') {
      link.status = 'active';
    } else if (link.id === 'LORA_915') {
      link.status = 'online';
    } else {
      link.status = 'standby';
    }
  }
}

function moveAgentToRoom(
  agent: StarNetStationAgent,
  targetRoom: StationRoomId,
  posture: StarNetStationAgent['posture'],
  summary: string
): void {
  if (agent.room !== targetRoom) {
    agent.previousRoom = agent.room;
    agent.room = targetRoom;
    agent.lastMovedUtc = new Date().toISOString();
  }
  agent.posture = posture;
  agent.lastActionSummary = summary;
}

export const stardustMcpRouter = express.Router();

/**
 * 1. GET /overview
 * Live multi-tool snapshot from starlink-edge.aegentixcybernetics.com with 8s timeout,
 * 10s in-memory cache, and clean degraded status when isolated/offline.
 */
stardustMcpRouter.get('/overview', async (req: Request, res: Response) => {
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const nowMs = Date.now();

  if (!forceRefresh && overviewCache && overviewCache.expiresAtMs > nowMs) {
    const slicedLogs = strategyLogs.slice(0, 50);
    res.json({
      ...overviewCache.payload,
      cached: true,
      activePrimaryTransport,
      autoFailoverThresholdMs,
      transports,
      stationAgents,
      agents: stationAgents,
      strategyLogs: slicedLogs,
      logs: slicedLogs,
      chainValid: verifyLogChain(),
    });
    return;
  }

  const timestamp = new Date().toISOString();

  const wrapSafe = async <T>(
    source: string,
    fn: () => Promise<T>
  ): Promise<T | Record<string, unknown>> => {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        degraded: true,
        source,
        unbondedLocalUsdBalance: 0,
        error: message,
        ts: timestamp,
      };
    }
  };

  const [
    edgeHealth,
    meshPosture,
    autonomyStatus,
    railwaySync,
    r2VaultStatus,
    starlinkStatus,
  ] = await Promise.all([
    wrapSafe('edge_health', () => fetchJsonWithTimeout(`${STARLINK_EDGE_BASE}/health`)),
    wrapSafe('mesh_posture', () => invokeStarlinkMcp('mesh_posture')),
    wrapSafe('autonomy_status', () => invokeStarlinkMcp('autonomy_status')),
    wrapSafe('railway_cloud_sync', () => invokeStarlinkMcp('railway_cloud_sync')),
    wrapSafe('r2_vault_status', () => invokeStarlinkMcp('r2_vault_status')),
    wrapSafe('starlink_link_status', () => invokeStarlinkMcp('starlink_link_status')),
  ]);

  if (starlinkStatus && typeof starlinkStatus === 'object') {
    const detected = Boolean(
      (starlinkStatus as Record<string, unknown>).starlink_uplink_detected
    );
    const starlinkTransport = transports.find((t) => t.id === 'STARLINK_AS14593');
    if (starlinkTransport) {
      starlinkTransport.uplinkDetected = detected;
    }
  }

  const slicedLogs = strategyLogs.slice(0, 50);
  const payload: Record<string, unknown> = {
    ok: true,
    timestamp,
    cached: false,
    unbondedLocalUsdBalance: 0,
    edgeBaseUrl: STARLINK_EDGE_BASE,
    railwayBaseUrl: RAILWAY_GATEWAY_BASE,
    edgeHealth,
    meshPosture,
    mesh_posture: meshPosture,
    autonomyStatus,
    autonomy_status: autonomyStatus,
    railwaySync,
    railway_cloud_sync: railwaySync,
    r2VaultStatus,
    r2_vault_status: r2VaultStatus,
    starlinkStatus,
    starlink_link_status: starlinkStatus,
    activePrimaryTransport,
    autoFailoverThresholdMs,
    transports,
    stationAgents,
    agents: stationAgents,
    rooms: STATION_ROOMS,
    strategyLogs: slicedLogs,
    logs: slicedLogs,
    chainValid: verifyLogChain(),
    zoneHomebase: 'https://aegentixcybernetics.com',
    nanotransactionLedger: getNanotransactionSnapshot(12),
  };

  overviewCache = {
    expiresAtMs: Date.now() + OVERVIEW_CACHE_TTL_MS,
    payload,
  };

  res.json(payload);
});

/**
 * 2. POST /mcp-call
 * Executes live JSON-RPC 2.0 tool call on starlink-edge.aegentixcybernetics.com/mcp
 * and records a VES-1 hash-chained strategy log entry + ephemeral nanotransaction.
 */
stardustMcpRouter.post('/mcp-call', async (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    tool?: unknown;
    name?: unknown;
    arguments?: unknown;
  };

  const rawTool =
    typeof body.tool === 'string'
      ? body.tool
      : typeof body.name === 'string'
        ? body.name
        : '';
  const tool = rawTool.trim();
  if (!isAllowedMcpTool(tool)) {
    res.status(400).json({
      ok: false,
      error: `Invalid MCP tool '${tool}'. Allowed tools: ${ALLOWED_MCP_TOOLS.join(', ')}, tools/list`,
      allowedTools: [...ALLOWED_MCP_TOOLS, 'tools/list'],
    });
    return;
  }

  const toolArguments =
    body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
      ? (body.arguments as Record<string, unknown>)
      : {};

  if (tool === 'solana_sbt_verify' && typeof toolArguments.wallet !== 'string') {
    res.status(400).json({
      ok: false,
      error: "MCP tool 'solana_sbt_verify' requires a string 'arguments.wallet' parameter.",
    });
    return;
  }

  const startedMs = Date.now();
  try {
    const result = await invokeStarlinkMcp(tool, toolArguments);
    const durationMs = Date.now() - startedMs;

    const nanoTx = emitEphemeralNanotransaction({
      ephemeralResourceId: `mcp-${tool}-${Date.now()}`,
      arena: 'STARLINK_EDGE_MCP_ZONE',
      actionType: `MCP_${tool.toUpperCase()}`,
      actorId: 'NEXUS-ROUTER',
      computeUnits: 16,
      computeTimeMs: Math.max(1, durationMs),
      chain: 'xrpl',
      contextPayload: { tool, zone: 'aegentixcybernetics.com' },
    });

    const logEntry = appendStrategyLog(
      'MCP_TOOL_CALL',
      activePrimaryTransport,
      `Executed live Stardust MCP '${tool}' via ${STARLINK_EDGE_BASE}/mcp (${durationMs}ms) · Minted +${nanoTx.totalRewardSov} AEG-SOV.`,
      {
        tool,
        durationMs,
        nanoTxId: nanoTx.nanoTxId,
        totalRewardSov: nanoTx.totalRewardSov,
        ok: true,
      }
    );

    res.json({
      ok: true,
      zone: 'aegentixcybernetics.com',
      tool,
      durationMs,
      result,
      logEntry,
      nanotransaction: nanoTx,
      nanotransactionLedger: getNanotransactionSnapshot(12),
    });
  } catch (err) {
    const durationMs = Date.now() - startedMs;
    const errorMessage = err instanceof Error ? err.message : String(err);

    const logEntry = appendStrategyLog(
      'MCP_TOOL_CALL',
      activePrimaryTransport,
      `Degraded Stardust MCP '${tool}' call (${durationMs}ms): ${errorMessage.slice(0, 120)}`,
      {
        tool,
        durationMs,
        ok: false,
        error: errorMessage,
      }
    );

    res.status(502).json({
      ok: false,
      degraded: true,
      tool,
      error: errorMessage,
      logEntry,
    });
  }
});

/**
 * 3. POST /railway-sync
 * Triggers live Railway PostgreSQL cloud-sync and invalidates overview cache.
 */
stardustMcpRouter.post('/railway-sync', async (_req: Request, res: Response) => {
  const startedMs = Date.now();

  try {
    const [syncData, gatewayHealth] = await Promise.all([
      fetchJsonWithTimeout(`${RAILWAY_GATEWAY_BASE}/api/cloud-sync`),
      fetchJsonWithTimeout(`${RAILWAY_GATEWAY_BASE}/health`).catch(() => null),
    ]);

    const durationMs = Date.now() - startedMs;
    invalidateOverviewCache();

    const syncObj =
      syncData && typeof syncData === 'object'
        ? (syncData as Record<string, unknown>)
        : {};
    const syncRecord = syncObj.record;
    const recordId =
      syncRecord && typeof syncRecord === 'object'
        ? (syncRecord as Record<string, unknown>).id
        : undefined;

    const nanoTx = emitEphemeralNanotransaction({
      ephemeralResourceId: `zone-sync-${recordId ?? Date.now()}`,
      arena: 'CLOUDFLARE_ZONE_SYNC_CONDUIT',
      actionType: 'SOVEREIGN_STATE_COMMIT',
      actorId: 'AEG-JARVIS-PRIME',
      computeUnits: 20,
      computeTimeMs: Math.max(1, durationMs),
      chain: 'xrpl',
    });

    const logEntry = appendStrategyLog(
      'RAILWAY_POSTGRES_SYNC',
      activePrimaryTransport,
      `Synchronized sovereign mesh posture${
        recordId !== undefined ? ` (record #${String(recordId)})` : ''
      } in ${durationMs}ms · Minted +${nanoTx.totalRewardSov} AEG-SOV.`,
      {
        durationMs,
        recordId: recordId ?? null,
        nanoTxId: nanoTx.nanoTxId,
        gatewayHealthy: Boolean(
          gatewayHealth &&
            typeof gatewayHealth === 'object' &&
            (gatewayHealth as Record<string, unknown>).ok
        ),
      }
    );

    res.json({
      ...syncObj,
      ok: true,
      zone: 'aegentixcybernetics.com',
      durationMs,
      syncData,
      gatewayHealth,
      logEntry,
      nanotransaction: nanoTx,
      nanotransactionLedger: getNanotransactionSnapshot(12),
    });
  } catch (err) {
    const durationMs = Date.now() - startedMs;
    const errorMessage = err instanceof Error ? err.message : String(err);

    const logEntry = appendStrategyLog(
      'RAILWAY_POSTGRES_SYNC',
      activePrimaryTransport,
      `Railway PostgreSQL sync unreachable (${durationMs}ms): ${errorMessage.slice(0, 120)}`,
      {
        durationMs,
        ok: false,
        error: errorMessage,
      }
    );

    res.status(502).json({
      ok: false,
      degraded: true,
      error: errorMessage,
      syncData: {
        ok: false,
        degraded: true,
        persisted_to_postgres: false,
        error: errorMessage,
      },
      logEntry,
    });
  }
});

/**
 * 4. GET /logs & POST /logs
 * Inspect or append VES-1 hash-chained satellite strategy logs.
 */
stardustMcpRouter.get('/logs', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    count: strategyLogs.length,
    chainValid: verifyLogChain(),
    logs: strategyLogs,
  });
});

stardustMcpRouter.post('/logs', (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    eventType?: unknown;
    transport?: unknown;
    summary?: unknown;
    metadata?: unknown;
  };

  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  if (!summary) {
    res.status(400).json({
      ok: false,
      error: "Field 'summary' (non-empty string) is required to append a VES-1 strategy log.",
    });
    return;
  }

  const eventType =
    typeof body.eventType === 'string' && body.eventType.trim()
      ? body.eventType.trim()
      : 'OPERATOR_STRATEGY_NOTE';

  const transport =
    typeof body.transport === 'string' && body.transport.trim()
      ? body.transport.trim()
      : activePrimaryTransport;

  const metadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  const logEntry = appendStrategyLog(eventType, transport, summary, metadata);
  invalidateOverviewCache();

  res.status(201).json({
    ok: true,
    chainValid: verifyLogChain(),
    logEntry,
    entry: logEntry,
  });
});

/**
 * 5. POST /failover
 * Evaluates or executes multi-transport physical layer failover and logs VES-1 proof.
 */
stardustMcpRouter.post('/failover', (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    targetTransport?: unknown;
    transport?: unknown;
    simulatedPrimaryLatencyMs?: unknown;
    autoFailoverThresholdMs?: unknown;
  };

  if (
    typeof body.autoFailoverThresholdMs === 'number' &&
    Number.isFinite(body.autoFailoverThresholdMs) &&
    body.autoFailoverThresholdMs >= 10 &&
    body.autoFailoverThresholdMs <= 2000
  ) {
    autoFailoverThresholdMs = Math.round(body.autoFailoverThresholdMs);
  }

  const previousTransport = activePrimaryTransport;
  const currentPrimaryObj = transports.find((t) => t.id === activePrimaryTransport);

  if (
    currentPrimaryObj &&
    typeof body.simulatedPrimaryLatencyMs === 'number' &&
    Number.isFinite(body.simulatedPrimaryLatencyMs) &&
    body.simulatedPrimaryLatencyMs >= 1
  ) {
    currentPrimaryObj.latencyMs = Math.round(body.simulatedPrimaryLatencyMs);
    currentPrimaryObj.lastUpdatedUtc = new Date().toISOString();
  }

  let nextTransport: TransportId = activePrimaryTransport;
  let reason = '';

  const requestedTarget =
    typeof body.targetTransport === 'string' && body.targetTransport.trim()
      ? body.targetTransport.trim()
      : typeof body.transport === 'string' && body.transport.trim()
        ? body.transport.trim()
        : '';

  if (requestedTarget) {
    if (!isTransportId(requestedTarget)) {
      res.status(400).json({
        ok: false,
        error: `Unknown transport '${requestedTarget}'. Valid transports: ${transports
          .map((t) => t.id)
          .join(', ')}`,
      });
      return;
    }
    nextTransport = requestedTarget;
    reason = `Manual sovereign switchover from ${previousTransport} to ${nextTransport}.`;
  } else if (
    typeof body.simulatedPrimaryLatencyMs === 'number' &&
    Number.isFinite(body.simulatedPrimaryLatencyMs)
  ) {
    const simLatency = Math.round(body.simulatedPrimaryLatencyMs);
    if (simLatency > autoFailoverThresholdMs) {
      const candidates = [...transports]
        .filter((t) => t.id !== activePrimaryTransport && t.id !== 'QUANTUM_PQC')
        .sort((a, b) => a.priority - b.priority);

      const bestCandidate =
        candidates.find((c) => c.latencyMs <= autoFailoverThresholdMs) || candidates[0];
      if (bestCandidate) {
        nextTransport = bestCandidate.id;
      }
      if (currentPrimaryObj) {
        currentPrimaryObj.status = 'degraded';
      }
      reason = `Auto-failover triggered: ${previousTransport} latency ${simLatency}ms exceeded ${autoFailoverThresholdMs}ms threshold -> promoted ${nextTransport} (${
        bestCandidate?.latencyMs ?? 0
      }ms).`;
    } else {
      reason = `Primary ${previousTransport} latency ${simLatency}ms within ${autoFailoverThresholdMs}ms threshold; nominal lock retained.`;
    }
  } else {
    const rotationOrder: TransportId[] = [
      'STARLINK_AS14593',
      'TELESAT_LIGHTSPEED',
      'BONDED_5G',
      'LORA_915',
    ];
    const idx = rotationOrder.indexOf(activePrimaryTransport);
    nextTransport = rotationOrder[(idx + 1) % rotationOrder.length];
    reason = `Sequential physical-layer failover drill: ${previousTransport} -> ${nextTransport}.`;
  }

  const degradedBeforeSync =
    currentPrimaryObj &&
    currentPrimaryObj.id !== nextTransport &&
    typeof body.simulatedPrimaryLatencyMs === 'number' &&
    body.simulatedPrimaryLatencyMs > autoFailoverThresholdMs;

  syncTransportStates(nextTransport);
  if (degradedBeforeSync && currentPrimaryObj) {
    currentPrimaryObj.status = 'degraded';
  }

  const nexusAgent = stationAgents.find((a) => a.id === 'NEXUS-ROUTER');
  if (nexusAgent) {
    moveAgentToRoom(nexusAgent, 'STARLINK_ARRAY', 'ROUTING', reason);
  }

  const failoverTriggered = previousTransport !== nextTransport;
  const logEntry = appendStrategyLog('TRANSPORT_FAILOVER', nextTransport, reason, {
    previousTransport,
    activePrimaryTransport: nextTransport,
    failoverTriggered,
    autoFailoverThresholdMs,
    simulatedPrimaryLatencyMs:
      typeof body.simulatedPrimaryLatencyMs === 'number'
        ? Math.round(body.simulatedPrimaryLatencyMs)
        : null,
  });

  invalidateOverviewCache();

  const failoverNanoTx = emitEphemeralNanotransaction({
    ephemeralResourceId: `failover-${activePrimaryTransport}-${Date.now()}`,
    arena: 'STARLINK_MULTI_TRANSPORT_MESH',
    actionType: 'AUTONOMOUS_TRANSPORT_FAILOVER',
    actorId: 'NEXUS-ROUTER',
    computeUnits: 15,
    computeTimeMs: 4.8,
    chain: 'xrpl',
    contextPayload: { previousTransport, activePrimaryTransport },
  });

  res.json({
    ok: true,
    zone: 'aegentixcybernetics.com',
    failoverTriggered,
    previousTransport,
    activePrimaryTransport,
    autoFailoverThresholdMs,
    transports,
    stationAgents,
    logEntry,
    nanotransaction: failoverNanoTx,
    nanotransactionLedger: getNanotransactionSnapshot(12),
  });
});

/**
 * 6. POST /spar
 * Runs a deterministic SHA-256 CyberGym sparring round between 2 StarNet station agents
 * in CYBERGYM_DOJO, updating ELO ratings, win/loss records, and room positions.
 */
stardustMcpRouter.post('/spar', (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    challengerId?: unknown;
    defenderId?: unknown;
    drill?: unknown;
  };

  sparRoundCounter += 1;

  let challenger: StarNetStationAgent | undefined;
  let defender: StarNetStationAgent | undefined;

  if (typeof body.challengerId === 'string' && body.challengerId.trim()) {
    const normalizedChallenger = body.challengerId.trim().toUpperCase();
    challenger = stationAgents.find((a) => a.id === normalizedChallenger);
    if (!challenger) {
      res.status(400).json({
        ok: false,
        error: `Unknown challengerId '${body.challengerId}'.`,
      });
      return;
    }
  } else {
    challenger = stationAgents[(sparRoundCounter - 1) % stationAgents.length];
  }

  if (typeof body.defenderId === 'string' && body.defenderId.trim()) {
    const normalizedDefender = body.defenderId.trim().toUpperCase();
    defender = stationAgents.find((a) => a.id === normalizedDefender);
    if (!defender) {
      res.status(400).json({
        ok: false,
        error: `Unknown defenderId '${body.defenderId}'.`,
      });
      return;
    }
  } else {
    defender = stationAgents.find((a) => a.id !== challenger!.id) || stationAgents[1];
  }

  if (challenger.id === defender.id) {
    res.status(400).json({
      ok: false,
      error: 'Challenger and defender must be distinct StarNet station agents.',
    });
    return;
  }

  const defaultDrills = [
    'PQC_KYBER1024_BEAM_INTERCEPT_DEFENSE',
    'XRPL_BLACKHOLE_INVARIANT_STRESS_TEST',
    'STARLINK_AS14593_JAMMING_FAILOVER_DRILL',
    'FIDO2_ZERO_TRUST_BYPASS_CONTAINMENT',
  ];
  const drill =
    typeof body.drill === 'string' && body.drill.trim()
      ? body.drill.trim()
      : defaultDrills[(sparRoundCounter - 1) % defaultDrills.length];

  const timestamp = new Date().toISOString();
  const chainTip = strategyLogs[0]?.entryHash || GENESIS_PREV_HASH;
  const proofSha256 = crypto
    .createHash('sha256')
    .update(
      `${chainTip}:${timestamp}:${challenger.id}:${defender.id}:${drill}:${sparRoundCounter}`
    )
    .digest('hex');

  const cEntropy = parseInt(proofSha256.slice(0, 8), 16) % 36; // 0..35
  const dEntropy = parseInt(proofSha256.slice(8, 16), 16) % 36; // 0..35

  const challengerBase = 62 + Math.round((challenger.elo - 1750) / 25);
  const defenderBase = 62 + Math.round((defender.elo - 1750) / 25);

  const challengerScore = Math.min(99, Math.max(50, challengerBase + cEntropy));
  const defenderScore = Math.min(99, Math.max(50, defenderBase + dEntropy));

  const challengerEloBefore = challenger.elo;
  const defenderEloBefore = defender.elo;

  const expectedChallenger =
    1 / (1 + Math.pow(10, (defenderEloBefore - challengerEloBefore) / 400));
  const kFactor = 24;

  let actualChallengerOutcome = 0.5;
  let winnerId: StationAgentId | 'DRAW' = 'DRAW';

  if (challengerScore > defenderScore) {
    actualChallengerOutcome = 1;
    winnerId = challenger.id;
    challenger.wins += 1;
    defender.losses += 1;
  } else if (defenderScore > challengerScore) {
    actualChallengerOutcome = 0;
    winnerId = defender.id;
    defender.wins += 1;
    challenger.losses += 1;
  } else {
    challenger.draws += 1;
    defender.draws += 1;
  }

  const rawDelta = Math.round(kFactor * (actualChallengerOutcome - expectedChallenger));
  const eloDelta =
    winnerId === 'DRAW' ? rawDelta : Math.max(4, Math.abs(rawDelta)) * (actualChallengerOutcome === 1 ? 1 : -1);

  challenger.elo = Math.max(1200, challengerEloBefore + eloDelta);
  defender.elo = Math.max(1200, defenderEloBefore - eloDelta);

  const narrative =
    winnerId === 'DRAW'
      ? `${challenger.callsign} and ${defender.callsign} deadlocked ${challengerScore}-${defenderScore} on '${drill}' in CYBERGYM_DOJO.`
      : `${winnerId} prevailed (${challenger.callsign} ${challengerScore} vs ${defender.callsign} ${defenderScore}) in '${drill}' [ELO ${
          eloDelta >= 0 ? `+${eloDelta}` : eloDelta
        }].`;

  moveAgentToRoom(challenger, 'CYBERGYM_DOJO', 'SPARRING', narrative);
  moveAgentToRoom(defender, 'CYBERGYM_DOJO', 'SPARRING', narrative);

  const nonSparring = stationAgents.filter(
    (a) => a.id !== challenger!.id && a.id !== defender!.id
  );
  nonSparring.forEach((agent, idx) => {
    const nextRoom =
      PATROL_ROOMS[(sparRoundCounter + idx) % PATROL_ROOMS.length];
    const defaultPosture: StarNetStationAgent['posture'] =
      agent.id === 'AEGIS-PRIME'
        ? 'COMMANDING'
        : agent.id === 'QUANT-ALPHA'
          ? 'ANALYZING'
          : agent.id === 'SENTINEL-ZERO'
            ? 'AUDITING'
            : 'ROUTING';
    moveAgentToRoom(
      agent,
      nextRoom,
      defaultPosture,
      `Station patrol shift to ${nextRoom} while CyberGym round #${sparRoundCounter} executes.`
    );
  });

  const round: CyberGymSparRound = {
    roundId: `spar-${String(sparRoundCounter).padStart(4, '0')}`,
    timestamp,
    room: 'CYBERGYM_DOJO',
    drill,
    challengerId: challenger.id,
    defenderId: defender.id,
    challengerScore,
    defenderScore,
    winnerId,
    challengerEloBefore,
    challengerEloAfter: challenger.elo,
    defenderEloBefore,
    defenderEloAfter: defender.elo,
    eloDelta: Math.abs(eloDelta),
    proofSha256,
    narrative,
  };

  const resolvedWinner = winnerId === 'DRAW' ? challenger.id : winnerId;
  const resolvedLoser = resolvedWinner === challenger.id ? defender.id : challenger.id;

  const sparNanoTx = emitEphemeralNanotransaction({
    ephemeralResourceId: round.roundId,
    arena: 'STARNET_CYBERGYM_DOJO',
    actionType: `DOJO_SPAR_${drill}`,
    actorId: resolvedWinner,
    computeUnits: 22,
    computeTimeMs: 14.2,
    chain: 'xrpl',
    contextPayload: { roundId: round.roundId, winner: resolvedWinner, eloDelta: Math.abs(eloDelta) },
  });

  const logEntry = appendStrategyLog(
    'CYBERGYM_SPAR',
    'QUANTUM_PQC',
    `${narrative} · Co-earned +${sparNanoTx.totalRewardSov} AEG-SOV (70% Operator / 30% ${resolvedWinner}).`,
    {
      roundId: round.roundId,
      drill,
      winnerId,
      challengerId: challenger.id,
      defenderId: defender.id,
      challengerScore,
      defenderScore,
      proofSha256,
      nanoTxId: sparNanoTx.nanoTxId,
      totalRewardSov: sparNanoTx.totalRewardSov,
    }
  );

  invalidateOverviewCache();

  res.json({
    ok: true,
    zone: 'aegentixcybernetics.com',
    winner: resolvedWinner,
    loser: resolvedLoser,
    eloDelta: Math.abs(eloDelta),
    summary: narrative,
    round,
    stationAgents,
    logEntry,
    nanotransaction: sparNanoTx,
    nanotransactionLedger: getNanotransactionSnapshot(12),
  });
});

/**
 * 7. GET /rog-bridge
 * Metadata & zero-secret-exposure deployment instructions for the ROG RC73XA Starlink Mini forwarder.
 */
stardustMcpRouter.get('/rog-bridge', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    hardwareProfile: {
      workstation: 'ASUSTeK COMPUTER INC. ROG Xbox Ally X (RC73XA)',
      identity: 'AEG-JARVIS-PRIME',
      npu: 'AMD Ryzen AI Z2 Extreme (XDNA 2 // 50 TOPS)',
      expectedUplinkAsn: 'AS14593 (SpaceX Starlink Mini Gen 3)',
    },
    endpoints: {
      edgeHealth: `${STARLINK_EDGE_BASE}/health`,
      telemetryIngest: `${STARLINK_EDGE_BASE}/api/starlink/telemetry`,
      mcpJsonRpc: `${STARLINK_EDGE_BASE}/mcp`,
    },
    authentication: {
      headerFormat: 'Authorization: Bearer <STARLINK_TELEMETRY_TOKEN>',
      tokenEnvVar: 'STARLINK_TELEMETRY_TOKEN',
      zeroSecretExposurePolicy:
        'Scripts auto-discover STARLINK_TELEMETRY_TOKEN from environment or local .env files on RC73XA and never print or log secret values.',
    },
    localDishSources: {
      httpBridge: 'http://127.0.0.1:8790',
      probedRoutes: ['/status', '/health', 'POST /mcp'],
      dishGrpcSocket: '192.168.100.1:9200',
    },
    forwarderArtifacts: {
      powershellPublicPath: '/rog-starlink-forwarder.ps1',
      nodeScriptRepoPath: 'scripts/rog-starlink-forwarder.mjs',
    },
    operatorCommands: {
      powershellOnce: 'pwsh -ExecutionPolicy Bypass -File .\\public\\rog-starlink-forwarder.ps1 -Once',
      powershellWatch:
        'pwsh -ExecutionPolicy Bypass -File .\\public\\rog-starlink-forwarder.ps1 -Watch -IntervalSeconds 15',
      nodeOnce: 'node scripts/rog-starlink-forwarder.mjs --once',
      nodeWatch: 'node scripts/rog-starlink-forwarder.mjs --watch --interval 15',
    },
  });
});
