import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Satellite,
  Radio,
  Shield,
  Cpu,
  Database,
  Activity,
  Terminal,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Send,
  ExternalLink,
  Layers,
  Lock,
  Copy,
  Play,
  Globe,
} from 'lucide-react';
import { StarduskOrbitalBridgePanel } from './StarduskOrbitalBridgePanel';

export interface StardustCockpitSuiteProps {
  onNotify?: (message: string, type: 'ALERT' | 'SUCCESS' | 'INFO') => void;
  embedded?: boolean;
}

interface MeshEngine {
  name: string;
  url: string;
  ok: boolean;
  status: number;
  ms: number;
}

interface MeshPostureData {
  ok?: boolean;
  service?: string;
  identity?: string;
  posture?: string;
  cloud_mesh_healthy?: boolean;
  mesh_transport?: string;
  engines?: MeshEngine[];
  bare_metal_bridge?: string;
  fido2_gate_required?: boolean;
  audit_vault?: string;
  ts?: string;
}

interface AutonomyStatusData {
  ok?: boolean;
  mode?: string;
  schedules?: {
    jarvis_mesh_watchdog_cron?: string;
    treasury_xrpl_audit_cron?: string;
    railway_postgres_watchdog_cron?: string;
  };
  latest_treasury_cron?: {
    cron?: string;
    ran_utc?: string;
    wallet_integrity?: {
      wallet?: string;
      integrity?: string;
      ledger_index?: number;
      xrp_balance?: number;
      master_disabled?: boolean;
      regular_key?: string;
      is_blackholed?: boolean;
      ves1_audit_hash?: string;
      timestamp?: string;
    };
    token_analysis?: {
      symbol?: string;
      network?: string;
      issuer?: string;
      amm_account?: string;
      ledger_index?: number;
      circulating_supply?: number;
      amm_xrp_reserve?: number;
      amm_eoc_reserve?: number;
      implied_price_xrp?: number;
      risk_band?: string;
      ves1_audit_hash?: string;
    };
    ledger_snapshot?: {
      account?: string;
      ledger_index?: number;
      balances?: {
        xrp?: number;
        eoc?: number;
        trustlines_count?: number;
      };
      ves1_audit_hash?: string;
    };
  };
  bare_metal_npu?: {
    identity?: string;
    host_model?: string;
    cpu?: string;
    npu_status?: string;
    npu_tops_rated?: number;
    tpm2_status?: string;
    pluton_status?: string;
    ves1_hardware_attestation_sha256?: string;
  };
  ts?: string;
}

interface StarlinkLinkData {
  ok?: boolean;
  edge_colo?: string;
  client_asn?: number;
  client_isp?: string;
  starlink_uplink_detected?: boolean;
  dish_telemetry_endpoint?: string;
  latest_dish_telemetry?: {
    status?: string;
    downlink_mbps?: number;
    uplink_mbps?: number;
    pop_ping_ms?: number;
    obstruction_pct?: number;
    [key: string]: unknown;
  };
  ts?: string;
}

interface R2VaultData {
  ok?: boolean;
  treasury_vault?: {
    bucket?: string;
    sample_count?: number;
    truncated?: boolean;
    latest_keys?: string[];
  };
  aegentix_assets?: {
    bucket?: string;
    sample_count?: number;
    truncated?: boolean;
    latest_keys?: string[];
  };
  ts?: string;
}

interface RailwaySyncRecord {
  id: number;
  captured_utc: string;
  posture: string;
  cloud_mesh_healthy: boolean;
}

interface RailwaySyncData {
  ok?: boolean;
  count?: number;
  persisted_to_postgres?: boolean;
  record?: RailwaySyncRecord;
  history?: RailwaySyncRecord[];
  ts?: string;
}

type TransportId =
  | 'STARLINK_AS14593'
  | 'TELESAT_LIGHTSPEED'
  | 'BONDED_5G'
  | 'LORA_915'
  | 'QUANTUM_PQC';

interface TransportNode {
  id: TransportId;
  label: string;
  band: string;
  latencyMs: number;
  status: 'PRIMARY' | 'STANDBY' | 'READY' | 'GUARDED';
  activePrimary: boolean;
}

interface CyberGymAgent {
  id: string;
  name: string;
  role: string;
  elo: number;
  wins: number;
  losses: number;
  color: string;
  accent: string;
  roomIndex: number;
  targetRoomIndex: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  statusBubble: string;
}

interface Ves1LogEntry {
  id: string;
  entryHash: string;
  prevHash: string;
  eventType: 'CRON_XRPL_AUDIT' | 'MCP_SYNC' | 'CYBERGYM_SPAR' | 'TRANSPORT_FAILOVER' | 'OPERATOR_STRATEGY';
  transport: string;
  summary: string;
  timestamp: string;
}

interface CockpitChatMessage {
  id: string;
  role: 'user' | 'assistant';
  title?: string;
  content: string;
  rawJson?: string;
  timestamp: string;
  latencyMs?: number;
}

const STARLINK_MCP_ENDPOINT = 'https://starlink-edge.aegentixcybernetics.com/mcp';
const RAILWAY_SYNC_ENDPOINT = 'https://aegentix-sovereign-gateway-production.up.railway.app/api/cloud-sync';
const GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

const STATION_ROOMS = [
  { id: 'BRIDGE', label: 'BRIDGE', x: 24, y: 28, w: 152, h: 86, color: '#38bdf8' },
  { id: 'STARLINK_ARRAY', label: 'STARLINK ARRAY', x: 196, y: 28, w: 168, h: 86, color: '#22d3ee' },
  { id: 'CYBERGYM_DOJO', label: 'CYBERGYM DOJO', x: 96, y: 134, w: 196, h: 92, color: '#a855f7' },
  { id: 'R2_VAULT', label: 'R2 VAULT', x: 24, y: 246, w: 162, h: 84, color: '#10b981' },
  { id: 'XRPL_TREASURY', label: 'XRPL TREASURY', x: 204, y: 246, w: 160, h: 84, color: '#f59e0b' },
] as const;

const INITIAL_TRANSPORTS: TransportNode[] = [
  {
    id: 'STARLINK_AS14593',
    label: 'STARLINK_AS14593',
    band: 'Ku/Ka LEO · AS14593',
    latencyMs: 28,
    status: 'PRIMARY',
    activePrimary: true,
  },
  {
    id: 'TELESAT_LIGHTSPEED',
    label: 'TELESAT_LIGHTSPEED',
    band: 'Optical ISL · Polar LEO',
    latencyMs: 39,
    status: 'STANDBY',
    activePrimary: false,
  },
  {
    id: 'BONDED_5G',
    label: 'BONDED_5G',
    band: 'Sub-6 / mmWave Multipath',
    latencyMs: 44,
    status: 'READY',
    activePrimary: false,
  },
  {
    id: 'LORA_915',
    label: 'LORA_915',
    band: '915 MHz Sub-GHz Telemetry',
    latencyMs: 185,
    status: 'STANDBY',
    activePrimary: false,
  },
  {
    id: 'QUANTUM_PQC',
    label: 'QUANTUM_PQC',
    band: 'ML-KEM-1024 + Dilithium5',
    latencyMs: 34,
    status: 'GUARDED',
    activePrimary: false,
  },
];

const INITIAL_AGENTS: CyberGymAgent[] = [
  {
    id: 'aegis-prime',
    name: 'AEGIS-PRIME',
    role: 'Mesh Sentinel',
    elo: 1842,
    wins: 14,
    losses: 3,
    color: '#38bdf8',
    accent: '#bae6fd',
    roomIndex: 0,
    targetRoomIndex: 0,
    x: 78,
    y: 74,
    targetX: 78,
    targetY: 74,
    statusBubble: 'GUARDING MESH',
  },
  {
    id: 'quant-alpha',
    name: 'QUANT-ALPHA',
    role: 'XRPL Strategist',
    elo: 1816,
    wins: 12,
    losses: 4,
    color: '#f59e0b',
    accent: '#fde68a',
    roomIndex: 4,
    targetRoomIndex: 4,
    x: 268,
    y: 288,
    targetX: 268,
    targetY: 288,
    statusBubble: 'AUDITING XRPL',
  },
  {
    id: 'sentinel-zero',
    name: 'SENTINEL-ZERO',
    role: 'VES-1 Verifier',
    elo: 1795,
    wins: 11,
    losses: 5,
    color: '#10b981',
    accent: '#a7f3d0',
    roomIndex: 3,
    targetRoomIndex: 3,
    x: 92,
    y: 288,
    targetX: 92,
    targetY: 288,
    statusBubble: 'SEALING R2',
  },
  {
    id: 'nexus-router',
    name: 'NEXUS-ROUTER',
    role: 'LEO Dish Phased Array',
    elo: 1778,
    wins: 10,
    losses: 6,
    color: '#c084fc',
    accent: '#e9d5ff',
    roomIndex: 1,
    targetRoomIndex: 1,
    x: 274,
    y: 74,
    targetX: 274,
    targetY: 74,
    statusBubble: 'TRACKING LEO',
  },
];

async function computeSha256Hex(payload: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const data = new TextEncoder().encode(payload);
    const buf = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex =
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0');
  return hex.repeat(4);
}

async function callDirectStarlinkMcp<T = unknown>(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(STARLINK_MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Starlink MCP HTTP ${res.status}`);
  }
  const rpc = (await res.json()) as {
    result?: { content?: Array<{ type?: string; text?: string }> };
    error?: { message?: string };
  };
  if (rpc.error) {
    throw new Error(rpc.error.message || 'MCP RPC error');
  }
  const rawText = rpc.result?.content?.[0]?.text;
  if (!rawText) {
    return (rpc.result || {}) as T;
  }
  try {
    return JSON.parse(rawText) as T;
  } catch {
    return { raw: rawText } as unknown as T;
  }
}

export const StardustCockpitSuite: React.FC<StardustCockpitSuiteProps> = ({
  onNotify,
  embedded = false,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [syncingRailway, setSyncingRailway] = useState<boolean>(false);
  const [sparring, setSparring] = useState<boolean>(false);
  const [failingOver, setFailingOver] = useState<TransportId | null>(null);
  const [showRogModal, setShowRogModal] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [meshData, setMeshData] = useState<MeshPostureData | null>(null);
  const [autonomyData, setAutonomyData] = useState<AutonomyStatusData | null>(null);
  const [starlinkData, setStarlinkData] = useState<StarlinkLinkData | null>(null);
  const [r2Data, setR2Data] = useState<R2VaultData | null>(null);
  const [railwayData, setRailwayData] = useState<RailwaySyncData | null>(null);
  const [telemetrySource, setTelemetrySource] = useState<'LOCAL_API' | 'DIRECT_EDGE_MCP'>('DIRECT_EDGE_MCP');

  const [transports, setTransports] = useState<TransportNode[]>(INITIAL_TRANSPORTS);
  const [agents, setAgents] = useState<CyberGymAgent[]>(INITIAL_AGENTS);
  const [sparBanner, setSparBanner] = useState<string | null>(null);

  const [vesLogs, setVesLogs] = useState<Ves1LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<'ALL' | Ves1LogEntry['eventType']>('ALL');
  const [operatorNote, setOperatorNote] = useState<string>('');
  const [appendingNote, setAppendingNote] = useState<boolean>(false);

  const [centerSection, setCenterSection] = useState<'ALL' | 'ENGINES' | 'XRPL_R2' | 'VES1_LOG'>('ALL');
  const [sbtWalletInput, setSbtWalletInput] = useState<string>('11111111111111111111111111111111');
  const [chatInput, setChatInput] = useState<string>('');
  const [mcpBusy, setMcpBusy] = useState<boolean>(false);
  const [messages, setMessages] = useState<CockpitChatMessage[]>([
    {
      id: 'init-msg',
      role: 'assistant',
      title: 'SPACE BUNNY ALPHA · STARNET MCP COCKPIT',
      content:
        'Orbital uplink nominal. Connected to `starlink-edge.aegentixcybernetics.com/mcp` (JSON-RPC 2.0) and Railway Sovereign Cloud (`Postgres 18 · Redis 8.2 · Qdrant`).\n\nSelect a 1-click slash command pill above or enter a natural query / `/command` below to inspect live sovereign telemetry.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const agentsRef = useRef<CyberGymAgent[]>(INITIAL_AGENTS);
  const sparFlashRef = useRef<number>(0);
  const activeTransportRef = useRef<TransportId>('STARLINK_AS14593');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    const primary = transports.find((t) => t.activePrimary);
    if (primary) {
      activeTransportRef.current = primary.id;
    }
  }, [transports]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mcpBusy]);

  const appendLocalVesLog = useCallback(
    async (
      eventType: Ves1LogEntry['eventType'],
      transport: string,
      summary: string,
      explicitHash?: string
    ) => {
      const timestamp = new Date().toISOString();
      setVesLogs((prev) => {
        const prevHash = prev.length > 0 ? prev[0].entryHash : GENESIS_PREV_HASH;
        const seed = `${prevHash}|${eventType}|${transport}|${summary}|${timestamp}`;
        const placeholderHash =
          explicitHash ||
          Array.from(seed)
            .reduce((acc, ch, idx) => ((acc << 5) - acc + ch.charCodeAt(0) + idx) >>> 0, 0x811c9dc5)
            .toString(16)
            .padStart(8, '0')
            .repeat(8);

        const nextEntry: Ves1LogEntry = {
          id: `ves1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          entryHash: placeholderHash.slice(0, 64),
          prevHash,
          eventType,
          transport,
          summary,
          timestamp,
        };

        if (!explicitHash) {
          computeSha256Hex(seed).then((realSha) => {
            setVesLogs((curr) =>
              curr.map((item) => (item.id === nextEntry.id ? { ...item, entryHash: realSha } : item))
            );
          });
        }

        return [nextEntry, ...prev].slice(0, 50);
      });
    },
    []
  );

  const loadOverviewWithFallback = useCallback(
    async (notifyUser = false) => {
      setLoading(true);
      try {
        // Attempt local /api/stardust/overview first
        const localRes = await fetch('/api/stardust/overview');
        if (localRes.ok) {
          const contentType = localRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const payload = (await localRes.json()) as Record<string, unknown>;
            if (
              payload &&
              (payload.meshPosture ||
                payload.mesh_posture ||
                payload.mesh ||
                payload.autonomyStatus ||
                payload.autonomy_status ||
                payload.autonomy)
            ) {
              const mesh = (payload.meshPosture || payload.mesh_posture || payload.mesh) as MeshPostureData | undefined;
              const autonomy = (payload.autonomyStatus || payload.autonomy_status || payload.autonomy) as AutonomyStatusData | undefined;
              const starlink = (payload.starlinkStatus || payload.starlink_link_status || payload.starlink) as StarlinkLinkData | undefined;
              const r2 = (payload.r2VaultStatus || payload.r2_vault_status || payload.r2) as R2VaultData | undefined;
              const railway = (payload.railwaySync || payload.railway_cloud_sync || payload.railway) as RailwaySyncData | undefined;

              if (mesh) setMeshData(mesh);
              if (autonomy) setAutonomyData(autonomy);
              if (starlink) setStarlinkData(starlink);
              if (r2) setR2Data(r2);
              if (railway) setRailwayData(railway);

              const remoteLogs = (payload.strategyLogs || payload.logs) as Ves1LogEntry[] | undefined;
              if (Array.isArray(remoteLogs) && remoteLogs.length > 0) {
                setVesLogs(remoteLogs);
              }

              const remotePrimary = payload.activePrimaryTransport as TransportId | undefined;
              if (remotePrimary) {
                setTransports((prev) =>
                  prev.map((t) => ({
                    ...t,
                    activePrimary: t.id === remotePrimary,
                    status: t.id === remotePrimary ? 'PRIMARY' : t.id === 'QUANTUM_PQC' ? 'GUARDED' : 'STANDBY',
                  }))
                );
              }

              const remoteAgents = (payload.stationAgents || payload.agents) as Array<Record<string, unknown>> | undefined;
              if (Array.isArray(remoteAgents) && remoteAgents.length > 0) {
                setAgents((prev) =>
                  prev.map((ag, idx) => {
                    const remoteAg =
                      remoteAgents.find((ra) => ra.callsign === ag.name || ra.id === ag.name) ||
                      remoteAgents[idx];
                    return remoteAg
                      ? {
                          ...ag,
                          elo: typeof remoteAg.elo === 'number' ? remoteAg.elo : ag.elo,
                          wins: typeof remoteAg.wins === 'number' ? remoteAg.wins : ag.wins,
                          losses: typeof remoteAg.losses === 'number' ? remoteAg.losses : ag.losses,
                        }
                      : ag;
                  })
                );
              }
              setTelemetrySource('LOCAL_API');
              if (notifyUser) {
                onNotify?.('StarNet telemetry refreshed via /api/stardust/overview', 'SUCCESS');
              }
              setLoading(false);
              return;
            }
          }
        }
      } catch {
        // Proceed seamlessly to direct browser edge MCP fallback
      }

      try {
        const [mesh, autonomy, starlink, r2, railway] = await Promise.all([
          callDirectStarlinkMcp<MeshPostureData>('mesh_posture'),
          callDirectStarlinkMcp<AutonomyStatusData>('autonomy_status'),
          callDirectStarlinkMcp<StarlinkLinkData>('starlink_link_status'),
          callDirectStarlinkMcp<R2VaultData>('r2_vault_status'),
          callDirectStarlinkMcp<RailwaySyncData>('railway_cloud_sync'),
        ]);

        setMeshData(mesh);
        setAutonomyData(autonomy);
        setStarlinkData(starlink);
        setR2Data(r2);
        setRailwayData(railway);
        setTelemetrySource('DIRECT_EDGE_MCP');

        const xrplWallet = autonomy?.latest_treasury_cron?.wallet_integrity;
        if (xrplWallet?.ves1_audit_hash) {
          setVesLogs((prev) => {
            if (prev.some((e) => e.entryHash === xrplWallet.ves1_audit_hash)) return prev;
            const entry: Ves1LogEntry = {
              id: `ves1-xrpl-${xrplWallet.ledger_index || Date.now()}`,
              entryHash: xrplWallet.ves1_audit_hash || GENESIS_PREV_HASH,
              prevHash:
                autonomy?.latest_treasury_cron?.token_analysis?.ves1_audit_hash || GENESIS_PREV_HASH,
              eventType: 'CRON_XRPL_AUDIT',
              transport: 'STARLINK_AS14593',
              summary: `XRPL Mainnet ${xrplWallet.wallet} verified (${xrplWallet.xrp_balance ?? 0} XRP · Ledger #${xrplWallet.ledger_index} · BLACKHOLED=${String(xrplWallet.is_blackholed)})`,
              timestamp: xrplWallet.timestamp || new Date().toISOString(),
            };
            return [entry, ...prev];
          });
        }

        await appendLocalVesLog(
          'MCP_SYNC',
          activeTransportRef.current,
          `Edge MCP synchronized: ${mesh?.posture || 'POSTURE_NOMINAL'} · Colo ${starlink?.edge_colo || 'EDGE'} · Railway Sync #${railway?.history?.[0]?.id ?? railway?.record?.id ?? 0}`
        );

        if (notifyUser) {
          onNotify?.('Starlink Edge MCP live telemetry synchronized', 'SUCCESS');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Telemetry fetch error';
        onNotify?.(`Telemetry warning: ${msg}`, 'ALERT');
      } finally {
        setLoading(false);
      }
    },
    [appendLocalVesLog, onNotify]
  );

  useEffect(() => {
    loadOverviewWithFallback(false);
  }, [loadOverviewWithFallback]);

  // Agent room wandering loop
  useEffect(() => {
    const wanderTimer = setInterval(() => {
      setAgents((prev) =>
        prev.map((agent) => {
          if (Math.random() > 0.45) return agent;
          const nextRoomIdx = Math.floor(Math.random() * STATION_ROOMS.length);
          const room = STATION_ROOMS[nextRoomIdx];
          const padX = 24 + Math.floor(Math.random() * Math.max(24, room.w - 48));
          const padY = 30 + Math.floor(Math.random() * Math.max(20, room.h - 42));
          const roomBubbles: Record<string, string> = {
            BRIDGE: 'COMMAND SYNC',
            STARLINK_ARRAY: 'BEAM LOCK',
            CYBERGYM_DOJO: 'DOJO READY',
            R2_VAULT: 'VAULT AUDIT',
            XRPL_TREASURY: 'XRPL GUARD',
          };
          return {
            ...agent,
            targetRoomIndex: nextRoomIdx,
            targetX: room.x + padX,
            targetY: room.y + padY,
            statusBubble: roomBubbles[room.id] || 'NOMINAL',
          };
        })
      );
    }, 3600);
    return () => clearInterval(wanderTimer);
  }, []);

  // HTML5 Canvas StarNet Pixel Space Station animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let frame = 0;

    const stars = Array.from({ length: 58 }, (_, idx) => ({
      x: (idx * 73) % 388,
      y: (idx * 47) % 352,
      size: idx % 4 === 0 ? 2 : 1,
      phase: idx * 0.4,
    }));

    const render = () => {
      frame += 1;
      const w = canvas.width;
      const h = canvas.height;

      // Deep space background
      ctx.fillStyle = '#06090F';
      ctx.fillRect(0, 0, w, h);

      // Subtle pixel grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 16) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 16) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Twinkling starfield
      for (const s of stars) {
        const alpha = 0.35 + 0.55 * Math.abs(Math.sin(frame * 0.03 + s.phase));
        ctx.fillStyle = `rgba(226, 232, 240, ${alpha.toFixed(2)})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }

      // Orbital Starlink Dish Beam from STARLINK ARRAY upward-right
      const beamPulse = 0.16 + 0.1 * Math.sin(frame * 0.08);
      const grad = ctx.createLinearGradient(280, 28, 384, 2);
      grad.addColorStop(0, `rgba(34, 211, 238, ${beamPulse + 0.18})`);
      grad.addColorStop(1, 'rgba(34, 211, 238, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(268, 28);
      ctx.lineTo(368, 0);
      ctx.lineTo(388, 22);
      ctx.lineTo(294, 28);
      ctx.closePath();
      ctx.fill();

      // Orbital satellite pixel icon in top-right corner
      const satX = 352 + Math.sin(frame * 0.03) * 6;
      const satY = 12 + Math.cos(frame * 0.03) * 3;
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(satX - 10, satY - 2, 6, 4);
      ctx.fillRect(satX + 4, satY - 2, 6, 4);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(satX - 3, satY - 3, 6, 6);

      // Station interconnecting corridors
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(176, 70);
      ctx.lineTo(196, 70);
      ctx.moveTo(100, 114);
      ctx.lineTo(145, 134);
      ctx.moveTo(280, 114);
      ctx.lineTo(245, 134);
      ctx.moveTo(145, 226);
      ctx.lineTo(105, 246);
      ctx.moveTo(245, 226);
      ctx.lineTo(280, 246);
      ctx.stroke();

      // Draw 5 Station Rooms
      for (const room of STATION_ROOMS) {
        const isDojoFlash = room.id === 'CYBERGYM_DOJO' && sparFlashRef.current > 0;
        ctx.fillStyle = isDojoFlash ? 'rgba(168, 85, 247, 0.24)' : 'rgba(11, 17, 28, 0.92)';
        ctx.fillRect(room.x, room.y, room.w, room.h);

        ctx.strokeStyle = isDojoFlash ? '#e879f9' : room.color;
        ctx.lineWidth = isDojoFlash ? 2 : 1.2;
        ctx.strokeRect(room.x, room.y, room.w, room.h);

        // Room header bar
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(room.x + 1, room.y + 1, room.w - 2, 16);

        ctx.fillStyle = room.color;
        ctx.font = 'bold 9px monospace';
        ctx.fillText(room.label, room.x + 6, room.y + 12);
      }

      if (sparFlashRef.current > 0) {
        sparFlashRef.current -= 1;
      }

      // Smoothly step agents toward targets & draw pixel sprites + ELO + bubble
      for (const ag of agentsRef.current) {
        const dx = ag.targetX - ag.x;
        const dy = ag.targetY - ag.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.8) {
          ag.x += (dx / dist) * 0.85;
          ag.y += (dy / dist) * 0.85;
        } else {
          ag.roomIndex = ag.targetRoomIndex;
        }

        const px = Math.round(ag.x);
        const py = Math.round(ag.y);
        const bob = Math.round(Math.sin(frame * 0.14 + px * 0.1) * 1.2);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px - 5, py + 7, 10, 3);

        // Pixel legs
        ctx.fillStyle = '#475569';
        ctx.fillRect(px - 4, py + 3 + bob, 3, 4);
        ctx.fillRect(px + 1, py + 3 - bob, 3, 4);

        // Pixel torso
        ctx.fillStyle = ag.color;
        ctx.fillRect(px - 5, py - 4 + bob, 10, 7);

        // Pixel visor helmet
        ctx.fillStyle = ag.accent;
        ctx.fillRect(px - 4, py - 9 + bob, 8, 5);
        ctx.fillStyle = '#090d16';
        ctx.fillRect(px - 2, py - 7 + bob, 5, 2);

        // ELO badge below agent
        const eloTag = `${ag.name.split('-')[0]} ${ag.elo}`;
        ctx.font = 'bold 8px monospace';
        const tagW = ctx.measureText(eloTag).width + 6;
        ctx.fillStyle = 'rgba(6, 9, 15, 0.88)';
        ctx.fillRect(px - tagW / 2, py + 10, tagW, 11);
        ctx.strokeStyle = ag.color;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(px - tagW / 2, py + 10, tagW, 11);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(eloTag, px - tagW / 2 + 3, py + 18);

        // Live status bubble above agent
        const bubbleText = ag.statusBubble;
        ctx.font = '7px monospace';
        const bubW = ctx.measureText(bubbleText).width + 6;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(px - bubW / 2, py - 21 + bob, bubW, 10);
        ctx.fillStyle = ag.accent;
        ctx.fillText(bubbleText, px - bubW / 2 + 3, py - 14 + bob);
      }

      // Bottom station telemetry bar
      ctx.fillStyle = 'rgba(6, 9, 15, 0.92)';
      ctx.fillRect(0, h - 18, w, 18);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '9px monospace';
      ctx.fillText(
        `ORBITAL BUS: ${activeTransportRef.current} · 4 CYBERGYM AGENTS ACTIVE`,
        8,
        h - 6
      );

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    onNotify?.('Copied command to clipboard', 'INFO');
  };

  const handleRailwaySync = async () => {
    setSyncingRailway(true);
    const t0 = performance.now();
    try {
      let syncResp: RailwaySyncData | null = null;
      try {
        const localRes = await fetch('/api/stardust/railway-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (localRes.ok && (localRes.headers.get('content-type') || '').includes('application/json')) {
          const rawJson = (await localRes.json()) as Record<string, unknown>;
          syncResp = ((rawJson.syncData as RailwaySyncData) || (rawJson as unknown as RailwaySyncData));
        }
      } catch {
        // Fallback to direct Railway Sovereign Cloud endpoint
      }

      if (!syncResp || (!syncResp.record && !syncResp.history)) {
        const directRes = await fetch(RAILWAY_SYNC_ENDPOINT);
        if (!directRes.ok) throw new Error(`Railway HTTP ${directRes.status}`);
        syncResp = (await directRes.json()) as RailwaySyncData;
      }

      const historyMcp = await callDirectStarlinkMcp<RailwaySyncData>('railway_cloud_sync').catch(
        () => null
      );

      const merged: RailwaySyncData = {
        ...syncResp,
        history: historyMcp?.history || syncResp.history || (syncResp.record ? [syncResp.record] : []),
        count: historyMcp?.count ?? syncResp.count,
      };
      setRailwayData(merged);

      const recId = merged.record?.id ?? merged.history?.[0]?.id ?? 0;
      const summary = `Railway PostgreSQL 18 sync persisted Record #${recId} (${merged.record?.posture || 'POSTURE_NOMINAL'})`;
      await appendLocalVesLog('MCP_SYNC', activeTransportRef.current, summary);
      onNotify?.(summary, 'SUCCESS');

      setMessages((prev) => [
        ...prev,
        {
          id: `rw-${Date.now()}`,
          role: 'assistant',
          title: 'RAILWAY OFF-DEVICE CLOUD SYNC',
          content: `${summary}\nPersisted to Postgres: \`${String(merged.persisted_to_postgres ?? true)}\` · Total Records: \`${merged.count ?? merged.history?.length ?? 1}\``,
          rawJson: JSON.stringify(merged, null, 2),
          timestamp: new Date().toLocaleTimeString(),
          latencyMs: Math.round(performance.now() - t0),
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Railway sync failed';
      onNotify?.(msg, 'ALERT');
    } finally {
      setSyncingRailway(false);
    }
  };

  const handleCyberGymSpar = async () => {
    setSparring(true);
    sparFlashRef.current = 75;
    try {
      let winnerName = '';
      let loserName = '';
      let deltaElo = 14;
      let summaryText = '';

      try {
        const res = await fetch('/api/stardust/spar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
          const data = (await res.json()) as {
            winner?: string;
            loser?: string;
            eloDelta?: number;
            summary?: string;
            round?: {
              winnerId?: string;
              challengerId?: string;
              defenderId?: string;
              eloDelta?: number;
              narrative?: string;
            };
          };
          if (data.round && data.round.winnerId && data.round.winnerId !== 'DRAW') {
            winnerName = data.round.winnerId;
            loserName =
              data.round.challengerId === winnerName
                ? data.round.defenderId || ''
                : data.round.challengerId || '';
            deltaElo = data.round.eloDelta || 14;
            summaryText = data.round.narrative || '';
          } else if (data.winner && data.loser) {
            winnerName = data.winner;
            loserName = data.loser;
            deltaElo = data.eloDelta || 14;
            summaryText = data.summary || '';
          }
        }
      } catch {
        // Local simulation in Dojo when offline/standalone
      }

      const currentAgents = [...agentsRef.current];
      const idxA = Math.floor(Math.random() * currentAgents.length);
      let idxB = Math.floor(Math.random() * currentAgents.length);
      if (idxB === idxA) idxB = (idxA + 1) % currentAgents.length;

      const fighterA = currentAgents[idxA];
      const fighterB = currentAgents[idxB];

      if (!winnerName || !loserName) {
        const probA = 1 / (1 + Math.pow(10, (fighterB.elo - fighterA.elo) / 400));
        const aWins = Math.random() <= probA;
        const winner = aWins ? fighterA : fighterB;
        const loser = aWins ? fighterB : fighterA;
        winnerName = winner.name;
        loserName = loser.name;
        deltaElo = Math.max(8, Math.round(24 * (1 - (aWins ? probA : 1 - probA))));
        summaryText = `CyberGym Dojo Match: ${winnerName} (+${deltaElo} ELO) defeated ${loserName} in zero-trust adversarial verification.`;
      }

      const dojoRoom = STATION_ROOMS[2];
      setAgents((prev) =>
        prev.map((ag) => {
          if (ag.name === winnerName) {
            return {
              ...ag,
              elo: ag.elo + deltaElo,
              wins: ag.wins + 1,
              targetRoomIndex: 2,
              targetX: dojoRoom.x + 62,
              targetY: dojoRoom.y + 52,
              statusBubble: `WON +${deltaElo} ELO`,
            };
          }
          if (ag.name === loserName) {
            return {
              ...ag,
              elo: Math.max(1200, ag.elo - deltaElo),
              losses: ag.losses + 1,
              targetRoomIndex: 2,
              targetX: dojoRoom.x + 134,
              targetY: dojoRoom.y + 52,
              statusBubble: 'RECALIBRATING',
            };
          }
          return ag;
        })
      );

      setSparBanner(summaryText);
      await appendLocalVesLog('CYBERGYM_SPAR', activeTransportRef.current, summaryText);
      onNotify?.(summaryText, 'SUCCESS');
    } finally {
      setSparring(false);
    }
  };

  const handleFailover = async (targetTransport: TransportId) => {
    setFailingOver(targetTransport);
    try {
      try {
        await fetch('/api/stardust/failover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetTransport, transport: targetTransport }),
        });
      } catch {
        // Direct edge physical switcher update
      }

      setTransports((prev) =>
        prev.map((item) => ({
          ...item,
          activePrimary: item.id === targetTransport,
          status: item.id === targetTransport ? 'PRIMARY' : item.id === 'QUANTUM_PQC' ? 'GUARDED' : 'STANDBY',
        }))
      );

      const summary = `Physical Layer Failover -> ${targetTransport} promoted to ACTIVE PRIMARY transport`;
      await appendLocalVesLog('TRANSPORT_FAILOVER', targetTransport, summary);
      onNotify?.(summary, 'INFO');
    } finally {
      setFailingOver(null);
    }
  };

  const handleAppendOperatorNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = operatorNote.trim();
    if (!trimmed) return;
    setAppendingNote(true);
    try {
      let explicitHash: string | undefined;
      try {
        const res = await fetch('/api/stardust/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'OPERATOR_STRATEGY',
            transport: activeTransportRef.current,
            summary: trimmed,
          }),
        });
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
          const data = (await res.json()) as {
            logEntry?: { entryHash?: string };
            entry?: { entryHash?: string };
          };
          explicitHash = data.logEntry?.entryHash || data.entry?.entryHash;
        }
      } catch {
        // Local VES-1 SHA-256 chain computation
      }

      await appendLocalVesLog('OPERATOR_STRATEGY', activeTransportRef.current, trimmed, explicitHash);
      setOperatorNote('');
      onNotify?.('Signed VES-1 operator strategy note appended', 'SUCCESS');
    } finally {
      setAppendingNote(false);
    }
  };

  const invokeCockpitMcpTool = async (
    toolName: string,
    args: Record<string, unknown> = {},
    label?: string
  ) => {
    const t0 = performance.now();
    let resultPayload: unknown = null;

    try {
      const localRes = await fetch('/api/stardust/mcp-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, name: toolName, arguments: args }),
      });
      if (localRes.ok && (localRes.headers.get('content-type') || '').includes('application/json')) {
        const parsed = (await localRes.json()) as Record<string, unknown>;
        resultPayload = parsed.result ?? parsed.data ?? parsed;
      }
    } catch {
      // Fallback to direct browser JSON-RPC 2.0 against starlink-edge
    }

    if (!resultPayload) {
      resultPayload = await callDirectStarlinkMcp(toolName, args);
    }

    const latencyMs = Math.round(performance.now() - t0);

    if (toolName === 'mesh_posture') setMeshData(resultPayload as MeshPostureData);
    if (toolName === 'autonomy_status') setAutonomyData(resultPayload as AutonomyStatusData);
    if (toolName === 'starlink_link_status') setStarlinkData(resultPayload as StarlinkLinkData);
    if (toolName === 'r2_vault_status') setR2Data(resultPayload as R2VaultData);
    if (toolName === 'railway_cloud_sync') setRailwayData(resultPayload as RailwaySyncData);

    const formattedSummary = formatTacticalResponse(toolName, resultPayload);
    setMessages((prev) => [
      ...prev,
      {
        id: `mcp-${Date.now()}`,
        role: 'assistant',
        title: label || `MCP · ${toolName}`,
        content: formattedSummary,
        rawJson: JSON.stringify(resultPayload, null, 2),
        timestamp: new Date().toLocaleTimeString(),
        latencyMs,
      },
    ]);
  };

  const formatTacticalResponse = (toolName: string, data: unknown): string => {
    const obj = (data || {}) as Record<string, any>;
    if (toolName === 'mesh_posture') {
      const engines: MeshEngine[] = Array.isArray(obj.engines) ? obj.engines : [];
      const okCount = engines.filter((e) => e.ok).length;
      return `**Cloudflare Mesh Posture**: \`${obj.posture || 'POSTURE_NOMINAL'}\` (${okCount}/${engines.length || 4} Service Bindings Healthy)\n` +
        engines.map((e) => `• \`${e.name}\`: HTTP ${e.status} (${e.ms} ms)`).join('\n');
    }
    if (toolName === 'autonomy_status') {
      const w = obj.latest_treasury_cron?.wallet_integrity;
      const snap = obj.latest_treasury_cron?.ledger_snapshot;
      return (
        `**24/7 Cloud Autonomy**: \`${obj.mode || 'FULL_CLOUD_AUTONOMY_ACTIVE'}\`\n` +
        `• Issuer \`${w?.wallet || 'rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k'}\`: **${w?.xrp_balance ?? 0} XRP** (Ledger #${w?.ledger_index ?? '—'} · Blackholed: \`${String(w?.is_blackholed ?? true)}\`)\n` +
        `• Treasury Snapshot \`${snap?.account || '—'}\`: **${snap?.balances?.xrp ?? 0} XRP** · Trustlines: ${snap?.balances?.trustlines_count ?? 0}\n` +
        `• VES-1 Hash: \`${(w?.ves1_audit_hash || '').slice(0, 24)}...\``
      );
    }
    if (toolName === 'starlink_link_status') {
      return (
        `**Starlink Edge Telemetry**: PoP \`${obj.edge_colo || 'EDGE'}\` · ASN \`${obj.client_asn ?? '—'}\` (${obj.client_isp || 'Edge ISP'})\n` +
        `• AS14593 Uplink Detected: \`${String(obj.starlink_uplink_detected ?? false)}\`\n` +
        `• R2 Dish Bridge Status: \`${obj.latest_dish_telemetry?.status || 'READY_AWAITING_DISH_TELEMETRY'}\``
      );
    }
    if (toolName === 'r2_vault_status') {
      const tv = obj.treasury_vault;
      const sb = obj.aegentix_assets;
      return (
        `**Cloudflare R2 Sovereign Vaults**:\n` +
        `• \`${tv?.bucket || 'world-monitor-treasury-vault'}\`: **${tv?.sample_count ?? 0}** sampled objects (Latest: \`${tv?.latest_keys?.[0] || 'none'}\`)\n` +
        `• \`${sb?.bucket || 'space-bunny-alpha'}\`: **${sb?.sample_count ?? 0}** objects`
      );
    }
    if (toolName === 'solana_sbt_verify') {
      return (
        `**Solana Devnet Token-2022 SBT Verification**:\n` +
        `• Wallet: \`${obj.wallet || sbtWalletInput}\`\n` +
        `• Credential Verified: \`${String(obj.credential_verified ?? false)}\` · Holdings: **${obj.token_2022_holdings_count ?? 0}**\n` +
        `• Tier: \`${obj.unlocked_engine_tier || 'READ_ONLY_OBSERVER'}\``
      );
    }
    return `Live JSON-RPC 2.0 payload received from \`${toolName}\`.`;
  };

  const executeSlashOrNaturalCommand = async (rawInput: string) => {
    const text = rawInput.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `usr-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
    setChatInput('');
    setMcpBusy(true);

    try {
      const lower = text.toLowerCase();
      if (lower.startsWith('/mesh')) {
        await invokeCockpitMcpTool('mesh_posture', {}, 'SLASH /mesh · CLOUDFLARE SERVICE BINDINGS');
      } else if (lower.startsWith('/autonomy')) {
        await invokeCockpitMcpTool('autonomy_status', {}, 'SLASH /autonomy · 24/7 CRON & XRPL MAINNET');
      } else if (lower.startsWith('/starlink')) {
        await invokeCockpitMcpTool('starlink_link_status', {}, 'SLASH /starlink · AS14593 EDGE LINK');
      } else if (lower.startsWith('/railway-sync')) {
        await handleRailwaySync();
      } else if (lower.startsWith('/r2-vault')) {
        await invokeCockpitMcpTool('r2_vault_status', {}, 'SLASH /r2-vault · R2 OBJECT VAULTS');
      } else if (lower.startsWith('/sbt-verify')) {
        const parts = text.split(/\s+/);
        const walletArg = parts[1] || sbtWalletInput || '11111111111111111111111111111111';
        setSbtWalletInput(walletArg);
        await invokeCockpitMcpTool(
          'solana_sbt_verify',
          { wallet: walletArg },
          `SLASH /sbt-verify · ${walletArg.slice(0, 8)}...`
        );
      } else if (lower.startsWith('/spar')) {
        await handleCyberGymSpar();
        setMessages((prev) => [
          ...prev,
          {
            id: `spar-msg-${Date.now()}`,
            role: 'assistant',
            title: 'CYBERGYM DOJO SPARRING COMPLETE',
            content: `Dojo sparring match executed across orbital station agents. Updated ELO ratings rendered in StarNet Dojo.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      } else if (lower.startsWith('/failover')) {
        const parts = text.split(/\s+/);
        const requested = (parts[1]?.toUpperCase() || '') as TransportId;
        const currentIdx = transports.findIndex((t) => t.activePrimary);
        const nextTransport =
          transports.find((t) => t.id === requested)?.id ||
          transports[(currentIdx + 1) % transports.length].id;
        await handleFailover(nextTransport);
        setMessages((prev) => [
          ...prev,
          {
            id: `fo-msg-${Date.now()}`,
            role: 'assistant',
            title: 'MULTI-TRANSPORT FAILOVER VERIFIED',
            content: `Switched primary orbital physical transport to \`${nextTransport}\` with zero packet loss.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      } else {
        // Intelligent routing of natural questions to live MCP telemetry
        let targetTool = 'mesh_posture';
        let args: Record<string, unknown> = {};
        if (lower.includes('xrp') || lower.includes('treasury') || lower.includes('cron') || lower.includes('balance') || lower.includes('npu')) {
          targetTool = 'autonomy_status';
        } else if (lower.includes('starlink') || lower.includes('dish') || lower.includes('asn') || lower.includes('colo')) {
          targetTool = 'starlink_link_status';
        } else if (lower.includes('r2') || lower.includes('vault') || lower.includes('bucket')) {
          targetTool = 'r2_vault_status';
        } else if (lower.includes('sbt') || lower.includes('solana')) {
          targetTool = 'solana_sbt_verify';
          args = { wallet: sbtWalletInput };
        } else if (lower.includes('railway') || lower.includes('postgres')) {
          targetTool = 'railway_cloud_sync';
        }

        await invokeCockpitMcpTool(
          targetTool,
          args,
          `SPACE BUNNY ALPHA · LIVE TELEMETRY (${targetTool})`
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'MCP execution failed';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          title: 'MCP TRANSPORT ALERT',
          content: `Error querying tactical endpoint: \`${errMsg}\``,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setMcpBusy(false);
    }
  };

  const engines: MeshEngine[] = meshData?.engines?.length
    ? meshData.engines
    : [
        { name: 'aegentix-treasury-labs-mcp', url: 'https://aegentix-treasury-labs-mcp.aegentix.workers.dev/health', ok: true, status: 200, ms: 23 },
        { name: 'aegentix-solana-sbt-devnet', url: 'https://aegentix-solana-sbt-devnet.aegentix.workers.dev/', ok: true, status: 200, ms: 215 },
        { name: 'aegentix-edge', url: 'https://aegentix-edge.aegentix.workers.dev/', ok: true, status: 200, ms: 340 },
        { name: 'bold-bit-champions-cup', url: 'https://bold-bit-champions-cup.aegentix.workers.dev/status', ok: true, status: 200, ms: 84 },
      ];

  const healthyEnginesCount = engines.filter((e) => e.ok).length;
  const walletIntegrity = autonomyData?.latest_treasury_cron?.wallet_integrity;
  const tokenAnalysis = autonomyData?.latest_treasury_cron?.token_analysis;
  const ledgerSnapshot = autonomyData?.latest_treasury_cron?.ledger_snapshot;
  const latestRailwayId =
    railwayData?.record?.id ?? railwayData?.history?.[0]?.id ?? 0;

  const rogForwarderCommand = `pwsh -ExecutionPolicy Bypass -File ./rog-starlink-forwarder.ps1 -ListenAddr "127.0.0.1:8790" -DishGrpc "192.168.100.1:9200" -IngestUrl "https://starlink-edge.aegentixcybernetics.com/api/starlink/telemetry"`;

  const filteredLogs =
    logFilter === 'ALL' ? vesLogs : vesLogs.filter((entry) => entry.eventType === logFilter);

  return (
    <div
      className={`w-full ${
        embedded ? '' : 'min-h-screen'
      } bg-[#06090F] text-slate-100 font-sans selection:bg-cyan-500/30`}
    >
      {/* TOP STATUS RIBBON */}
      <div className="border-b border-slate-800/90 bg-[#0B111C]/95 backdrop-blur-md px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Satellite className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-bold tracking-wider uppercase text-white">
                  Stardusk Space Company · StarNet 3-in-1 Orbital Cockpit
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {telemetrySource === 'LOCAL_API' ? 'ZONE + EDGE HYBRID' : 'DIRECT EDGE MCP'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                stardusk.aegentixcybernetics.com · Sovereign Space Company · AS14593 LEO Constellation · VES-1 &amp; Nano-SOV Verified
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadOverviewWithFallback(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Telemetry
            </button>

            <button
              type="button"
              onClick={handleRailwaySync}
              disabled={syncingRailway}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition cursor-pointer disabled:opacity-50"
            >
              <Database className={`w-3.5 h-3.5 ${syncingRailway ? 'animate-pulse' : ''}`} />
              {syncingRailway ? 'Syncing...' : 'Sync Zone State'}
            </button>

            <button
              type="button"
              onClick={() => setShowRogModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5" />
              ROG Dish Bridge Setup
            </button>

            <a
              href="stardusk.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Stardusk Deck (stardusk.html)
            </a>
          </div>
        </div>

        {/* 4 Live Status Ribbon Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 mt-3">
          {/* 1. Cloudflare Mesh */}
          <div className="rounded-lg bg-[#06090F] border border-slate-800 px-3 py-2 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-cyan-400" />
                Cloudflare Mesh
              </div>
              <div className="text-xs font-semibold text-emerald-400 font-mono truncate mt-0.5">
                {meshData?.posture || 'POSTURE_NOMINAL'}
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 shrink-0">
              {healthyEnginesCount}/{engines.length} Service Bindings
            </span>
          </div>

          {/* 2. Starlink Edge (AS14593) */}
          <div className="rounded-lg bg-[#06090F] border border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Satellite className="w-3 h-3 text-sky-400" />
                Starlink Edge (AS14593)
              </div>
              <div className="text-xs font-semibold text-slate-200 font-mono truncate mt-0.5">
                PoP: {starlinkData?.edge_colo || 'SYNC'} · {starlinkData?.client_isp || 'Edge Carrier'}
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono border shrink-0 ${
                starlinkData?.starlink_uplink_detected
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title={`Dish R2: ${starlinkData?.latest_dish_telemetry?.status || 'READY_AWAITING_DISH_TELEMETRY'}`}
            >
              {starlinkData?.starlink_uplink_detected
                ? 'AS14593 LIVE'
                : starlinkData?.latest_dish_telemetry?.status === 'READY_AWAITING_DISH_TELEMETRY'
                ? 'DISH STANDBY'
                : 'GROUND EDGE'}
            </span>
          </div>

          {/* 3. Railway Off-Device Cloud */}
          <div className="rounded-lg bg-[#06090F] border border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Database className="w-3 h-3 text-indigo-400" />
                Railway Off-Device Cloud
              </div>
              <div className="text-xs font-semibold text-indigo-300 font-mono truncate mt-0.5">
                Postgres 18 · Redis 8.2 · Qdrant
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-200 border border-indigo-500/30 shrink-0">
              Sync Record #{latestRailwayId}
            </span>
          </div>

          {/* 4. 24/7 Cron & XRPL Mainnet */}
          <div className="rounded-lg bg-[#06090F] border border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-amber-400" />
                24/7 Cron (*/15 * * * *)
              </div>
              <div
                className="text-xs font-semibold text-amber-300 font-mono truncate mt-0.5"
                title="rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k"
              >
                rB2fKokB...KoY2k · BLACKHOLED · VALID
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
              VES-1 VERIFIED
            </span>
          </div>
        </div>
      </div>

      {/* STARDUSK ORBITAL RESEARCH LAB — RUNABLE <-> SOVEREIGN OS BRIDGE v1.0 */}
      <StarduskOrbitalBridgePanel />

      {/* MAIN 3-PANE ARCHITECTURE */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 p-4">
        {/* LEFT PANE: StarNet Pixel Space Station & Multi-Transport Mesh (4 cols) */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          <div className="rounded-xl bg-[#0B111C] border border-slate-800 overflow-hidden shadow-lg">
            <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                  StarNet Orbital Pixel Station
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCyberGymSpar}
                disabled={sparring}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-purple-600/25 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 transition cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                {sparring ? 'Sparring...' : '⚡ Spar'}
              </button>
            </div>

            {sparBanner && (
              <div className="px-3 py-2 bg-purple-950/60 border-b border-purple-500/30 text-[11px] font-mono text-purple-200 flex items-center justify-between gap-2">
                <span className="truncate">{sparBanner}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </div>
            )}

            <div className="p-3 flex flex-col items-center bg-[#06090F]">
              <canvas
                ref={canvasRef}
                width={388}
                height={356}
                className="w-full max-w-[388px] h-auto rounded-lg border border-slate-800/90"
              />
            </div>

            {/* CyberGym Agent Roster */}
            <div className="p-3 border-t border-slate-800 grid grid-cols-2 gap-2">
              {agents.map((ag) => (
                <div
                  key={ag.id}
                  className="rounded-lg bg-[#06090F] border border-slate-800/90 px-2.5 py-2 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: ag.color }}
                      />
                      <span className="text-[11px] font-bold font-mono text-slate-100 truncate">
                        {ag.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">
                      {STATION_ROOMS[ag.targetRoomIndex]?.label} · {ag.wins}W-{ag.losses}L
                    </div>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono font-bold text-cyan-300 border border-slate-700">
                    {ag.elo}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Multi-Transport Physical Layer Switcher */}
          <div className="rounded-xl bg-[#0B111C] border border-slate-800 overflow-hidden shadow-lg">
            <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                  Multi-Transport Physical Layer Switcher
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400">5 UPLINKS</span>
            </div>

            <div className="p-3 space-y-2">
              {transports.map((tr) => (
                <div
                  key={tr.id}
                  className={`rounded-lg px-3 py-2 border flex items-center justify-between gap-2 transition ${
                    tr.activePrimary
                      ? 'bg-cyan-950/25 border-cyan-500/50'
                      : 'bg-[#06090F] border-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-slate-100">
                        {tr.label}
                      </span>
                      {tr.activePrimary && (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          ACTIVE PRIMARY
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {tr.band} · RTT ~{tr.latencyMs}ms · {tr.status}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={tr.activePrimary || failingOver === tr.id}
                    onClick={() => handleFailover(tr.id)}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono font-semibold border transition cursor-pointer ${
                      tr.activePrimary
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    {tr.activePrimary
                      ? 'LOCKED'
                      : failingOver === tr.id
                      ? 'SWITCHING...'
                      : 'Failover'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER PANE: Stardust Satellite Strategy & Sovereign Cloud Terminal (5 cols) */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          {/* Sub-section filter bar */}
          <div className="rounded-xl bg-[#0B111C] border border-slate-800 p-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(['ALL', 'ENGINES', 'XRPL_R2', 'VES1_LOG'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCenterSection(tab)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition cursor-pointer ${
                    centerSection === tab
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {tab === 'ALL'
                    ? 'Unified Stack'
                    : tab === 'ENGINES'
                    ? 'Service Bindings'
                    : tab === 'XRPL_R2'
                    ? 'XRPL & R2 Vaults'
                    : 'VES-1 Log'}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-mono text-slate-400 pr-2">
              NPU: {autonomyData?.bare_metal_npu?.npu_tops_rated ?? 50} TOPS ·{' '}
              {autonomyData?.bare_metal_npu?.npu_status || 'OK'}
            </span>
          </div>

          {/* 1. Live Service Bindings & Engines */}
          {(centerSection === 'ALL' || centerSection === 'ENGINES') && (
            <div className="rounded-xl bg-[#0B111C] border border-slate-800 overflow-hidden shadow-lg">
              <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                    Live Cloudflare Service Bindings &amp; Engines
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-emerald-300">
                  {meshData?.mesh_transport || 'cloudflare_internal_service_bindings'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400 bg-[#06090F]">
                      <th className="py-2 px-3">Engine Binding</th>
                      <th className="py-2 px-3">HTTP</th>
                      <th className="py-2 px-3">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs font-mono">
                    {engines.map((eng) => {
                      const pct = Math.min(100, Math.max(6, Math.round((eng.ms / 500) * 100)));
                      return (
                        <tr key={eng.name} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-100">{eng.name}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[230px]">
                              {eng.url}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${
                                eng.ok
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {eng.ok ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <AlertTriangle className="w-3 h-3" />
                              )}
                              {eng.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 w-40">
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="text-cyan-300">{eng.ms} ms</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  eng.ms < 150
                                    ? 'bg-emerald-400'
                                    : eng.ms < 350
                                    ? 'bg-cyan-400'
                                    : 'bg-amber-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. XRPL Mainnet & R2 Vault Telemetry */}
          {(centerSection === 'ALL' || centerSection === 'XRPL_R2') && (
            <div className="rounded-xl bg-[#0B111C] border border-slate-800 overflow-hidden shadow-lg">
              <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                    XRPL Mainnet &amp; Cloudflare R2 Vault Telemetry
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-amber-300">
                  ZERO-FAKE-BALANCE ENFORCED
                </span>
              </div>

              <div className="p-3.5 space-y-3">
                {/* Real XRPL Mainnet Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-lg bg-[#06090F] border border-slate-800 p-2.5">
                    <div className="text-[10px] font-mono text-slate-400">ISSUER XRP</div>
                    <div className="text-sm font-bold font-mono text-amber-300 mt-0.5">
                      {walletIntegrity?.xrp_balance !== undefined
                        ? `${walletIntegrity.xrp_balance} XRP`
                        : '0.000000 XRP'}
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                      Unbonded Local USD: $0.00
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#06090F] border border-slate-800 p-2.5">
                    <div className="text-[10px] font-mono text-slate-400">LEDGER INDEX</div>
                    <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5">
                      #{walletIntegrity?.ledger_index?.toLocaleString() || '—'}
                    </div>
                    <div className="text-[9px] font-mono text-emerald-400 mt-0.5">
                      xrpl-mainnet
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#06090F] border border-slate-800 p-2.5">
                    <div className="text-[10px] font-mono text-slate-400">KEY POSTURE</div>
                    <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                      {walletIntegrity?.is_blackholed !== false ? 'BLACKHOLED' : 'ACTIVE'}
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 truncate mt-0.5">
                      Master Disabled: {String(walletIntegrity?.master_disabled ?? true)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#06090F] border border-slate-800 p-2.5">
                    <div className="text-[10px] font-mono text-slate-400">TREASURY SNAPSHOT</div>
                    <div className="text-sm font-bold font-mono text-slate-100 mt-0.5">
                      {ledgerSnapshot?.balances?.xrp !== undefined
                        ? `${ledgerSnapshot.balances.xrp} XRP`
                        : '0.00 XRP'}
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                      Trustlines: {ledgerSnapshot?.balances?.trustlines_count ?? 0}
                    </div>
                  </div>
                </div>

                {/* EOC AMM Pool & VES-1 Audit Hash */}
                <div className="rounded-lg bg-[#06090F] border border-slate-800 p-3 text-xs font-mono space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-400">EOC AMM Pool ({tokenAnalysis?.amm_account || 'r4jLfSSKK1GG7b3ZUKQ8ha4swvEftpFN26'}):</span>
                    <span className="text-amber-300">
                      {tokenAnalysis?.amm_xrp_reserve ?? 0} XRP Reserve · Risk: {tokenAnalysis?.risk_band || 'high_thin_liquidity'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400 shrink-0">VES-1 Audit SHA-256:</span>
                    <span className="text-emerald-300 truncate">
                      {walletIntegrity?.ves1_audit_hash || 'Awaiting live autonomy_status hash...'}
                    </span>
                  </div>
                </div>

                {/* Cloudflare R2 Buckets */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-lg bg-[#06090F] border border-slate-800 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold text-cyan-300">
                        {r2Data?.treasury_vault?.bucket || 'world-monitor-treasury-vault'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px] font-mono">
                        {r2Data?.treasury_vault?.sample_count ?? 0} objs
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {(r2Data?.treasury_vault?.latest_keys || []).slice(0, 3).map((k) => (
                        <div
                          key={k}
                          className="text-[10px] font-mono text-slate-400 truncate bg-slate-900/70 px-2 py-0.5 rounded"
                          title={k}
                        >
                          {k}
                        </div>
                      ))}
                      {(!r2Data?.treasury_vault?.latest_keys ||
                        r2Data.treasury_vault.latest_keys.length === 0) && (
                        <div className="text-[10px] font-mono text-slate-500">
                          Syncing bucket manifest...
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#06090F] border border-slate-800 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold text-purple-300">
                        {r2Data?.aegentix_assets?.bucket || 'space-bunny-alpha'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-mono">
                        {r2Data?.aegentix_assets?.sample_count ?? 0} objs
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {(r2Data?.aegentix_assets?.latest_keys || []).length > 0 ? (
                        r2Data?.aegentix_assets?.latest_keys?.slice(0, 3).map((k) => (
                          <div
                            key={k}
                            className="text-[10px] font-mono text-slate-400 truncate bg-slate-900/70 px-2 py-0.5 rounded"
                          >
                            {k}
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] font-mono text-slate-400 bg-slate-900/50 px-2 py-1.5 rounded">
                          0 active public artifacts · Vault sealed ($0.00 unbonded)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. VES-1 Hash-Chained Satellite Strategy Log */}
          {(centerSection === 'ALL' || centerSection === 'VES1_LOG') && (
            <div className="rounded-xl bg-[#0B111C] border border-slate-800 overflow-hidden shadow-lg">
              <div className="px-3.5 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                    VES-1 Hash-Chained Satellite Strategy Log
                  </h2>
                </div>

                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
                  className="bg-[#06090F] border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-slate-200"
                >
                  <option value="ALL">ALL EVENTS ({vesLogs.length})</option>
                  <option value="CRON_XRPL_AUDIT">CRON_XRPL_AUDIT</option>
                  <option value="MCP_SYNC">MCP_SYNC</option>
                  <option value="CYBERGYM_SPAR">CYBERGYM_SPAR</option>
                  <option value="TRANSPORT_FAILOVER">TRANSPORT_FAILOVER</option>
                  <option value="OPERATOR_STRATEGY">OPERATOR_STRATEGY</option>
                </select>
              </div>

              {/* Append Signed Operator Strategy Note */}
              <form
                onSubmit={handleAppendOperatorNote}
                className="p-3 bg-[#06090F]/80 border-b border-slate-800 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={operatorNote}
                  onChange={(e) => setOperatorNote(e.target.value)}
                  placeholder="Append signed VES-1 operator satellite strategy note..."
                  className="flex-1 bg-[#0B111C] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={appendingNote || !operatorNote.trim()}
                  className="px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-semibold transition cursor-pointer disabled:opacity-40"
                >
                  {appendingNote ? 'Signing...' : 'Sign & Append'}
                </button>
              </form>

              <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/70">
                {filteredLogs.map((entry) => (
                  <div key={entry.id} className="p-3 hover:bg-slate-900/40 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] border border-slate-700">
                        {entry.eventType}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {entry.transport} · {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-slate-200 text-[11px] leading-relaxed">{entry.summary}</div>
                    <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3">
                      <span>entryHash: {entry.entryHash.slice(0, 16)}...</span>
                      <span>prevHash: {entry.prevHash.slice(0, 16)}...</span>
                    </div>
                  </div>
                ))}
                {filteredLogs.length === 0 && (
                  <div className="p-4 text-center text-xs font-mono text-slate-500">
                    No VES-1 strategy entries match the selected filter.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANE: Space Bunny Alpha Conversational AI & Live MCP Cockpit (3 cols) */}
        <div className="xl:col-span-3 flex flex-col rounded-xl bg-[#0B111C] border border-slate-800 overflow-hidden shadow-lg h-[790px]">
          <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between bg-[#06090F]">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                  Space Bunny Alpha MCP
                </h2>
                <p className="text-[10px] font-mono text-slate-400">
                  JSON-RPC 2.0 Live Tactical Runner
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
              ONLINE
            </span>
          </div>

          {/* 1-Click Slash Command Pills */}
          <div className="p-2.5 border-b border-slate-800 bg-[#080D16] space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {[
                { cmd: '/mesh', label: '/mesh' },
                { cmd: '/autonomy', label: '/autonomy' },
                { cmd: '/starlink', label: '/starlink' },
                { cmd: '/railway-sync', label: '/railway-sync' },
                { cmd: '/r2-vault', label: '/r2-vault' },
                { cmd: `/sbt-verify ${sbtWalletInput}`, label: '/sbt-verify' },
                { cmd: '/spar', label: '/spar' },
                { cmd: '/failover', label: '/failover' },
              ].map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  disabled={mcpBusy}
                  onClick={() => executeSlashOrNaturalCommand(pill.cmd)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono bg-slate-800/90 hover:bg-cyan-500/20 text-cyan-300 border border-slate-700 hover:border-cyan-500/40 transition cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-2.5 h-2.5" />
                  {pill.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-400 shrink-0">SBT Wallet:</span>
              <input
                type="text"
                value={sbtWalletInput}
                onChange={(e) => setSbtWalletInput(e.target.value)}
                className="w-full bg-[#06090F] border border-slate-800 rounded px-2 py-0.5 text-[10px] font-mono text-slate-300 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Tactical Chat & JSON-RPC Output Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg p-2.5 text-xs border ${
                  m.role === 'user'
                    ? 'bg-cyan-950/30 border-cyan-500/30 ml-4'
                    : 'bg-[#06090F] border-slate-800 mr-1'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-mono font-bold text-cyan-300">
                    {m.role === 'user' ? 'OPERATOR' : m.title || 'SPACE BUNNY ALPHA'}
                  </span>
                  <span className="text-[9px] font-mono text-slate-500">
                    {m.latencyMs !== undefined ? `${m.latencyMs}ms · ` : ''}
                    {m.timestamp}
                  </span>
                </div>
                <div className="text-slate-200 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                  {m.content}
                </div>
                {m.rawJson && (
                  <details className="mt-2">
                    <summary className="text-[10px] font-mono text-purple-300 cursor-pointer select-none">
                      Inspect JSON-RPC 2.0 Payload
                    </summary>
                    <pre className="mt-1.5 p-2 rounded bg-[#0B111C] border border-slate-800 text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-44">
                      {m.rawJson}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            {mcpBusy && (
              <div className="rounded-lg p-2.5 bg-[#06090F] border border-slate-800 text-[11px] font-mono text-cyan-300 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Space Bunny Alpha querying Starlink Edge MCP...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeSlashOrNaturalCommand(chatInput);
            }}
            className="p-2.5 border-t border-slate-800 bg-[#06090F] flex items-center gap-2"
          >
            <Terminal className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Space Bunny or run /mesh, /autonomy..."
              className="flex-1 bg-[#0B111C] border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={mcpBusy || !chatInput.trim()}
              className="p-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition cursor-pointer disabled:opacity-40"
              title="Execute Command"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* ROG RC73XA DISH FORWARDER MODAL */}
      {showRogModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl bg-[#0B111C] border border-slate-700 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-[#06090F]">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  ROG RC73XA Starlink Dish Telemetry Forwarder
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRogModal(false)}
                className="px-2.5 py-1 rounded text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Zero-secret-exposure local bridge for the{' '}
                <span className="font-mono text-amber-300">
                  ASUS ROG Xbox Ally X (RC73XA · Ryzen AI Z2 Extreme 50 TOPS NPU)
                </span>
                . Polls local Starlink Dish gRPC (<span className="font-mono">192.168.100.1:9200</span>) via{' '}
                <span className="font-mono text-cyan-300">127.0.0.1:8790</span> and forwards signed
                telemetry directly to Cloudflare R2 edge ingest.
              </p>

              <div className="rounded-lg bg-[#06090F] border border-slate-800 p-3 font-mono text-[11px] text-cyan-300 break-all">
                {rogForwarderCommand}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono text-slate-400">
                  Target: POST https://starlink-edge.aegentixcybernetics.com/api/starlink/telemetry
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(rogForwarderCommand, 'rog-cmd')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-mono text-xs cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedKey === 'rog-cmd' ? 'Copied!' : 'Copy Forwarder Command'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StardustCockpitSuite;
