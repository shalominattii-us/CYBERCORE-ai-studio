import express, { type Request, type Response } from 'express';

export type SurfTierId =
  | 'SURF_TIER_1_PADDLE_OUT'
  | 'SURF_TIER_2_REEF_RUNNER'
  | 'SURF_TIER_3_BARREL_SURFER'
  | 'SURF_TIER_4_APEX_SWELL'
  | 'SURF_TIER_5_SOVEREIGN_TSUNAMI';

export type WaveDirection = 'LONG' | 'SHORT';
export type WaveGateOutcome = 'POSITIVE_EV_EXECUTED' | 'MOMENTUM_REJECTED';

export interface SurfTierConfig {
  id: SurfTierId;
  tierNumber: 1 | 2 | 3 | 4 | 5;
  name: string;
  clearance: string;
  trancheUsd: number;
  maxWaveLegs: number;
  escrowReserveRatio: number; // e.g. 0.12 for 12%
  minStreak: number;
  description: string;
}

export interface WaveLegExecution {
  id: string;
  timestamp: string;
  pair: string;
  direction: WaveDirection;
  legSizeUsd: number;
  momentumScore: number; // 0 - 100
  expectedValueBps: number;
  gateOutcome: WaveGateOutcome;
  realizedPnlUsd: number;
  escrowLockedUsd: number;
  tierAtExecution: SurfTierId;
  streakAfter: number;
}

export interface VesselTreasuryBalances {
  deployableTrancheUsd: number;
  escrowReserveUsd: number;
  escrowReserveRatio: number;
  lockedVaultProfitsUsd: number;
  cumulativeWavePnlUsd: number;
  unbondedOnChainBalanceUsd: number; // Strictly separated $0.00
  lastRebalancedAt: string;
}

export interface BadgeProgress {
  currentBadge: string;
  currentTierNumber: number;
  nextBadge: string | null;
  nextTierNumber: number | null;
  currentStreak: number;
  nextTierMinStreak: number | null;
  progressPct: number;
}

export interface WaveSurferStatusResponse {
  ok: boolean;
  engineVersion: string;
  activeTier: SurfTierConfig;
  clearance: string;
  currentStreak: number;
  bestStreak: number;
  activeWaveLegs: number;
  maxWaveLegs: number;
  treasury: VesselTreasuryBalances;
  badgeProgress: BadgeProgress;
  tiers: SurfTierConfig[];
  history: WaveLegExecution[];
}

export const SURF_TIERS: SurfTierConfig[] = [
  {
    id: 'SURF_TIER_1_PADDLE_OUT',
    tierNumber: 1,
    name: 'Tier 1: Paddle Out',
    clearance: 'PADDLE_OUT_INITIATE',
    trancheUsd: 250,
    maxWaveLegs: 3,
    escrowReserveRatio: 0.2,
    minStreak: 0,
    description: 'Entry wave-calibration tranche with conservative 20% escrow buffer.',
  },
  {
    id: 'SURF_TIER_2_REEF_RUNNER',
    tierNumber: 2,
    name: 'Tier 2: Reef Runner',
    clearance: 'REEF_RUNNER_SCOUT',
    trancheUsd: 500,
    maxWaveLegs: 5,
    escrowReserveRatio: 0.15,
    minStreak: 3,
    description: 'Intermediate momentum tranche with 5 concurrent wave legs and 15% escrow.',
  },
  {
    id: 'SURF_TIER_3_BARREL_SURFER',
    tierNumber: 3,
    name: 'Tier 3: Barrel Surfer',
    clearance: 'BARREL_SURFER_VANGUARD',
    trancheUsd: 1000,
    maxWaveLegs: 8,
    escrowReserveRatio: 0.12,
    minStreak: 5,
    description: 'Vanguard $1,000 tranche, 8 max wave legs, and 12% locked Vessel escrow reserve.',
  },
  {
    id: 'SURF_TIER_4_APEX_SWELL',
    tierNumber: 4,
    name: 'Tier 4: Apex Swell',
    clearance: 'APEX_SWELL_COMMANDER',
    trancheUsd: 2500,
    maxWaveLegs: 12,
    escrowReserveRatio: 0.1,
    minStreak: 10,
    description: 'High-conviction swell allocation with 12 legs and 10% dynamic escrow.',
  },
  {
    id: 'SURF_TIER_5_SOVEREIGN_TSUNAMI',
    tierNumber: 5,
    name: 'Tier 5: Sovereign Tsunami',
    clearance: 'SOVEREIGN_TSUNAMI_ARCHITECT',
    trancheUsd: 5000,
    maxWaveLegs: 20,
    escrowReserveRatio: 0.08,
    minStreak: 18,
    description: 'Apex institutional Vessel Treasury tranche with 20 legs and 8% sovereign reserve.',
  },
];

interface EngineState {
  currentStreak: number;
  bestStreak: number;
  activeWaveLegs: number;
  deployableTrancheUsd: number;
  escrowReserveUsd: number;
  lockedVaultProfitsUsd: number;
  cumulativeWavePnlUsd: number;
  readonly unbondedOnChainBalanceUsd: 0;
  lastRebalancedAt: string;
  history: WaveLegExecution[];
}

function resolveTierForStreak(streak: number): SurfTierConfig {
  let resolved = SURF_TIERS[0];
  for (const tier of SURF_TIERS) {
    if (streak >= tier.minStreak) {
      resolved = tier;
    }
  }
  return resolved;
}

function buildBadgeProgress(activeTier: SurfTierConfig, streak: number): BadgeProgress {
  const nextTier = SURF_TIERS.find((t) => t.tierNumber === activeTier.tierNumber + 1) ?? null;
  if (!nextTier) {
    return {
      currentBadge: activeTier.clearance,
      currentTierNumber: activeTier.tierNumber,
      nextBadge: null,
      nextTierNumber: null,
      currentStreak: streak,
      nextTierMinStreak: null,
      progressPct: 100,
    };
  }

  const span = Math.max(1, nextTier.minStreak - activeTier.minStreak);
  const gained = Math.max(0, streak - activeTier.minStreak);
  const progressPct = Math.min(100, Math.round((gained / span) * 100));

  return {
    currentBadge: activeTier.clearance,
    currentTierNumber: activeTier.tierNumber,
    nextBadge: nextTier.clearance,
    nextTierNumber: nextTier.tierNumber,
    currentStreak: streak,
    nextTierMinStreak: nextTier.minStreak,
    progressPct,
  };
}

const nowIso = new Date().toISOString();

const state: EngineState = {
  currentStreak: 0,
  bestStreak: 0,
  activeWaveLegs: 0,
  deployableTrancheUsd: 0,
  escrowReserveUsd: 0,
  lockedVaultProfitsUsd: 0,
  cumulativeWavePnlUsd: 0,
  unbondedOnChainBalanceUsd: 0,
  lastRebalancedAt: nowIso,
  history: [
    {
      id: 'WAVE-9043',
      timestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      pair: 'SOL/USDC',
      direction: 'LONG',
      legSizeUsd: 125,
      momentumScore: 86,
      expectedValueBps: 42,
      gateOutcome: 'POSITIVE_EV_EXECUTED',
      realizedPnlUsd: 26.4,
      escrowLockedUsd: 15,
      tierAtExecution: 'SURF_TIER_3_BARREL_SURFER',
      streakAfter: 5,
    },
    {
      id: 'WAVE-9042',
      timestamp: new Date(Date.now() - 1000 * 60 * 39).toISOString(),
      pair: 'ETH/USDC',
      direction: 'LONG',
      legSizeUsd: 125,
      momentumScore: 79,
      expectedValueBps: 31,
      gateOutcome: 'POSITIVE_EV_EXECUTED',
      realizedPnlUsd: 18.9,
      escrowLockedUsd: 15,
      tierAtExecution: 'SURF_TIER_2_REEF_RUNNER',
      streakAfter: 4,
    },
    {
      id: 'WAVE-9041',
      timestamp: new Date(Date.now() - 1000 * 60 * 72).toISOString(),
      pair: 'BTC/USDC',
      direction: 'SHORT',
      legSizeUsd: 100,
      momentumScore: 82,
      expectedValueBps: 28,
      gateOutcome: 'POSITIVE_EV_EXECUTED',
      realizedPnlUsd: 13.0,
      escrowLockedUsd: 12,
      tierAtExecution: 'SURF_TIER_2_REEF_RUNNER',
      streakAfter: 3,
    },
  ],
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getStatusPayload(): WaveSurferStatusResponse {
  const activeTier = resolveTierForStreak(state.currentStreak);
  return {
    ok: true,
    engineVersion: 'wave-surfer-vessel-v3.2',
    activeTier,
    clearance: activeTier.clearance,
    currentStreak: state.currentStreak,
    bestStreak: state.bestStreak,
    activeWaveLegs: state.activeWaveLegs,
    maxWaveLegs: activeTier.maxWaveLegs,
    treasury: {
      deployableTrancheUsd: round2(state.deployableTrancheUsd),
      escrowReserveUsd: round2(state.escrowReserveUsd),
      escrowReserveRatio: activeTier.escrowReserveRatio,
      lockedVaultProfitsUsd: round2(state.lockedVaultProfitsUsd),
      cumulativeWavePnlUsd: round2(state.cumulativeWavePnlUsd),
      unbondedOnChainBalanceUsd: state.unbondedOnChainBalanceUsd,
      lastRebalancedAt: state.lastRebalancedAt,
    },
    badgeProgress: buildBadgeProgress(activeTier, state.currentStreak),
    tiers: SURF_TIERS,
    history: state.history,
  };
}

export const waveSurferTreasuryRouter = express.Router();

waveSurferTreasuryRouter.get('/status', (_req: Request, res: Response) => {
  res.json(getStatusPayload());
});

waveSurferTreasuryRouter.post('/wave/ride', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    pair?: string;
    direction?: string;
    legSizeUsd?: number;
  };

  const pair = typeof body.pair === 'string' && body.pair.trim().length > 0
    ? body.pair.trim().toUpperCase()
    : 'SOL/USDC';

  const direction: WaveDirection = body.direction === 'SHORT' ? 'SHORT' : 'LONG';

  const currentTier = resolveTierForStreak(state.currentStreak);
  const rawLegSize = typeof body.legSizeUsd === 'number' && Number.isFinite(body.legSizeUsd)
    ? body.legSizeUsd
    : round2(currentTier.trancheUsd / currentTier.maxWaveLegs);

  const legSizeUsd = round2(Math.max(25, Math.min(rawLegSize, currentTier.trancheUsd)));

  // Deterministic-leaning positive-EV & momentum gate evaluation
  const seed = (Date.now() + state.history.length * 37 + pair.charCodeAt(0) * 13) % 100;
  const momentumScore = Math.min(98, Math.max(48, 62 + (seed % 36)));
  const expectedValueBps = momentumScore >= 65 ? 18 + (seed % 34) : -12;
  const passedGate = momentumScore >= 65 && expectedValueBps > 0;

  const previousTier = currentTier;
  let realizedPnlUsd = 0;
  let escrowLockedUsd = 0;
  let gateOutcome: WaveGateOutcome = 'MOMENTUM_REJECTED';

  if (passedGate) {
    gateOutcome = 'POSITIVE_EV_EXECUTED';
    const returnRate = expectedValueBps / 1000; // simulated wave capture
    realizedPnlUsd = round2(legSizeUsd * returnRate);
    escrowLockedUsd = round2(legSizeUsd * currentTier.escrowReserveRatio);

    state.currentStreak += 1;
    if (state.currentStreak > state.bestStreak) {
      state.bestStreak = state.currentStreak;
    }

    state.cumulativeWavePnlUsd = round2(state.cumulativeWavePnlUsd + realizedPnlUsd);
    state.escrowReserveUsd = round2(state.escrowReserveUsd + escrowLockedUsd * 0.25);
    state.activeWaveLegs = Math.min(currentTier.maxWaveLegs, state.activeWaveLegs + 1);

    const promotedTier = resolveTierForStreak(state.currentStreak);
    if (promotedTier.tierNumber > previousTier.tierNumber) {
      state.deployableTrancheUsd = promotedTier.trancheUsd;
      state.escrowReserveUsd = round2(promotedTier.trancheUsd * promotedTier.escrowReserveRatio);
    }
  } else {
    state.currentStreak = Math.max(0, state.currentStreak - 1);
  }

  const nextTier = resolveTierForStreak(state.currentStreak);
  const execution: WaveLegExecution = {
    id: `WAVE-${9044 + state.history.length}`,
    timestamp: new Date().toISOString(),
    pair,
    direction,
    legSizeUsd,
    momentumScore,
    expectedValueBps,
    gateOutcome,
    realizedPnlUsd,
    escrowLockedUsd,
    tierAtExecution: nextTier.id,
    streakAfter: state.currentStreak,
  };

  state.history = [execution, ...state.history].slice(0, 25);

  res.json({
    ...getStatusPayload(),
    execution,
    promoted: nextTier.tierNumber > previousTier.tierNumber,
  });
});

waveSurferTreasuryRouter.post('/treasury/rebalance', (_req: Request, res: Response) => {
  const activeTier = resolveTierForStreak(state.currentStreak);
  const targetEscrowUsd = round2(activeTier.trancheUsd * activeTier.escrowReserveRatio);
  const unlockedPnl = Math.max(0, round2(state.cumulativeWavePnlUsd - state.lockedVaultProfitsUsd));

  state.lockedVaultProfitsUsd = round2(state.lockedVaultProfitsUsd + unlockedPnl);
  state.deployableTrancheUsd = activeTier.trancheUsd;
  state.escrowReserveUsd = targetEscrowUsd;
  state.activeWaveLegs = 0;
  state.lastRebalancedAt = new Date().toISOString();

  res.json({
    ...getStatusPayload(),
    rebalanceSummary: {
      lockedProfitDeltaUsd: unlockedPnl,
      targetEscrowUsd,
      escrowReserveRatio: activeTier.escrowReserveRatio,
      resetActiveWaveLegs: true,
    },
  });
});

export default waveSurferTreasuryRouter;
