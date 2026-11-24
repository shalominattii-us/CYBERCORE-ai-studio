import express, { type Request, type Response } from 'express';
import { createHash, createHmac } from 'crypto';

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

export interface ComplianceBlockInput {
  actor: string;
  action: string;
  status: string;
  timestamp?: string;
  contextData?: ComplianceContextData;
}

export interface EnrichedComplianceBlock extends ComplianceBlockRecord {
  isLinkValid: boolean;
  isHashValid: boolean;
  isSignatureValid: boolean;
  isExecutedTrade: boolean;
  integrityScore: number;
}

export interface ChainVerificationReport {
  valid: boolean;
  chainIntegrityPct: number;
  totalBlocks: number;
  verifiedLinks: number;
  executedTradeCount: number;
  brokenBlocks: number[];
  verifiedAt: string;
  algorithm: 'HMAC-SHA256';
}

const GENESIS_PREV_HASH = '0'.repeat(64);
const COMPLIANCE_HMAC_SECRET =
  process.env.COMPLIANCE_HMAC_SECRET || 'cybercore-institutional-audit-chain-v1-secret';

const complianceChain: ComplianceBlockRecord[] = [];

function computeBlockHash(payload: {
  blockHeight: number;
  timestamp: string;
  actor: string;
  action: string;
  prevHash: string;
  status: string;
  contextData?: ComplianceContextData;
}): string {
  const canonical = JSON.stringify({
    blockHeight: payload.blockHeight,
    timestamp: payload.timestamp,
    actor: payload.actor,
    action: payload.action,
    prevHash: payload.prevHash,
    status: payload.status,
    contextData: payload.contextData ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function computeHmacSignature(payload: {
  blockHeight: number;
  prevHash: string;
  hash: string;
  timestamp: string;
  actor: string;
  action: string;
}): string {
  const signingInput = [
    payload.blockHeight,
    payload.prevHash,
    payload.hash,
    payload.timestamp,
    payload.actor,
    payload.action,
  ].join('|');
  return createHmac('sha256', COMPLIANCE_HMAC_SECRET).update(signingInput).digest('hex');
}

function isTradeBlock(block: ComplianceBlockRecord): boolean {
  const actionUpper = block.action.toUpperCase();
  return Boolean(
    block.contextData?.txHash ||
      block.contextData?.pair ||
      actionUpper.includes('ARBITRAGE') ||
      actionUpper.includes('TRADE') ||
      actionUpper.includes('ALPHA_WIN') ||
      actionUpper.includes('EXECUTION')
  );
}

/**
 * Appends a cryptographically linked and HMAC-SHA256 signed block to the
 * in-memory compliance audit chain.
 */
export function appendComplianceBlock(entry: ComplianceBlockInput): ComplianceBlockRecord {
  const blockHeight = complianceChain.length;
  const prevHash =
    blockHeight === 0 ? GENESIS_PREV_HASH : complianceChain[blockHeight - 1].hash;
  const timestamp = entry.timestamp ?? new Date().toISOString();
  const contextData = entry.contextData
    ? { ...entry.contextData, blockHeight: entry.contextData.blockHeight ?? blockHeight }
    : undefined;

  const hash = computeBlockHash({
    blockHeight,
    timestamp,
    actor: entry.actor,
    action: entry.action,
    prevHash,
    status: entry.status,
    contextData,
  });

  const hmacSignature = computeHmacSignature({
    blockHeight,
    prevHash,
    hash,
    timestamp,
    actor: entry.actor,
    action: entry.action,
  });

  const record: ComplianceBlockRecord = {
    blockHeight,
    timestamp,
    actor: entry.actor,
    action: entry.action,
    prevHash,
    hash,
    hmacAlgorithm: 'HMAC-SHA256',
    hmacSignature,
    status: entry.status,
    contextData,
  };

  complianceChain.push(record);
  return record;
}

/**
 * Verifies hash continuity (prevHash === previous.hash), SHA-256 payload hash,
 * and HMAC-SHA256 signature for every block in the chain.
 */
export function evaluateComplianceChain(): {
  complianceChain: ComplianceBlockRecord[];
  enrichedBlocks: EnrichedComplianceBlock[];
  chainIntegrityPct: number;
  totalBlocks: number;
  verifiedLinks: number;
  executedTradeCount: number;
  brokenBlocks: number[];
} {
  let verifiedLinks = 0;
  let executedTradeCount = 0;
  const brokenBlocks: number[] = [];

  const enrichedBlocks: EnrichedComplianceBlock[] = complianceChain.map((block, index) => {
    const expectedPrevHash =
      index === 0 ? GENESIS_PREV_HASH : complianceChain[index - 1].hash;
    const isLinkValid = block.prevHash === expectedPrevHash;

    const recomputedHash = computeBlockHash({
      blockHeight: block.blockHeight,
      timestamp: block.timestamp,
      actor: block.actor,
      action: block.action,
      prevHash: block.prevHash,
      status: block.status,
      contextData: block.contextData,
    });
    const isHashValid = block.hash === recomputedHash;

    const recomputedSignature = computeHmacSignature({
      blockHeight: block.blockHeight,
      prevHash: block.prevHash,
      hash: block.hash,
      timestamp: block.timestamp,
      actor: block.actor,
      action: block.action,
    });
    const isSignatureValid = block.hmacSignature === recomputedSignature;

    const passedChecks =
      (isLinkValid ? 1 : 0) + (isHashValid ? 1 : 0) + (isSignatureValid ? 1 : 0);
    const integrityScore = Math.round((passedChecks / 3) * 100);

    if (isLinkValid && isHashValid && isSignatureValid) {
      verifiedLinks += 1;
    } else {
      brokenBlocks.push(block.blockHeight);
    }

    const isExecutedTrade = isTradeBlock(block);
    if (isExecutedTrade) {
      executedTradeCount += 1;
    }

    return {
      ...block,
      isLinkValid,
      isHashValid,
      isSignatureValid,
      isExecutedTrade,
      integrityScore,
    };
  });

  const totalBlocks = complianceChain.length;
  const chainIntegrityPct =
    totalBlocks === 0 ? 100 : Number(((verifiedLinks / totalBlocks) * 100).toFixed(2));

  return {
    complianceChain: [...complianceChain],
    enrichedBlocks,
    chainIntegrityPct,
    totalBlocks,
    verifiedLinks,
    executedTradeCount,
    brokenBlocks,
  };
}

// Seed 5 genesis/championship blocks with mathematically valid prevHash -> hash continuity
function seedGenesisBlocks(): void {
  if (complianceChain.length > 0) return;

  const baseMs = Date.now() - 1000 * 60 * 18;

  appendComplianceBlock({
    timestamp: new Date(baseMs).toISOString(),
    actor: 'CYBERCORE_ROOT_SIGNER',
    action: 'GENESIS_ANCHOR',
    status: 'VERIFIED',
    contextData: {
      auditId: 'AUD-GEN-0000',
      venue: 'CYBERCORE_MAINNET_LEDGER',
      strategy: 'HMAC_SHA256_ROOT_ANCHOR',
    },
  });

  appendComplianceBlock({
    timestamp: new Date(baseMs + 1000 * 60 * 4).toISOString(),
    actor: 'CHAMPIONSHIP_ARBITRAGE_ENGINE',
    action: 'ATOMIC_ARBITRAGE_CYCLE',
    status: 'EXECUTED',
    contextData: {
      auditId: 'AUD-ARB-0001',
      txHash: '0x7c4e9b2f81d0a35e6b1c4f92a8d3e7b5c1049f2a6d8e3b7c5a1f0e9d2c4b8a11',
      pair: 'ETH/USDC',
      venue: 'UNISWAP_V3 -> AERODROME_BASE',
      strategy: 'FLASH_ATOMIC_SPREAD_CAPTURE',
      amount: 14.5,
      executionPrice: 3284.42,
      spreadPct: 0.41,
      netAlphaUsd: 195.28,
    },
  });

  appendComplianceBlock({
    timestamp: new Date(baseMs + 1000 * 60 * 8).toISOString(),
    actor: 'EDGE_WORKER_ALPHA_NODE',
    action: 'EDGE_POSITIVE_ALPHA_WIN',
    status: 'SETTLED',
    contextData: {
      auditId: 'AUD-EDG-0002',
      txHash: '0x3a91f4d0e28c7b65a1d9e4f2c8b0a73e5d1f6c9a2b4e8d0c7f3a1b5e9c2d6f44',
      pair: 'SOL/USDC',
      venue: 'JUPITER_V6 -> RAYDIUM_CLMM',
      strategy: 'CROSS_VENUE_MOMENTUM_EDGE',
      amount: 210,
      executionPrice: 188.75,
      spreadPct: 0.58,
      netAlphaUsd: 229.85,
    },
  });

  appendComplianceBlock({
    timestamp: new Date(baseMs + 1000 * 60 * 12).toISOString(),
    actor: 'RISK_GOVERNOR_SENTINEL',
    action: 'RISK_GOVERNOR_CHECK',
    status: 'PASSED',
    contextData: {
      auditId: 'AUD-RSK-0003',
      pair: 'BTC/USDC',
      venue: 'INSTITUTIONAL_RISK_BUS',
      strategy: 'VAR_99_DRAWDOWN_GUARDRAIL',
      spreadPct: 0.12,
      netAlphaUsd: 0,
    },
  });

  appendComplianceBlock({
    timestamp: new Date(baseMs + 1000 * 60 * 15).toISOString(),
    actor: 'ERC4337_PAYMASTER_RELAY',
    action: 'PAYMASTER_SPONSORSHIP',
    status: 'SPONSORED',
    contextData: {
      auditId: 'AUD-PAY-0004',
      txHash: '0x9f2d6c8a4b1e0f73c5a9d2e8b4f1a6c0d3e7b9a2f5c8d1e4a7b0c3f6e9d2a588',
      pair: 'USDC/ETH_GAS',
      venue: 'BASE_MAINNET_ENTRYPOINT_V07',
      strategy: 'ZERO_GAS_USEROP_SPONSORSHIP',
      amount: 0.0042,
      executionPrice: 3286.1,
      netAlphaUsd: 13.8,
    },
  });
}

seedGenesisBlocks();

export const complianceChainRouter = express.Router();

complianceChainRouter.get('/chain', (_req: Request, res: Response) => {
  const evaluation = evaluateComplianceChain();
  res.json({
    complianceChain: evaluation.complianceChain,
    enrichedBlocks: evaluation.enrichedBlocks,
    chainIntegrityPct: evaluation.chainIntegrityPct,
    totalBlocks: evaluation.totalBlocks,
    verifiedLinks: evaluation.verifiedLinks,
    executedTradeCount: evaluation.executedTradeCount,
  });
});

complianceChainRouter.post('/verify', (_req: Request, res: Response) => {
  const evaluation = evaluateComplianceChain();
  const report: ChainVerificationReport = {
    valid: evaluation.brokenBlocks.length === 0,
    chainIntegrityPct: evaluation.chainIntegrityPct,
    totalBlocks: evaluation.totalBlocks,
    verifiedLinks: evaluation.verifiedLinks,
    executedTradeCount: evaluation.executedTradeCount,
    brokenBlocks: evaluation.brokenBlocks,
    verifiedAt: new Date().toISOString(),
    algorithm: 'HMAC-SHA256',
  };
  res.json(report);
});
