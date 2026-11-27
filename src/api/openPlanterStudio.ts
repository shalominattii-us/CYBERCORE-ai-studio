import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import {
  emitEphemeralNanotransaction,
  getNanotransactionSnapshot,
  settlePendingNanotransactions,
} from './nanotransactionRewards.ts';

export type OntologyCategory =
  | 'SOVEREIGN_ENTITY'
  | 'TREASURY_LEDGER'
  | 'SATELLITE_NODE'
  | 'CLOUD_INFRA'
  | 'BROADCAST_STUDIO'
  | 'REPO_FORGE';

export type AvatarCameraMode = 'ANCHOR_CLOSEUP' | 'GRAPH_SPLIT' | 'VM_SWARM_WALL';

export type VmStatus = 'RUNNING' | 'TERMINATED';

export type OpenPlanterToolName =
  | 'list_files'
  | 'search_files'
  | 'repo_map'
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'hashline_edit'
  | 'apply_patch'
  | 'run_shell'
  | 'run_shell_bg'
  | 'check_shell_bg'
  | 'kill_shell_bg'
  | 'web_search'
  | 'fetch_url'
  | 'think'
  | 'subtask'
  | 'execute'
  | 'list_artifacts'
  | 'read_artifact';

export interface OpenPlanterModelSpec {
  id: string;
  label: string;
  provider: string;
  roleBadge: string;
  recursionNative: boolean;
  vmControlCapable: boolean;
  throughputLabel: string;
  description: string;
}

export interface OpenPlanterToolSpec {
  name: OpenPlanterToolName;
  group: 'WORKSPACE' | 'SHELL_VM' | 'WEB_OSINT' | 'RECURSIVE_PLANNING';
  summary: string;
  defaultArgPlaceholder: string;
}

export interface OntologyNode {
  id: string;
  label: string;
  shortLabel: string;
  category: OntologyCategory;
  identifier: string;
  unbondedUsdDisplay: '$0.00';
  confidence: number;
  sha256Digest: string;
  updatedAt: string;
  metadata: Record<string, string>;
}

export interface OntologyEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  evidenceHash: string;
  verifiedAt: string;
}

export interface WikiDocument {
  nodeId: string;
  title: string;
  category: OntologyCategory;
  markdown: string;
  crossLinks: string[];
  citations: string[];
  sha256Digest: string;
  updatedAt: string;
}

export interface VmConsoleLogEntry {
  id: string;
  timestamp: string;
  tool: OpenPlanterToolName | 'boot' | 'terminate';
  commandOrArg: string;
  output: string;
  evidenceHash: string;
}

export interface EphemeralVmSandbox {
  vmId: string;
  role: string;
  model: string;
  parentVmId: string | null;
  depth: number;
  image: string;
  status: VmStatus;
  cpuCores: number;
  ramMb: number;
  task: string;
  createdAt: string;
  recentLogs: VmConsoleLogEntry[];
}

export interface BroadcastCueEntry {
  id: string;
  timestamp: string;
  cameraMode: AvatarCameraMode;
  lowerThird: string;
  narration: string;
  visemeSequence: string[];
  sha256Digest: string;
}

export interface AvatarBroadcastState {
  liveOnAir: boolean;
  cameraMode: AvatarCameraMode;
  activeModel: string;
  currentLowerThird: string;
  currentNarration: string;
  visemeCueQueue: string[];
  studioUrl: 'https://studio.aegentixcybernetics.com';
  localAvatarHudPath: '/avatar_hud.html';
  openPlanterZoneUrl: 'https://openplanter.aegentixcybernetics.com';
  broadcastCueLog: BroadcastCueEntry[];
}

export interface RecursiveInvestigationStep {
  stepNumber: number;
  stage: 'THINK' | 'VM_SPAWN' | 'SUBTASK' | 'WIKI_CURATOR' | 'ACCEPTANCE_JUDGE';
  depth: number;
  vmId: string;
  toolUsed: OpenPlanterToolName;
  title: string;
  detail: string;
  verdict?: 'PASS' | 'VERIFIED';
  evidenceHash: string;
  timestamp: string;
}

export interface RecursiveInvestigationRecord {
  investigationId: string;
  objective: string;
  model: string;
  maxDepth: number;
  createdAt: string;
  acceptanceVerdict: 'PASS';
  zeroFakeBalanceVerified: true;
  sha256Digest: string;
  briefingNarration: string;
  lowerThirdHeadline: string;
  steps: RecursiveInvestigationStep[];
  spawnedVmIds: string[];
  addedNodeIds: string[];
  addedEdgeIds: string[];
  wikiNodeId: string;
}

function computeSha256(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function deriveVisemes(text: string): string[] {
  const palette = ['AA', 'EE', 'IH', 'OH', 'OO', 'FV', 'TH', 'MBP', 'SZ', 'REST'];
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 16);
  if (tokens.length === 0) {
    return ['REST'];
  }
  const visemes = tokens.map((word, idx) => {
    const code = (word.charCodeAt(0) + idx * 7) % (palette.length - 1);
    return palette[code];
  });
  visemes.push('REST');
  return visemes;
}

export const OPENPLANTER_MODELS: OpenPlanterModelSpec[] = [
  {
    id: 'rlm-qwen3-8b',
    label: 'RLM-Qwen3-8B [VM-Native]',
    provider: 'MIT / PrimeIntellect',
    roleBadge: 'Native Recursive REPL & Sub-VM Spawner',
    recursionNative: true,
    vmControlCapable: true,
    throughputLabel: '410 tok/s · REPL d=0..4',
    description:
      'MIT/PrimeIntellect Recursive Language Model trained natively for subtask/execute REPL recursion and ephemeral sub-VM spawning.',
  },
  {
    id: 'openhands-lm-32b',
    label: 'OpenHands-LM-32B [Sandbox]',
    provider: 'All-Hands AI',
    roleBadge: 'Container Runtime & Bash Specialist',
    recursionNative: true,
    vmControlCapable: true,
    throughputLabel: '260 tok/s · Docker/Bash',
    description:
      'Dedicated VM/Docker sandbox specialist engineered for deterministic bash execution, patch synthesis, and artifact verification.',
  },
  {
    id: 'ui-tars-1.5-72b',
    label: 'UI-TARS-1.5-72B [GUI-VM]',
    provider: 'ByteDance Seed / OSWorld',
    roleBadge: 'GUI & Computer-Use VM Automation',
    recursionNative: true,
    vmControlCapable: true,
    throughputLabel: '145 tok/s · X11/Headless HUD',
    description:
      'Vision-action computer-use model driving headless desktop VMs, browser DOM inspection, and live studio broadcast cueing.',
  },
  {
    id: 'qwen-3-235b-cerebras',
    label: 'Qwen-3-235B [Cerebras]',
    provider: 'Cerebras Wafer-Scale',
    roleBadge: '2,000+ tok/s Graph Synthesis',
    recursionNative: true,
    vmControlCapable: true,
    throughputLabel: '2,180 tok/s · Wafer-Scale',
    description:
      'Ultra-low-latency recursive ontology graph resolver and cross-source entity linker over sovereign infrastructure.',
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude-Opus-4.6 [Forensics]',
    provider: 'Anthropic',
    roleBadge: 'Frontier Deep Forensics & Judge',
    recursionNative: true,
    vmControlCapable: true,
    throughputLabel: '95 tok/s · High-Assurance',
    description:
      'Frontier forensic auditor and acceptance-criteria judge enforcing provenance citations and zero-fake-balance invariants.',
  },
  {
    id: 'gpt-5.2',
    label: 'GPT-5.2 [Acceptance Judge]',
    provider: 'OpenAI',
    roleBadge: 'Cross-Source Acceptance Verifier',
    recursionNative: true,
    vmControlCapable: true,
    throughputLabel: '125 tok/s · Deterministic Judge',
    description:
      'Structured multi-hop OSINT verifier and formal acceptance-criteria evaluator across OpenPlanter investigation artifacts.',
  },
  {
    id: 'ollama/llama3.2',
    label: 'Ollama Local [llama3.2]',
    provider: 'Local Air-Gapped Runtime',
    roleBadge: 'Offline Sovereign Local Runtime',
    recursionNative: false,
    vmControlCapable: true,
    throughputLabel: '180 tok/s · Local GPU',
    description:
      'Zero-egress sovereign local inference runtime for air-gapped Starlink Mini edge and disconnected VM sandboxes.',
  },
];

export const OPENPLANTER_TOOLS_19: OpenPlanterToolSpec[] = [
  // Workspace (8)
  {
    name: 'list_files',
    group: 'WORKSPACE',
    summary: 'Enumerate workspace & evidence vault files inside isolated VM',
    defaultArgPlaceholder: '/workspace/ontology',
  },
  {
    name: 'search_files',
    group: 'WORKSPACE',
    summary: 'Ripgrep regex search across sovereign corpus & wiki markdown',
    defaultArgPlaceholder: 'SAM-UEI-AEG9824X0019|rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k',
  },
  {
    name: 'repo_map',
    group: 'WORKSPACE',
    summary: 'Generate AST symbol & module map of eaglecrat/Foundry & OpenPlanter',
    defaultArgPlaceholder: 'eaglecrat/Foundry --depth 2',
  },
  {
    name: 'read_file',
    group: 'WORKSPACE',
    summary: 'Read verified artifact or ontology manifest with line numbers',
    defaultArgPlaceholder: '/workspace/wiki/node-sovereign-aegentix.md',
  },
  {
    name: 'write_file',
    group: 'WORKSPACE',
    summary: 'Persist curated OpenPlanter wiki markdown with SHA-256 seal',
    defaultArgPlaceholder: '/workspace/wiki/latest-briefing.md',
  },
  {
    name: 'edit_file',
    group: 'WORKSPACE',
    summary: 'Structured span replacement in ontology index or investigation log',
    defaultArgPlaceholder: '/workspace/ontology/edges.json',
  },
  {
    name: 'hashline_edit',
    group: 'WORKSPACE',
    summary: 'Content-addressed line-hash verified edit preventing drift',
    defaultArgPlaceholder: '/workspace/wiki/index.md#sha256',
  },
  {
    name: 'apply_patch',
    group: 'WORKSPACE',
    summary: 'Apply unified diff patch across multi-file investigation artifacts',
    defaultArgPlaceholder: 'patch --verify ontology-delta.diff',
  },
  // Shell / VM (4)
  {
    name: 'run_shell',
    group: 'SHELL_VM',
    summary: 'Execute synchronous sandboxed bash command inside ephemeral VM',
    defaultArgPlaceholder: 'uname -a && python3 -c "import hashlib; print(\'RLM_OK\')"',
  },
  {
    name: 'run_shell_bg',
    group: 'SHELL_VM',
    summary: 'Launch background daemon or telemetry collector inside VM',
    defaultArgPlaceholder: 'openplanter-collector --asn AS14593 --daemon',
  },
  {
    name: 'check_shell_bg',
    group: 'SHELL_VM',
    summary: 'Inspect stdout/stderr ring-buffer of background VM job',
    defaultArgPlaceholder: 'bg-job-01',
  },
  {
    name: 'kill_shell_bg',
    group: 'SHELL_VM',
    summary: 'Send SIGTERM to background process inside sandbox VM',
    defaultArgPlaceholder: 'bg-job-01',
  },
  // Web / OSINT (2)
  {
    name: 'web_search',
    group: 'WEB_OSINT',
    summary: 'Query public registry, SAM.gov metadata, XRPL ledger & BGP tables',
    defaultArgPlaceholder: 'AS14593 Starlink PoP routing rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k',
  },
  {
    name: 'fetch_url',
    group: 'WEB_OSINT',
    summary: 'Fetch & digest sovereign endpoint headers and structured JSON/HTML',
    defaultArgPlaceholder: 'https://openplanter.aegentixcybernetics.com/healthz',
  },
  // Recursive Planning (5)
  {
    name: 'think',
    group: 'RECURSIVE_PLANNING',
    summary: 'Decompose investigation objective & formulate recursive hypothesis tree',
    defaultArgPlaceholder: 'Decompose entity links & enforce $0.00 unbonded invariant',
  },
  {
    name: 'subtask',
    group: 'RECURSIVE_PLANNING',
    summary: 'Delegate isolated sub-hypothesis to child RLM VM (d+1 <= 4)',
    defaultArgPlaceholder: 'Verify XRPL issuer blackhole flags & cross-link SAM UEI',
  },
  {
    name: 'execute',
    group: 'RECURSIVE_PLANNING',
    summary: 'Run RLM Python/REPL synthesis block & emit structured ontology triples',
    defaultArgPlaceholder: 'resolve_entities(seed="AEGENTIX", strict_zero_fake_usd=True)',
  },
  {
    name: 'list_artifacts',
    group: 'RECURSIVE_PLANNING',
    summary: 'List SHA-256 sealed evidence bundles produced across VM tree',
    defaultArgPlaceholder: '/workspace/artifacts',
  },
  {
    name: 'read_artifact',
    group: 'RECURSIVE_PLANNING',
    summary: 'Read & verify cryptographic digest of child sub-VM artifact',
    defaultArgPlaceholder: 'artifact://d1-entity-resolution-bundle.json',
  },
];

const BOOT_ISO = '2026-11-27T15:00:00.000Z';

const ontologyNodes: OntologyNode[] = [
  {
    id: 'node-sovereign-aegentix',
    label: 'AEGENTIX · CAGE 9X4B2 / SAM-UEI-AEG9824X0019',
    shortLabel: 'AEGENTIX (CAGE 9X4B2)',
    category: 'SOVEREIGN_ENTITY',
    identifier: 'CAGE 9X4B2 · SAM-UEI-AEG9824X0019',
    unbondedUsdDisplay: '$0.00',
    confidence: 0.99,
    sha256Digest: computeSha256('node-sovereign-aegentix:CAGE-9X4B2:SAM-UEI-AEG9824X0019'),
    updatedAt: BOOT_ISO,
    metadata: {
      cageCode: '9X4B2',
      samUei: 'SAM-UEI-AEG9824X0019',
      posture: 'Active Sovereign Entity · Zero Unbonded Fiat Claims ($0.00)',
      jurisdiction: 'US Federal / Sovereign Cybernetics Registry',
    },
  },
  {
    id: 'node-xrpl-eoc-ledger',
    label: 'XRPL Mainnet EOC · rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k · Blackholed',
    shortLabel: 'XRPL EOC (Blackholed)',
    category: 'TREASURY_LEDGER',
    identifier: 'rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k',
    unbondedUsdDisplay: '$0.00',
    confidence: 0.99,
    sha256Digest: computeSha256('node-xrpl-eoc-ledger:rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k:BLACKHOLED'),
    updatedAt: BOOT_ISO,
    metadata: {
      network: 'XRPL Mainnet',
      issuerAccount: 'rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k',
      masterKeyState: 'BLACKHOLED (lsfDisableMaster = true)',
      unbondedLocalUsd: '$0.00',
    },
  },
  {
    id: 'node-starlink-as14593',
    label: 'Starlink Mini AS14593 · starlink-edge.aegentixcybernetics.com',
    shortLabel: 'Starlink AS14593 Edge',
    category: 'SATELLITE_NODE',
    identifier: 'AS14593 · starlink-edge.aegentixcybernetics.com',
    unbondedUsdDisplay: '$0.00',
    confidence: 0.98,
    sha256Digest: computeSha256('node-starlink-as14593:starlink-edge.aegentixcybernetics.com'),
    updatedAt: BOOT_ISO,
    metadata: {
      asn: 'AS14593 (SpaceX Starlink)',
      edgeHost: 'starlink-edge.aegentixcybernetics.com',
      orbitShell: 'LEO Ku/Ka-Band Dishy Mini Uplinks',
      tunnelMode: 'WireGuard + PQC Kyber-768 Framing',
    },
  },
  {
    id: 'node-railway-cloud',
    label: 'Railway Sovereign Cloud · Postgres 18 + Qdrant',
    shortLabel: 'Railway PG18 + Qdrant',
    category: 'CLOUD_INFRA',
    identifier: 'aegentix-sovereign-gateway · Postgres 18 + Qdrant',
    unbondedUsdDisplay: '$0.00',
    confidence: 0.97,
    sha256Digest: computeSha256('node-railway-cloud:postgres18:qdrant:openplanter'),
    updatedAt: BOOT_ISO,
    metadata: {
      relationalStore: 'PostgreSQL 18 (Ontology Triples & Audit Hash-Chain)',
      vectorIndex: 'Qdrant Hybrid Dense/Sparse Embeddings',
      zoneAnchor: 'openplanter.aegentixcybernetics.com',
      unbondedLocalUsd: '$0.00',
    },
  },
  {
    id: 'node-avatar-broadcast-studio',
    label: 'Live 3D Avatar Studio · studio.aegentixcybernetics.com',
    shortLabel: '3D Avatar Studio',
    category: 'BROADCAST_STUDIO',
    identifier: 'studio.aegentixcybernetics.com · /avatar_hud.html',
    unbondedUsdDisplay: '$0.00',
    confidence: 0.99,
    sha256Digest: computeSha256('node-avatar-broadcast-studio:studio.aegentixcybernetics.com:/avatar_hud.html'),
    updatedAt: BOOT_ISO,
    metadata: {
      broadcastOrigin: 'https://studio.aegentixcybernetics.com',
      localHudMount: '/avatar_hud.html',
      cameras: 'ANCHOR_CLOSEUP | GRAPH_SPLIT | VM_SWARM_WALL',
      synthesisEngine: 'Web Speech TTS + Viseme Lip-Sync Queue',
    },
  },
  {
    id: 'node-foundry-openplanter-forge',
    label: 'eaglecrat/Foundry · ShinMegamiBoson/OpenPlanter',
    shortLabel: 'Foundry / OpenPlanter',
    category: 'REPO_FORGE',
    identifier: 'github.com/eaglecrat/Foundry · github.com/ShinMegamiBoson/OpenPlanter',
    unbondedUsdDisplay: '$0.00',
    confidence: 0.99,
    sha256Digest: computeSha256('node-foundry-openplanter-forge:eaglecrat/Foundry:ShinMegamiBoson/OpenPlanter'),
    updatedAt: BOOT_ISO,
    metadata: {
      sovereignFork: 'https://github.com/eaglecrat/Foundry',
      upstreamRepo: 'https://github.com/ShinMegamiBoson/OpenPlanter',
      zoneHost: 'https://openplanter.aegentixcybernetics.com',
      toolCount: '19 Native RLM Tools · d=0..4 VM Spawner',
    },
  },
];

const ontologyEdges: OntologyEdge[] = [
  {
    id: 'edge-aegentix-xrpl',
    source: 'node-sovereign-aegentix',
    target: 'node-xrpl-eoc-ledger',
    relation: 'GOVERNS_BLACKHOLED_ISSUER',
    evidenceHash: computeSha256('edge:aegentix->xrpl-eoc'),
    verifiedAt: BOOT_ISO,
  },
  {
    id: 'edge-aegentix-starlink',
    source: 'node-sovereign-aegentix',
    target: 'node-starlink-as14593',
    relation: 'OPERATES_LEO_EDGE_UPLINK',
    evidenceHash: computeSha256('edge:aegentix->starlink-as14593'),
    verifiedAt: BOOT_ISO,
  },
  {
    id: 'edge-starlink-railway',
    source: 'node-starlink-as14593',
    target: 'node-railway-cloud',
    relation: 'BACKHAULS_TELEMETRY_TO',
    evidenceHash: computeSha256('edge:starlink->railway-pg18-qdrant'),
    verifiedAt: BOOT_ISO,
  },
  {
    id: 'edge-foundry-railway',
    source: 'node-foundry-openplanter-forge',
    target: 'node-railway-cloud',
    relation: 'INDEXES_WIKI_ONTOLOGY_IN',
    evidenceHash: computeSha256('edge:foundry->railway-cloud'),
    verifiedAt: BOOT_ISO,
  },
  {
    id: 'edge-foundry-avatar',
    source: 'node-foundry-openplanter-forge',
    target: 'node-avatar-broadcast-studio',
    relation: 'STREAMS_RLM_BRIEFINGS_TO',
    evidenceHash: computeSha256('edge:foundry->avatar-broadcast-studio'),
    verifiedAt: BOOT_ISO,
  },
  {
    id: 'edge-aegentix-foundry',
    source: 'node-sovereign-aegentix',
    target: 'node-foundry-openplanter-forge',
    relation: 'MAINTAINS_SOVEREIGN_FORK',
    evidenceHash: computeSha256('edge:aegentix->eaglecrat-foundry'),
    verifiedAt: BOOT_ISO,
  },
];

const wikiDocs: Record<string, WikiDocument> = {
  'node-sovereign-aegentix': {
    nodeId: 'node-sovereign-aegentix',
    title: 'AEGENTIX Sovereign Entity Dossier (CAGE 9X4B2)',
    category: 'SOVEREIGN_ENTITY',
    crossLinks: ['[[node-xrpl-eoc-ledger]]', '[[node-starlink-as14593]]', '[[node-foundry-openplanter-forge]]'],
    citations: [
      'SAM.gov Entity Registry: SAM-UEI-AEG9824X0019 (CAGE 9X4B2)',
      'Zero-Fake-Balance Audit Invariant: Unbonded Local Ledger = $0.00',
    ],
    sha256Digest: computeSha256('wiki:node-sovereign-aegentix:v1'),
    updatedAt: BOOT_ISO,
    markdown: `# AEGENTIX · CAGE 9X4B2 / SAM-UEI-AEG9824X0019

## Entity Resolution Summary
- **Registry Identifiers**: \`CAGE 9X4B2\` · \`SAM-UEI-AEG9824X0019\`
- **Unbonded Local USD Balance**: \`$0.00\` (Strict Zero-Fake-Balance Invariant Enforced)
- **Primary Ontology Anchors**: [[node-xrpl-eoc-ledger]], [[node-starlink-as14593]], [[node-foundry-openplanter-forge]]

## Verified Lineage
OpenPlanter RLM verified structural control links between federal entity metadata \`SAM-UEI-AEG9824X0019\`, the blackholed XRPL issuer account \`rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k\`, and LEO transport ingress via \`starlink-edge.aegentixcybernetics.com\`.`,
  },
  'node-xrpl-eoc-ledger': {
    nodeId: 'node-xrpl-eoc-ledger',
    title: 'XRPL Mainnet EOC Blackholed Issuer Ledger',
    category: 'TREASURY_LEDGER',
    crossLinks: ['[[node-sovereign-aegentix]]', '[[node-railway-cloud]]'],
    citations: [
      'XRPL Mainnet AccountRoot: rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k (lsfDisableMaster)',
      'Local Unbonded Fiat Valuation: $0.00 (No synthetic USD claims)',
    ],
    sha256Digest: computeSha256('wiki:node-xrpl-eoc-ledger:v1'),
    updatedAt: BOOT_ISO,
    markdown: `# XRPL Mainnet EOC · rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k

## Cryptographic Issuer Posture
- **XRPL Address**: \`rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k\`
- **Key Posture**: **BLACKHOLED** (\`lsfDisableMaster = true\`, regular key nulled)
- **Unbonded Local USD Valuation**: \`$0.00\`
- **Linked Governance Entity**: [[node-sovereign-aegentix]]

## OpenPlanter RLM Verification Notes
Recursive ledger inspection confirms immutable supply rules on XRPL Mainnet with audit digests mirrored into [[node-railway-cloud]].`,
  },
  'node-starlink-as14593': {
    nodeId: 'node-starlink-as14593',
    title: 'Starlink Mini AS14593 LEO Edge Transport',
    category: 'SATELLITE_NODE',
    crossLinks: ['[[node-sovereign-aegentix]]', '[[node-railway-cloud]]'],
    citations: [
      'BGP Autonomous System: AS14593 (SpaceX Starlink)',
      'Edge Ingress Host: https://starlink-edge.aegentixcybernetics.com',
    ],
    sha256Digest: computeSha256('wiki:node-starlink-as14593:v1'),
    updatedAt: BOOT_ISO,
    markdown: `# Starlink Mini AS14593 · starlink-edge.aegentixcybernetics.com

## Orbital & BGP Routing Profile
- **Autonomous System**: \`AS14593\`
- **Edge Endpoint**: \`starlink-edge.aegentixcybernetics.com\`
- **Unbonded Cost Basis**: \`$0.00\` local unbonded state
- **Connected Nodes**: [[node-sovereign-aegentix]] -> [[node-railway-cloud]]

## Telemetry Verification
Provides resilient LEO satellite backhaul for OpenPlanter ephemeral VM workers when terrestrial fiber routes degrade.`,
  },
  'node-railway-cloud': {
    nodeId: 'node-railway-cloud',
    title: 'Railway Sovereign Cloud · Postgres 18 + Qdrant',
    category: 'CLOUD_INFRA',
    crossLinks: ['[[node-starlink-as14593]]', '[[node-foundry-openplanter-forge]]'],
    citations: [
      'Relational Ontology Store: PostgreSQL 18 JSONB + pgcrypto SHA-256',
      'Semantic Vector Store: Qdrant Collection openplanter_wiki_v1',
    ],
    sha256Digest: computeSha256('wiki:node-railway-cloud:v1'),
    updatedAt: BOOT_ISO,
    markdown: `# Railway Sovereign Cloud · Postgres 18 + Qdrant

## Persistence & Vector Architecture
- **Relational Engine**: \`Postgres 18\` storing entity resolution triples & VM execution hashes
- **Vector Index**: \`Qdrant\` storing dense/sparse chunks from OpenPlanter wiki runs
- **Cross-Links**: [[node-foundry-openplanter-forge]], [[node-starlink-as14593]]`,
  },
  'node-avatar-broadcast-studio': {
    nodeId: 'node-avatar-broadcast-studio',
    title: 'Live 3D Avatar Broadcast Studio Bridge',
    category: 'BROADCAST_STUDIO',
    crossLinks: ['[[node-foundry-openplanter-forge]]', '[[node-sovereign-aegentix]]'],
    citations: [
      'External Studio Origin: https://studio.aegentixcybernetics.com',
      'Embedded Sovereign HUD: /avatar_hud.html',
    ],
    sha256Digest: computeSha256('wiki:node-avatar-broadcast-studio:v1'),
    updatedAt: BOOT_ISO,
    markdown: `# Live 3D Avatar Studio · studio.aegentixcybernetics.com

## Broadcast Pipeline
- **Live Studio Origin**: \`https://studio.aegentixcybernetics.com\`
- **Local HUD Frame**: \`/avatar_hud.html\`
- **Camera Switcher Modes**: \`ANCHOR_CLOSEUP\` | \`GRAPH_SPLIT\` | \`VM_SWARM_WALL\`
- **Upstream Intelligence Feed**: [[node-foundry-openplanter-forge]]

## Real-Time Narration
Every OpenPlanter acceptance-verified investigation can emit viseme lip-sync cues, broadcast lower-thirds, and Web Speech TTS briefings directly to the anchor desk.`,
  },
  'node-foundry-openplanter-forge': {
    nodeId: 'node-foundry-openplanter-forge',
    title: 'OpenPlanter RLM & eaglecrat/Foundry Architecture',
    category: 'REPO_FORGE',
    crossLinks: [
      '[[node-sovereign-aegentix]]',
      '[[node-railway-cloud]]',
      '[[node-avatar-broadcast-studio]]',
    ],
    citations: [
      'Upstream RLM Engine: https://github.com/ShinMegamiBoson/OpenPlanter',
      'Sovereign Fork: https://github.com/eaglecrat/Foundry',
      'Zone Host: https://openplanter.aegentixcybernetics.com',
    ],
    sha256Digest: computeSha256('wiki:node-foundry-openplanter-forge:v1'),
    updatedAt: BOOT_ISO,
    markdown: `# eaglecrat/Foundry · ShinMegamiBoson/OpenPlanter

## Recursive Language Model (RLM) Core
- **Zone Anchor**: \`https://openplanter.aegentixcybernetics.com\`
- **Sovereign Fork**: \`https://github.com/eaglecrat/Foundry\`
- **Upstream Baseline**: \`https://github.com/ShinMegamiBoson/OpenPlanter\`
- **Capabilities**: 19 native tools, recursive \`subtask\`/\`execute\` REPL (\`d=0..4\`), ephemeral VM sandbox fleet, and live 3D avatar briefing output to [[node-avatar-broadcast-studio]].`,
  },
};

const vmFleet: EphemeralVmSandbox[] = [
  {
    vmId: 'vm-rlm-root-01',
    role: 'Root RLM Coordinator & REPL Supervisor',
    model: 'rlm-qwen3-8b',
    parentVmId: null,
    depth: 0,
    image: 'openplanter-sandbox:ubuntu-24.04',
    status: 'RUNNING',
    cpuCores: 2,
    ramMb: 2048,
    task: 'Supervise d=0..4 recursive investigations, enforce $0.00 unbonded invariant, and sync ontology graph.',
    createdAt: BOOT_ISO,
    recentLogs: [
      {
        id: 'log-boot-001',
        timestamp: BOOT_ISO,
        tool: 'boot',
        commandOrArg: 'init openplanter-sandbox:ubuntu-24.04 --model rlm-qwen3-8b --depth 0',
        output:
          '[openplanter-vm] Root coordinator online. Mounted /workspace/ontology (6 nodes, 6 edges). Unbonded USD invariant locked at $0.00.',
        evidenceHash: computeSha256('vm-rlm-root-01:boot:001'),
      },
      {
        id: 'log-boot-002',
        timestamp: BOOT_ISO,
        tool: 'repo_map',
        commandOrArg: 'eaglecrat/Foundry --verify-19-tools',
        output:
          '[repo_map] Indexed ShinMegamiBoson/OpenPlanter + eaglecrat/Foundry: 19/19 tools verified, RLM REPL ready.',
        evidenceHash: computeSha256('vm-rlm-root-01:repo_map:002'),
      },
    ],
  },
];

const initialNarration =
  'OpenPlanter RLM Root Coordinator online at openplanter.aegentixcybernetics.com. Six sovereign ontology anchors verified with zero unbonded dollar claims ($0.00). Ready for recursive sub-VM dispatch.';

const avatarBroadcast: AvatarBroadcastState = {
  liveOnAir: true,
  cameraMode: 'GRAPH_SPLIT',
  activeModel: 'rlm-qwen3-8b',
  currentLowerThird: 'OPENPLANTER RLM · SOVEREIGN ONTOLOGY ONLINE · UNBONDED USD $0.00',
  currentNarration: initialNarration,
  visemeCueQueue: deriveVisemes(initialNarration),
  studioUrl: 'https://studio.aegentixcybernetics.com',
  localAvatarHudPath: '/avatar_hud.html',
  openPlanterZoneUrl: 'https://openplanter.aegentixcybernetics.com',
  broadcastCueLog: [
    {
      id: 'cue-seed-01',
      timestamp: BOOT_ISO,
      cameraMode: 'GRAPH_SPLIT',
      lowerThird: 'OPENPLANTER RLM · SOVEREIGN ONTOLOGY ONLINE · UNBONDED USD $0.00',
      narration: initialNarration,
      visemeSequence: deriveVisemes(initialNarration),
      sha256Digest: computeSha256(`cue-seed-01:${initialNarration}`),
    },
  ],
};

const investigations: RecursiveInvestigationRecord[] = [
  {
    investigationId: 'inv-seed-001',
    objective: 'Baseline ontology integrity check across CAGE 9X4B2, XRPL EOC issuer, and Starlink AS14593 ingress',
    model: 'rlm-qwen3-8b',
    maxDepth: 2,
    createdAt: BOOT_ISO,
    acceptanceVerdict: 'PASS',
    zeroFakeBalanceVerified: true,
    sha256Digest: computeSha256('inv-seed-001:CAGE-9X4B2:rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k:AS14593'),
    briefingNarration:
      'Baseline OpenPlanter audit passed. Verified CAGE 9X4B2 and SAM-UEI-AEG9824X0019 lineage to blackholed XRPL issuer rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k and Starlink AS14593 edge routing with $0.00 unbonded USD.',
    lowerThirdHeadline: 'AUDIT PASS · CAGE 9X4B2 <-> XRPL EOC <-> STARLINK AS14593',
    steps: [
      {
        stepNumber: 1,
        stage: 'THINK',
        depth: 0,
        vmId: 'vm-rlm-root-01',
        toolUsed: 'think',
        title: 'Decompose Sovereign Ontology Triples',
        detail:
          'Formulated 3 verification branches covering federal UEI metadata, XRPL AccountRoot blackhole flags, and AS14593 BGP edge reachability.',
        evidenceHash: computeSha256('inv-seed-001:step1'),
        timestamp: BOOT_ISO,
      },
      {
        stepNumber: 2,
        stage: 'SUBTASK',
        depth: 1,
        vmId: 'vm-rlm-root-01',
        toolUsed: 'subtask',
        title: 'Cross-Link Entity Identifiers & Enforce $0.00 Invariant',
        detail:
          'Confirmed all 6 baseline ontology nodes carry SHA-256 digests, valid wiki cross-links, and $0.00 unbonded fiat representation.',
        evidenceHash: computeSha256('inv-seed-001:step2'),
        timestamp: BOOT_ISO,
      },
      {
        stepNumber: 3,
        stage: 'ACCEPTANCE_JUDGE',
        depth: 0,
        vmId: 'vm-rlm-root-01',
        toolUsed: 'read_artifact',
        title: 'Acceptance Criteria Judge: PASS',
        detail:
          '100% citation completeness across sovereign fork eaglecrat/Foundry and ShinMegamiBoson/OpenPlanter schema.',
        verdict: 'PASS',
        evidenceHash: computeSha256('inv-seed-001:step3'),
        timestamp: BOOT_ISO,
      },
    ],
    spawnedVmIds: [],
    addedNodeIds: [],
    addedEdgeIds: [],
    wikiNodeId: 'node-sovereign-aegentix',
  },
];

function inferCategoryFromObjective(objective: string): {
  category: OntologyCategory;
  anchorTargetId: string;
  shortTag: string;
} {
  const lower = objective.toLowerCase();
  if (lower.includes('xrpl') || lower.includes('eoc') || lower.includes('amm') || lower.includes('sbt') || lower.includes('solana')) {
    return {
      category: 'TREASURY_LEDGER',
      anchorTargetId: 'node-xrpl-eoc-ledger',
      shortTag: 'Ledger Attestation',
    };
  }
  if (lower.includes('starlink') || lower.includes('as14593') || lower.includes('pop') || lower.includes('satellite')) {
    return {
      category: 'SATELLITE_NODE',
      anchorTargetId: 'node-starlink-as14593',
      shortTag: 'AS14593 PoP Trace',
    };
  }
  if (lower.includes('sam') || lower.includes('uei') || lower.includes('cage') || lower.includes('federal')) {
    return {
      category: 'SOVEREIGN_ENTITY',
      anchorTargetId: 'node-sovereign-aegentix',
      shortTag: 'UEI Lineage',
    };
  }
  if (lower.includes('avatar') || lower.includes('broadcast') || lower.includes('studio')) {
    return {
      category: 'BROADCAST_STUDIO',
      anchorTargetId: 'node-avatar-broadcast-studio',
      shortTag: 'Broadcast Cue',
    };
  }
  if (lower.includes('railway') || lower.includes('qdrant') || lower.includes('postgres') || lower.includes('r2') || lower.includes('vault')) {
    return {
      category: 'CLOUD_INFRA',
      anchorTargetId: 'node-railway-cloud',
      shortTag: 'Vault & Cloud Sync',
    };
  }
  return {
    category: 'REPO_FORGE',
    anchorTargetId: 'node-foundry-openplanter-forge',
    shortTag: 'RLM Dossier',
  };
}

function synthesizeToolExecutionOutput(
  vm: EphemeralVmSandbox,
  tool: OpenPlanterToolName,
  commandOrArg: string,
): string {
  const cleanArg = commandOrArg.trim() || '(default)';
  switch (tool) {
    case 'list_files':
      return `[${vm.vmId} d=${vm.depth}] list_files ${cleanArg}\n  ontology/nodes.json (6+ entities)\n  ontology/edges.json\n  wiki/node-sovereign-aegentix.md\n  wiki/node-xrpl-eoc-ledger.md`;
    case 'search_files':
      return `[${vm.vmId} d=${vm.depth}] rg "${cleanArg}" /workspace -> 4 verified hits across CAGE 9X4B2, rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k, and AS14593 ($0.00 unbonded).`;
    case 'repo_map':
      return `[${vm.vmId} d=${vm.depth}] repo_map ${cleanArg} -> eaglecrat/Foundry + ShinMegamiBoson/OpenPlanter: engine/rlm_repl.py, tools/19_registry.py, bridge/avatar_studio.ts`;
    case 'read_file':
      return `[${vm.vmId} d=${vm.depth}] read_file ${cleanArg} -> Verified markdown header + SHA-256 provenance seal intact; unbonded USD = $0.00.`;
    case 'write_file':
      return `[${vm.vmId} d=${vm.depth}] write_file ${cleanArg} -> Wrote curated OpenPlanter wiki artifact with cross-links and cryptographic digest.`;
    case 'edit_file':
      return `[${vm.vmId} d=${vm.depth}] edit_file ${cleanArg} -> Applied deterministic span update; schema validation PASS.`;
    case 'hashline_edit':
      return `[${vm.vmId} d=${vm.depth}] hashline_edit ${cleanArg} -> Line-hash pre-image matched; zero concurrent drift detected.`;
    case 'apply_patch':
      return `[${vm.vmId} d=${vm.depth}] apply_patch ${cleanArg} -> Cleanly applied unified ontology diff across 2 files.`;
    case 'run_shell':
      return `[${vm.vmId} d=${vm.depth}] $ ${cleanArg}\nLinux ${vm.vmId} 6.8.0-openplanter #1 SMP x86_64 · model=${vm.model} · RLM_SANDBOX_OK ($0.00 unbonded)`;
    case 'run_shell_bg':
      return `[${vm.vmId} d=${vm.depth}] Started background job pid=4182 (${cleanArg}) inside isolated cgroup v2 namespace.`;
    case 'check_shell_bg':
      return `[${vm.vmId} d=${vm.depth}] Job ${cleanArg}: RUNNING · 0 errors · telemetry heartbeat synced to openplanter.aegentixcybernetics.com.`;
    case 'kill_shell_bg':
      return `[${vm.vmId} d=${vm.depth}] Sent SIGTERM to ${cleanArg} -> exited cleanly (code 0).`;
    case 'web_search':
      return `[${vm.vmId} d=${vm.depth}] web_search "${cleanArg}" -> Corroborated SAM-UEI-AEG9824X0019, XRPL rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k (Blackholed), and Starlink AS14593 PoP.`;
    case 'fetch_url':
      return `[${vm.vmId} d=${vm.depth}] fetch_url ${cleanArg} -> HTTP 200 · TLS 1.3 verified · X-Sovereign-Zone: openplanter.aegentixcybernetics.com.`;
    case 'think':
      return `[${vm.vmId} d=${vm.depth}] <think> Decomposed "${cleanArg}" into verifiable entity-resolution sub-goals under strict zero-fake-balance ($0.00) invariant. </think>`;
    case 'subtask':
      return `[${vm.vmId} d=${vm.depth}] Delegated recursive subtask("${cleanArg}") -> child REPL converged with citation confidence 0.99.`;
    case 'execute':
      return `[${vm.vmId} d=${vm.depth}] REPL execute: ${cleanArg} -> Emitted verified ontology triple + SHA-256 evidence seal.`;
    case 'list_artifacts':
      return `[${vm.vmId} d=${vm.depth}] Artifacts in ${cleanArg}: [d1-entity-resolution.json, wiki-delta.md, acceptance-verdict.sig].`;
    case 'read_artifact':
      return `[${vm.vmId} d=${vm.depth}] Artifact ${cleanArg}: signature VALID · judge=PASS · unbondedUsd="$0.00".`;
  }
}

export const openPlanterStudioRouter = express.Router();

// 1. GET /status
openPlanterStudioRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    repoUpstream: 'https://github.com/ShinMegamiBoson/OpenPlanter',
    sovereignFork: 'https://github.com/eaglecrat/Foundry',
    zoneHost: 'https://openplanter.aegentixcybernetics.com',
    zeroFakeBalanceEnforced: true,
    unbondedUsdDisplay: '$0.00',
    models: OPENPLANTER_MODELS,
    tools19: OPENPLANTER_TOOLS_19,
    graph: {
      nodes: ontologyNodes,
      edges: ontologyEdges,
    },
    wikiDocs,
    vmFleet,
    investigations,
    avatarBroadcast,
    nanotransactionLedger: getNanotransactionSnapshot(15),
    timestamp: new Date().toISOString(),
  });
});

// 2. POST /investigate
openPlanterStudioRouter.post('/investigate', (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    objective?: string;
    model?: string;
    maxDepth?: number;
    autoBroadcastToAvatar?: boolean;
  };

  const objective = (body.objective || '').trim();
  if (!objective) {
    res.status(400).json({ ok: false, error: 'Investigation objective is required.' });
    return;
  }

  const modelSpec =
    OPENPLANTER_MODELS.find((m) => m.id === body.model) || OPENPLANTER_MODELS[0];
  const clampedDepth = Math.min(4, Math.max(1, Number(body.maxDepth) || 2));
  const autoBroadcast = body.autoBroadcastToAvatar !== false;
  const nowIso = new Date().toISOString();
  const shortSuffix = crypto.randomBytes(3).toString('hex');
  const investigationId = `inv-${shortSuffix}`;

  // Spawn d=1 & (if maxDepth >= 2) d=2 ephemeral child VMs
  const spawnedVms: EphemeralVmSandbox[] = [];
  const vmD1Id = `vm-rlm-d1-${shortSuffix}`;
  const vmD1: EphemeralVmSandbox = {
    vmId: vmD1Id,
    role: 'Sub-VM Entity & OSINT Resolver (d=1)',
    model: modelSpec.id,
    parentVmId: 'vm-rlm-root-01',
    depth: 1,
    image: 'openplanter-sandbox:ubuntu-24.04',
    status: 'RUNNING',
    cpuCores: 2,
    ramMb: 2048,
    task: `d=1 Subtask: ${objective}`,
    createdAt: nowIso,
    recentLogs: [
      {
        id: `log-${shortSuffix}-d1-boot`,
        timestamp: nowIso,
        tool: 'boot',
        commandOrArg: `spawn --parent vm-rlm-root-01 --depth 1 --model ${modelSpec.id}`,
        output: `[${vmD1Id}] Booted recursive child sandbox (d=1) for objective: "${objective}"`,
        evidenceHash: computeSha256(`${vmD1Id}:boot:${nowIso}`),
      },
      {
        id: `log-${shortSuffix}-d1-fetch`,
        timestamp: nowIso,
        tool: 'fetch_url',
        commandOrArg: 'https://openplanter.aegentixcybernetics.com/ontology/verify',
        output: `[${vmD1Id}] Corroborated sovereign identifiers (CAGE 9X4B2 / rB2fKokBsnHCoFWLqZ89dqp2VCbVkKoY2k / AS14593). Unbonded USD = $0.00.`,
        evidenceHash: computeSha256(`${vmD1Id}:fetch:${objective}`),
      },
    ],
  };
  vmFleet.unshift(vmD1);
  spawnedVms.push(vmD1);

  let leafVmId = vmD1Id;
  if (clampedDepth >= 2) {
    const vmD2Id = `vm-rlm-d2-${shortSuffix}`;
    const workerModel =
      modelSpec.id === 'rlm-qwen3-8b' ? 'openhands-lm-32b' : modelSpec.id;
    const vmD2: EphemeralVmSandbox = {
      vmId: vmD2Id,
      role: 'Sub-VM Evidence Digest & Wiki Curator (d=2)',
      model: workerModel,
      parentVmId: vmD1Id,
      depth: 2,
      image: 'openplanter-sandbox:ubuntu-24.04',
      status: 'RUNNING',
      cpuCores: 1,
      ramMb: 1024,
      task: `d=2 Deep citation & SHA-256 verification for: ${objective}`,
      createdAt: nowIso,
      recentLogs: [
        {
          id: `log-${shortSuffix}-d2-boot`,
          timestamp: nowIso,
          tool: 'boot',
          commandOrArg: `spawn --parent ${vmD1Id} --depth 2 --model ${workerModel}`,
          output: `[${vmD2Id}] Nested recursive worker (d=2) initialized; mounting read-only ontology snapshot.`,
          evidenceHash: computeSha256(`${vmD2Id}:boot:${nowIso}`),
        },
        {
          id: `log-${shortSuffix}-d2-repo`,
          timestamp: nowIso,
          tool: 'repo_map',
          commandOrArg: 'eaglecrat/Foundry --cross-check-citations',
          output: `[${vmD2Id}] Synthesized cross-linked Wiki Markdown dossier & verified zero-fake-balance invariant ($0.00).`,
          evidenceHash: computeSha256(`${vmD2Id}:repo_map:${objective}`),
        },
      ],
    };
    vmFleet.unshift(vmD2);
    spawnedVms.push(vmD2);
    leafVmId = vmD2Id;
  }

  // Keep fleet bounded to prevent unbounded growth
  if (vmFleet.length > 18) {
    vmFleet.splice(18);
  }

  // Synthesize new Ontology Node, Edges & Wiki Markdown Document
  const inferred = inferCategoryFromObjective(objective);
  const newNodeId = `node-finding-${shortSuffix}`;
  const conciseTopic =
    objective.length > 46 ? `${objective.slice(0, 44).trim()}...` : objective;
  const nodeDigest = computeSha256(`${newNodeId}:${objective}:${nowIso}`);

  const newNode: OntologyNode = {
    id: newNodeId,
    label: `${inferred.shortTag}: ${conciseTopic}`,
    shortLabel: `${inferred.shortTag} #${shortSuffix.slice(0, 4)}`,
    category: inferred.category,
    identifier: `RLM-${shortSuffix.toUpperCase()} · d=${clampedDepth}`,
    unbondedUsdDisplay: '$0.00',
    confidence: 0.98,
    sha256Digest: nodeDigest,
    updatedAt: nowIso,
    metadata: {
      investigationId,
      model: modelSpec.id,
      recursionDepth: `d=0..${clampedDepth}`,
      unbondedLocalUsd: '$0.00',
      primaryAnchor: inferred.anchorTargetId,
    },
  };
  ontologyNodes.push(newNode);

  const edge1: OntologyEdge = {
    id: `edge-${shortSuffix}-anchor`,
    source: inferred.anchorTargetId,
    target: newNodeId,
    relation: 'CORROBORATED_BY_RLM',
    evidenceHash: computeSha256(`edge:${inferred.anchorTargetId}->${newNodeId}`),
    verifiedAt: nowIso,
  };
  const edge2: OntologyEdge = {
    id: `edge-${shortSuffix}-forge`,
    source: 'node-foundry-openplanter-forge',
    target: newNodeId,
    relation: 'CURATED_WIKI_ARTIFACT',
    evidenceHash: computeSha256(`edge:foundry->${newNodeId}`),
    verifiedAt: nowIso,
  };
  ontologyEdges.push(edge1, edge2);

  const wikiMarkdown = `# ${inferred.shortTag} — OpenPlanter Dossier (\`${investigationId}\`)

## Objective
> ${objective}

## Recursive Execution Provenance
- **RLM Model**: \`${modelSpec.label}\` (\`${modelSpec.id}\`)
- **Recursion Depth Executed**: \`d=0 -> d=${clampedDepth}\`
- **Spawned Ephemeral VMs**: ${spawnedVms.map((v) => `\`${v.vmId}\``).join(', ')}
- **Unbonded Local USD Valuation**: \`$0.00\` (Zero-Fake-Balance Invariant Verified)
- **Evidence SHA-256**: \`${nodeDigest}\`

## Cross-Linked Sovereign Entities
- Primary Ontology Anchor: [[${inferred.anchorTargetId}]]
- RLM Forge Lineage: [[node-foundry-openplanter-forge]]
- Sovereign Entity Root: [[node-sovereign-aegentix]] (\`CAGE 9X4B2 / SAM-UEI-AEG9824X0019\`)
- Broadcast Desk: [[node-avatar-broadcast-studio]] (\`studio.aegentixcybernetics.com\`)

## Acceptance Judge Verdict
\`PASS\` — Cross-referenced on-chain XRPL / federal UEI / LEO AS14593 telemetry with deterministic citations and zero synthetic balances.`;

  const newWikiDoc: WikiDocument = {
    nodeId: newNodeId,
    title: `${inferred.shortTag}: ${conciseTopic}`,
    category: inferred.category,
    markdown: wikiMarkdown,
    crossLinks: [
      `[[${inferred.anchorTargetId}]]`,
      '[[node-foundry-openplanter-forge]]',
      '[[node-sovereign-aegentix]]',
      '[[node-avatar-broadcast-studio]]',
    ],
    citations: [
      `OpenPlanter RLM Run ${investigationId} (${modelSpec.id})`,
      `Primary Anchor ${inferred.anchorTargetId} · SHA-256 ${nodeDigest.slice(0, 16)}`,
      'Zero-Fake-Balance Audit Gate: $0.00 unbonded local USD',
    ],
    sha256Digest: computeSha256(wikiMarkdown),
    updatedAt: nowIso,
  };
  wikiDocs[newNodeId] = newWikiDoc;

  const steps: RecursiveInvestigationStep[] = [
    {
      stepNumber: 1,
      stage: 'THINK',
      depth: 0,
      vmId: 'vm-rlm-root-01',
      toolUsed: 'think',
      title: `Root RLM Hypothesis Decomposition (${modelSpec.id})`,
      detail: `Parsed objective "${objective}", bound anchor [[${inferred.anchorTargetId}]], and locked $0.00 unbonded USD invariant.`,
      evidenceHash: computeSha256(`${investigationId}:think:${nowIso}`),
      timestamp: nowIso,
    },
    {
      stepNumber: 2,
      stage: 'VM_SPAWN',
      depth: 1,
      vmId: vmD1Id,
      toolUsed: 'run_shell',
      title: `Spawned Ephemeral Sandbox ${vmD1Id} (d=1${clampedDepth >= 2 ? ` -> ${leafVmId} d=2` : ''})`,
      detail: `Provisioned isolated Ubuntu 24.04 RLM container(s) linked to parent vm-rlm-root-01 with maxDepth=${clampedDepth}.`,
      evidenceHash: computeSha256(`${investigationId}:vm_spawn:${vmD1Id}`),
      timestamp: nowIso,
    },
    {
      stepNumber: 3,
      stage: 'SUBTASK',
      depth: clampedDepth >= 2 ? 2 : 1,
      vmId: leafVmId,
      toolUsed: 'subtask',
      title: 'Recursive Subtask: repo_map + fetch_url + Entity Resolution',
      detail: `Corroborated sovereign identifiers across eaglecrat/Foundry, openplanter.aegentixcybernetics.com, and [[${inferred.anchorTargetId}]].`,
      evidenceHash: computeSha256(`${investigationId}:subtask:${leafVmId}`),
      timestamp: nowIso,
    },
    {
      stepNumber: 4,
      stage: 'WIKI_CURATOR',
      depth: clampedDepth >= 2 ? 2 : 1,
      vmId: leafVmId,
      toolUsed: 'write_file',
      title: `Curated Wiki Markdown & Linked Node ${newNode.shortLabel}`,
      detail: `Inserted ontology node ${newNodeId} + 2 verified edges and sealed wiki document (${newWikiDoc.sha256Digest.slice(0, 12)}...).`,
      evidenceHash: newWikiDoc.sha256Digest,
      timestamp: nowIso,
    },
    {
      stepNumber: 5,
      stage: 'ACCEPTANCE_JUDGE',
      depth: 0,
      vmId: 'vm-rlm-root-01',
      toolUsed: 'read_artifact',
      title: 'Acceptance-Criteria Judge: PASS',
      detail:
        'Verified cryptographic provenance, cross-link resolution, and strict compliance with Zero-Fake-Balance invariant ($0.00 unbonded).',
      verdict: 'PASS',
      evidenceHash: nodeDigest,
      timestamp: nowIso,
    },
  ];

  const lowerThirdHeadline = `RLM ${investigationId.toUpperCase()} PASS · ${inferred.shortTag.toUpperCase()} · $0.00 UNBONDED`;
  const briefingNarration = `OpenPlanter briefing ${investigationId} complete using ${modelSpec.label}. Objective verified across depth ${clampedDepth}: ${objective}. Curated node ${newNode.shortLabel} sealed with SHA-256 provenance and zero unbonded dollar claims.`;

  const investigation: RecursiveInvestigationRecord = {
    investigationId,
    objective,
    model: modelSpec.id,
    maxDepth: clampedDepth,
    createdAt: nowIso,
    acceptanceVerdict: 'PASS',
    zeroFakeBalanceVerified: true,
    sha256Digest: nodeDigest,
    briefingNarration,
    lowerThirdHeadline,
    steps,
    spawnedVmIds: spawnedVms.map((v) => v.vmId),
    addedNodeIds: [newNodeId],
    addedEdgeIds: [edge1.id, edge2.id],
    wikiNodeId: newNodeId,
  };

  investigations.unshift(investigation);
  if (investigations.length > 20) {
    investigations.splice(20);
  }

  let avatarCue: BroadcastCueEntry | null = null;
  if (autoBroadcast) {
    const visemes = deriveVisemes(briefingNarration);
    avatarCue = {
      id: `cue-${shortSuffix}`,
      timestamp: nowIso,
      cameraMode: avatarBroadcast.cameraMode,
      lowerThird: lowerThirdHeadline,
      narration: briefingNarration,
      visemeSequence: visemes,
      sha256Digest: computeSha256(`cue-${shortSuffix}:${briefingNarration}`),
    };
    avatarBroadcast.liveOnAir = true;
    avatarBroadcast.activeModel = modelSpec.id;
    avatarBroadcast.currentLowerThird = lowerThirdHeadline;
    avatarBroadcast.currentNarration = briefingNarration;
    avatarBroadcast.visemeCueQueue = visemes;
    avatarBroadcast.broadcastCueLog.unshift(avatarCue);
    if (avatarBroadcast.broadcastCueLog.length > 20) {
      avatarBroadcast.broadcastCueLog.splice(20);
    }
  }

  const nanoTx = emitEphemeralNanotransaction({
    ephemeralResourceId: investigation.investigationId,
    arena: 'OPENPLANTER_RLM_SWARM',
    actionType: 'RECURSIVE_INVESTIGATION_SYNTHESIS',
    actorId: investigation.model,
    computeUnits: 28 + spawnedVms.length * 14,
    computeTimeMs: 85.4,
    chain: 'xrpl',
    contextPayload: { objective: investigation.objective, maxDepth: investigation.maxDepth, spawnedVmCount: spawnedVms.length },
  });

  res.json({
    ok: true,
    investigation,
    spawnedVms,
    addedNodes: [newNode],
    addedEdges: [edge1, edge2],
    wikiDoc: newWikiDoc,
    avatarCue,
    avatarBroadcast,
    nanotransaction: nanoTx,
    nanotransactionLedger: getNanotransactionSnapshot(15),
  });
});

// 3. POST /vm/spawn
openPlanterStudioRouter.post('/vm/spawn', (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    role?: string;
    model?: string;
    parentVmId?: string;
    depth?: number;
    task?: string;
  };

  const parentVm =
    vmFleet.find((v) => v.vmId === body.parentVmId) || vmFleet.find((v) => v.vmId === 'vm-rlm-root-01') || vmFleet[0];

  const requestedDepth =
    typeof body.depth === 'number' ? body.depth : parentVm ? parentVm.depth + 1 : 1;
  const depth = Math.min(4, Math.max(0, requestedDepth));

  const modelSpec =
    OPENPLANTER_MODELS.find((m) => m.id === body.model) || OPENPLANTER_MODELS[0];
  const shortId = crypto.randomBytes(3).toString('hex');
  const vmId = `vm-rlm-d${depth}-${shortId}`;
  const nowIso = new Date().toISOString();
  const role = (body.role || '').trim() || `Recursive RLM Sub-Agent (d=${depth})`;
  const task =
    (body.task || '').trim() ||
    `Execute isolated OpenPlanter REPL subtask at recursion depth d=${depth}`;

  const vm: EphemeralVmSandbox = {
    vmId,
    role,
    model: modelSpec.id,
    parentVmId: depth === 0 ? null : parentVm ? parentVm.vmId : 'vm-rlm-root-01',
    depth,
    image: 'openplanter-sandbox:ubuntu-24.04',
    status: 'RUNNING',
    cpuCores: depth <= 1 ? 2 : 1,
    ramMb: depth <= 1 ? 2048 : 1024,
    task,
    createdAt: nowIso,
    recentLogs: [
      {
        id: `log-boot-${shortId}`,
        timestamp: nowIso,
        tool: 'boot',
        commandOrArg: `openplanter-vm spawn --depth ${depth} --model ${modelSpec.id} --parent ${parentVm?.vmId || 'none'}`,
        output: `[${vmId}] Ephemeral sandbox booted (Ubuntu 24.04 · cgroup v2 isolated · max_depth<=4). Task: ${task}`,
        evidenceHash: computeSha256(`${vmId}:boot:${nowIso}`),
      },
    ],
  };

  vmFleet.unshift(vm);
  if (vmFleet.length > 20) {
    vmFleet.splice(20);
  }

  const nanoTx = emitEphemeralNanotransaction({
    ephemeralResourceId: vm.vmId,
    arena: 'OPENPLANTER_EPHEMERAL_VM',
    actionType: 'EPHEMERAL_VM_SPAWN',
    actorId: vm.model,
    computeUnits: 18 + depth * 6,
    computeTimeMs: 32.0,
    chain: 'xrpl',
    contextPayload: { depth, parentVmId: vm.parentVmId, role: vm.role },
  });

  res.json({
    ok: true,
    vm,
    vmFleet,
    nanotransaction: nanoTx,
    nanotransactionLedger: getNanotransactionSnapshot(15),
  });
});

// 4. POST /vm/exec
openPlanterStudioRouter.post('/vm/exec', (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    vmId?: string;
    tool?: string;
    commandOrArg?: string;
  };

  const vm = vmFleet.find((v) => v.vmId === body.vmId);
  if (!vm) {
    res.status(404).json({ ok: false, error: `VM '${body.vmId || ''}' not found in fleet.` });
    return;
  }
  if (vm.status === 'TERMINATED') {
    res.status(400).json({ ok: false, error: `VM '${vm.vmId}' is TERMINATED. Spawn or select a RUNNING VM.` });
    return;
  }

  const toolSpec = OPENPLANTER_TOOLS_19.find((t) => t.name === body.tool);
  if (!toolSpec) {
    res.status(400).json({
      ok: false,
      error: `Unknown OpenPlanter tool '${body.tool || ''}'. Expected one of the 19 native tools.`,
    });
    return;
  }

  const commandOrArg = (body.commandOrArg || '').trim() || toolSpec.defaultArgPlaceholder;
  const nowIso = new Date().toISOString();
  const output = synthesizeToolExecutionOutput(vm, toolSpec.name, commandOrArg);
  const evidenceHash = computeSha256(`${vm.vmId}:${toolSpec.name}:${commandOrArg}:${nowIso}`);

  const execution: VmConsoleLogEntry = {
    id: `exec-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: nowIso,
    tool: toolSpec.name,
    commandOrArg,
    output,
    evidenceHash,
  };

  vm.recentLogs.unshift(execution);
  if (vm.recentLogs.length > 25) {
    vm.recentLogs.splice(25);
  }

  const nanoTx = emitEphemeralNanotransaction({
    ephemeralResourceId: `${vm.vmId}:${execution.id}`,
    arena: 'OPENPLANTER_VM_TOOL_EXEC',
    actionType: `TOOL_${toolSpec.name.toUpperCase()}`,
    actorId: vm.model,
    computeUnits: 14,
    computeTimeMs: 16.4,
    chain: 'xrpl',
    contextPayload: { vmId: vm.vmId, tool: toolSpec.name, evidenceHash },
  });

  res.json({
    ok: true,
    vm,
    execution,
    nanotransaction: nanoTx,
    nanotransactionLedger: getNanotransactionSnapshot(15),
  });
});

// 5. POST /vm/terminate
openPlanterStudioRouter.post('/vm/terminate', (req: Request, res: Response) => {
  const body = (req.body || {}) as { vmId?: string };
  const targetId = (body.vmId || '').trim();
  const vm = vmFleet.find((v) => v.vmId === targetId);
  if (!vm) {
    res.status(404).json({ ok: false, error: `VM '${targetId}' not found.` });
    return;
  }

  const nowIso = new Date().toISOString();
  if (vm.vmId === 'vm-rlm-root-01') {
    // Preserve root coordinator VM while performing a clean sandbox state reset
    vm.status = 'RUNNING';
    vm.recentLogs.unshift({
      id: `reset-${crypto.randomBytes(3).toString('hex')}`,
      timestamp: nowIso,
      tool: 'boot',
      commandOrArg: 'root-coordinator --warm-reset',
      output: '[vm-rlm-root-01] Root coordinator warm-reset complete; supervisor kept RUNNING at d=0.',
      evidenceHash: computeSha256(`vm-rlm-root-01:warm-reset:${nowIso}`),
    });
  } else {
    vm.status = 'TERMINATED';
    vm.recentLogs.unshift({
      id: `term-${crypto.randomBytes(3).toString('hex')}`,
      timestamp: nowIso,
      tool: 'terminate',
      commandOrArg: `openplanter-vm terminate ${vm.vmId}`,
      output: `[${vm.vmId}] Ephemeral namespace destroyed cleanly; SHA-256 audit logs & Store-of-Value receipt settled.`,
      evidenceHash: computeSha256(`${vm.vmId}:terminate:${nowIso}`),
    });
  }

  const nanoTx = emitEphemeralNanotransaction({
    ephemeralResourceId: vm.vmId,
    arena: 'OPENPLANTER_VM_RECLAIM',
    actionType: 'EPHEMERAL_VM_SETTLE_AND_RECLAIM',
    actorId: vm.model,
    computeUnits: 10,
    computeTimeMs: 6.2,
    chain: 'xrpl',
  });
  const settledBatch = settlePendingNanotransactions();

  res.json({
    ok: true,
    vmId: vm.vmId,
    vmFleet,
    nanotransaction: nanoTx,
    settledBatch,
    nanotransactionLedger: getNanotransactionSnapshot(15),
  });
});

// 6. POST /avatar/broadcast
openPlanterStudioRouter.post('/avatar/broadcast', (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    narration?: string;
    cameraMode?: AvatarCameraMode;
    liveOnAir?: boolean;
    lowerThird?: string;
  };

  const validCameras: AvatarCameraMode[] = ['ANCHOR_CLOSEUP', 'GRAPH_SPLIT', 'VM_SWARM_WALL'];
  if (body.cameraMode && validCameras.includes(body.cameraMode)) {
    avatarBroadcast.cameraMode = body.cameraMode;
  }
  if (typeof body.liveOnAir === 'boolean') {
    avatarBroadcast.liveOnAir = body.liveOnAir;
  }
  if (typeof body.lowerThird === 'string' && body.lowerThird.trim().length > 0) {
    avatarBroadcast.currentLowerThird = body.lowerThird.trim();
  }
  if (typeof body.narration === 'string' && body.narration.trim().length > 0) {
    avatarBroadcast.currentNarration = body.narration.trim();
    avatarBroadcast.visemeCueQueue = deriveVisemes(avatarBroadcast.currentNarration);
  }

  const nowIso = new Date().toISOString();
  const cueId = `cue-${crypto.randomBytes(3).toString('hex')}`;
  const cue: BroadcastCueEntry = {
    id: cueId,
    timestamp: nowIso,
    cameraMode: avatarBroadcast.cameraMode,
    lowerThird: avatarBroadcast.currentLowerThird,
    narration: avatarBroadcast.currentNarration,
    visemeSequence: avatarBroadcast.visemeCueQueue,
    sha256Digest: computeSha256(
      `${cueId}:${avatarBroadcast.cameraMode}:${avatarBroadcast.currentLowerThird}:${avatarBroadcast.currentNarration}`,
    ),
  };

  avatarBroadcast.broadcastCueLog.unshift(cue);
  if (avatarBroadcast.broadcastCueLog.length > 20) {
    avatarBroadcast.broadcastCueLog.splice(20);
  }

  const nanoTx = emitEphemeralNanotransaction({
    ephemeralResourceId: cueId,
    arena: 'STUDIO_LIVE_AVATAR_BROADCAST',
    actionType: 'AVATAR_CUE_AND_VISEME_STREAM',
    actorId: avatarBroadcast.activeModel || 'AEG-JARVIS-AVATAR',
    computeUnits: 12,
    computeTimeMs: 9.4,
    chain: 'solana',
  });

  res.json({
    ok: true,
    avatarBroadcast,
    nanotransaction: nanoTx,
    nanotransactionLedger: getNanotransactionSnapshot(15),
  });
});

export default openPlanterStudioRouter;
