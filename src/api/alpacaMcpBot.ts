import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Strict safety invariant: live brokerage execution is permanently disabled.
 * All requests are locked to Alpaca Paper Trading (https://paper-api.alpaca.markets).
 */
export const PAPER_TRADING_ONLY = true as const;
const ALPACA_PAPER_BASE_URL = 'https://paper-api.alpaca.markets';
const TRADES_LOG_PATH = path.resolve(process.cwd(), 'trades.log');

export type TradeSignal = 'BUY' | 'SELL' | 'HOLD';

export interface StrategyConfig {
  symbol: string;
  fastSma: number;
  slowSma: number;
  orderQty: number;
  schedule: string;
  autoScheduleEnabled: boolean;
  paperOnly: true;
}

export interface PaperPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
}

export interface DailyBarPoint {
  date: string;
  close: number;
  smaFast: number | null;
  smaSlow: number | null;
  sma20: number | null;
  sma50: number | null;
}

export interface TradeLogEntry {
  timestamp: string;
  symbol: string;
  signal: TradeSignal;
  qty: number;
  price: number;
  fastSma: number;
  slowSma: number;
  reason: string;
  mode: 'PAPER_API' | 'PAPER_SIM';
  rawLine: string;
}

interface PaperAccountState {
  accountId: string;
  status: string;
  currency: string;
  cash: number;
  equity: number;
  buyingPower: number;
  paperOnly: true;
  mode: 'live-paper-api' | 'simulated-paper';
  positions: PaperPosition[];
}

const SYMBOL_BASE_PRICES: Record<string, number> = {
  AAPL: 228.4,
  MSFT: 424.15,
  NVDA: 138.6,
  SPY: 594.2,
  QQQ: 508.75,
  TSLA: 312.5,
  AMZN: 206.8,
  META: 589.3,
};

let strategyConfig: StrategyConfig = {
  symbol: 'AAPL',
  fastSma: 20,
  slowSma: 50,
  orderQty: 10,
  schedule: '15m before market close (15:45 ET)',
  autoScheduleEnabled: true,
  paperOnly: PAPER_TRADING_ONLY,
};

const accountState: PaperAccountState = {
  accountId: 'PA3-CYBERCORE-8842',
  status: 'ACTIVE',
  currency: 'USD',
  cash: 100000.0,
  equity: 100000.0,
  buyingPower: 200000.0,
  paperOnly: PAPER_TRADING_ONLY,
  mode: 'simulated-paper',
  positions: [],
};

let lastSignal: TradeSignal = 'HOLD';
let lastEvaluationAt: string | null = null;
const memoryLogs: TradeLogEntry[] = [];

function hashSymbol(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i += 1) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function generateTradingDates(count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date();
  cursor.setHours(16, 0, 0, 0);
  while (dates.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates.reverse();
}

function computeSma(values: number[], window: number, index: number): number | null {
  if (index + 1 < window) return null;
  let sum = 0;
  for (let i = index - window + 1; i <= index; i += 1) {
    sum += values[i];
  }
  return Number((sum / window).toFixed(2));
}

function buildDailySeries(symbol: string, fastWindow: number, slowWindow: number): DailyBarPoint[] {
  const normalized = symbol.toUpperCase();
  const basePrice = SYMBOL_BASE_PRICES[normalized] ?? 150 + (hashSymbol(normalized) % 250);
  const seed = hashSymbol(normalized);
  const totalBars = Math.max(120, slowWindow + 65);
  const dates = generateTradingDates(totalBars);

  const closes: number[] = [];
  let price = basePrice * 0.91;

  for (let i = 0; i < totalBars; i += 1) {
    const phase = (i + (seed % 17)) / 9.5;
    const macroWave = Math.sin(phase) * 0.0085 + Math.cos(i / 21) * 0.0045;
    const microNoise = Math.sin((i + 1) * 1.7 + (seed % 31)) * 0.004;
    // Slight upward drift in the last 25 bars to showcase realistic crossover behavior
    const regimeDrift = i > totalBars - 28 ? 0.0032 : -0.0004;
    price = Math.max(5, price * (1 + macroWave + microNoise + regimeDrift));
    closes.push(Number(price.toFixed(2)));
  }

  const fullSeries: DailyBarPoint[] = closes.map((close, idx) => {
    const smaFast = computeSma(closes, fastWindow, idx);
    const smaSlow = computeSma(closes, slowWindow, idx);
    return {
      date: dates[idx],
      close,
      smaFast,
      smaSlow,
      sma20: computeSma(closes, 20, idx),
      sma50: computeSma(closes, 50, idx),
    };
  });

  return fullSeries.slice(-60);
}

function syncAccountValuation(symbol: string, latestPrice: number): void {
  let positionsValue = 0;
  accountState.positions = accountState.positions.map((pos) => {
    const currentPrice = pos.symbol === symbol ? latestPrice : pos.currentPrice;
    const marketValue = Number((pos.qty * currentPrice).toFixed(2));
    const costBasis = pos.qty * pos.avgEntryPrice;
    const unrealizedPl = Number((marketValue - costBasis).toFixed(2));
    const unrealizedPlPct = costBasis > 0 ? Number(((unrealizedPl / costBasis) * 100).toFixed(2)) : 0;
    positionsValue += marketValue;
    return {
      ...pos,
      currentPrice,
      marketValue,
      unrealizedPl,
      unrealizedPlPct,
    };
  });

  accountState.equity = Number((accountState.cash + positionsValue).toFixed(2));
  accountState.buyingPower = Number((accountState.cash * 2).toFixed(2));
}

function computeCurrentSignal(series: DailyBarPoint[], symbol: string): {
  signal: TradeSignal;
  latestClose: number;
  latestFast: number;
  latestSlow: number;
  hasPosition: boolean;
  reason: string;
} {
  const latest = series[series.length - 1];
  const latestClose = latest?.close ?? 0;
  const latestFast = latest?.smaFast ?? latestClose;
  const latestSlow = latest?.smaSlow ?? latestClose;
  const existingPos = accountState.positions.find((p) => p.symbol === symbol && p.qty > 0);
  const hasPosition = Boolean(existingPos);

  if (latestFast > latestSlow && !hasPosition) {
    return {
      signal: 'BUY',
      latestClose,
      latestFast,
      latestSlow,
      hasPosition,
      reason: `SMA${strategyConfig.fastSma} (${latestFast.toFixed(2)}) > SMA${strategyConfig.slowSma} (${latestSlow.toFixed(2)}) with no open position`,
    };
  }

  if (latestFast < latestSlow && hasPosition) {
    return {
      signal: 'SELL',
      latestClose,
      latestFast,
      latestSlow,
      hasPosition,
      reason: `SMA${strategyConfig.fastSma} (${latestFast.toFixed(2)}) < SMA${strategyConfig.slowSma} (${latestSlow.toFixed(2)}) while holding ${existingPos?.qty ?? 0} shares`,
    };
  }

  const regime = latestFast >= latestSlow ? 'bullish regime (already long)' : 'bearish regime (flat)';
  return {
    signal: 'HOLD',
    latestClose,
    latestFast,
    latestSlow,
    hasPosition,
    reason: `SMA${strategyConfig.fastSma} (${latestFast.toFixed(2)}) vs SMA${strategyConfig.slowSma} (${latestSlow.toFixed(2)}) — ${regime}`,
  };
}

function buildMcpConfigSnippet() {
  return {
    mcpServers: {
      alpaca: {
        command: 'uvx',
        args: ['alpaca-mcp-server', 'serve'],
        env: {
          ALPACA_API_KEY: 'PK_YOUR_PAPER_API_KEY',
          ALPACA_SECRET_KEY: 'YOUR_PAPER_SECRET_KEY',
          ALPACA_PAPER_TRADE: 'True',
        },
      },
    },
  };
}

function buildStarterPrompts(config: StrategyConfig) {
  return [
    {
      id: 'verify-paper',
      title: '1. Verify Paper Account Connection',
      prompt:
        'Using the Alpaca MCP server, confirm my account is strictly in PAPER TRADING mode, then display my current cash balance, buying power, and open positions.',
    },
    {
      id: 'sma-crossover-check',
      title: '2. Run 20/50 SMA Pre-Close Crossover Check',
      prompt: `15 minutes before US market close (15:45 ET), fetch the last 60 daily bars for ${config.symbol} via Alpaca MCP. Compute the ${config.fastSma}-day SMA and ${config.slowSma}-day SMA. If SMA${config.fastSma} > SMA${config.slowSma} and I hold no position, submit a PAPER market BUY for ${config.orderQty} shares. If SMA${config.fastSma} < SMA${config.slowSma} and I hold shares, SELL the entire position. Otherwise HOLD. Append every decision with timestamp, prices, and SMA values to trades.log.`,
    },
    {
      id: 'audit-trades-log',
      title: '3. Audit trades.log Decisions',
      prompt:
        'Read trades.log and summarize the last 10 BUY/SELL/HOLD decisions, noting whether any order violated the PAPER_TRADING_ONLY guardrail.',
    },
  ];
}

function parseLogLine(line: string): TradeLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Format: [ISO_TIMESTAMP] [PAPER_SIM] SYMBOL=AAPL SIGNAL=BUY QTY=10 PRICE=228.40 SMA_FAST=226.10 SMA_SLOW=221.50 REASON=...
  const match = trimmed.match(
    /^\[([^\]]+)\]\s+\[(PAPER_API|PAPER_SIM)\]\s+SYMBOL=(\S+)\s+SIGNAL=(BUY|SELL|HOLD)\s+QTY=(\d+)\s+PRICE=([\d.]+)\s+SMA_FAST=([\d.]+)\s+SMA_SLOW=([\d.]+)\s+REASON=(.*)$/,
  );
  if (!match) {
    return {
      timestamp: new Date().toISOString(),
      symbol: strategyConfig.symbol,
      signal: 'HOLD',
      qty: 0,
      price: 0,
      fastSma: 0,
      slowSma: 0,
      reason: trimmed,
      mode: 'PAPER_SIM',
      rawLine: trimmed,
    };
  }
  return {
    timestamp: match[1],
    mode: match[2] as 'PAPER_API' | 'PAPER_SIM',
    symbol: match[3],
    signal: match[4] as TradeSignal,
    qty: Number(match[5]),
    price: Number(match[6]),
    fastSma: Number(match[7]),
    slowSma: Number(match[8]),
    reason: match[9],
    rawLine: trimmed,
  };
}

function appendTradeLog(entry: TradeLogEntry): { persistedToFile: boolean; filePath: string } {
  memoryLogs.unshift(entry);
  if (memoryLogs.length > 200) {
    memoryLogs.length = 200;
  }

  try {
    fs.appendFileSync(TRADES_LOG_PATH, `${entry.rawLine}\n`, 'utf8');
    return { persistedToFile: true, filePath: TRADES_LOG_PATH };
  } catch {
    return { persistedToFile: false, filePath: TRADES_LOG_PATH };
  }
}

function readAllTradeLogs(): { entries: TradeLogEntry[]; fileExists: boolean; filePath: string } {
  const fileEntries: TradeLogEntry[] = [];
  let fileExists = false;

  try {
    if (fs.existsSync(TRADES_LOG_PATH)) {
      fileExists = true;
      const content = fs.readFileSync(TRADES_LOG_PATH, 'utf8');
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      for (const line of lines) {
        const parsed = parseLogLine(line);
        if (parsed) fileEntries.push(parsed);
      }
    }
  } catch {
    // Fall back to in-memory entries safely
  }

  // Merge file entries (newest first) with any in-memory entries not yet in file
  const seen = new Set<string>();
  const merged: TradeLogEntry[] = [];

  for (const entry of [...fileEntries].reverse()) {
    if (!seen.has(entry.rawLine)) {
      seen.add(entry.rawLine);
      merged.push(entry);
    }
  }
  for (const entry of memoryLogs) {
    if (!seen.has(entry.rawLine)) {
      seen.add(entry.rawLine);
      merged.push(entry);
    }
  }

  return {
    entries: merged.slice(0, 100),
    fileExists,
    filePath: TRADES_LOG_PATH,
  };
}

export const alpacaMcpBotRouter = express.Router();

/**
 * GET /api/alpaca-bot/status
 */
alpacaMcpBotRouter.get('/status', (_req: Request, res: Response) => {
  const series = buildDailySeries(strategyConfig.symbol, strategyConfig.fastSma, strategyConfig.slowSma);
  const latestClose = series[series.length - 1]?.close ?? 0;
  syncAccountValuation(strategyConfig.symbol, latestClose);
  const evaluation = computeCurrentSignal(series, strategyConfig.symbol);
  lastSignal = evaluation.signal;

  res.json({
    paperOnly: PAPER_TRADING_ONLY,
    endpoint: `${ALPACA_PAPER_BASE_URL}/v2/account`,
    account: accountState,
    config: strategyConfig,
    series,
    lastSignal,
    signalSummary: evaluation,
    lastEvaluationAt,
    mcpConfig: buildMcpConfigSnippet(),
    starterPrompts: buildStarterPrompts(strategyConfig),
  });
});

/**
 * POST /api/alpaca-bot/test-connection
 */
alpacaMcpBotRouter.post('/test-connection', async (_req: Request, res: Response) => {
  const startedAt = Date.now();
  const apiKey = process.env.ALPACA_API_KEY?.trim();
  const secretKey = process.env.ALPACA_SECRET_KEY?.trim();

  if (apiKey && secretKey) {
    try {
      const response = await fetch(`${ALPACA_PAPER_BASE_URL}/v2/account`, {
        method: 'GET',
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': secretKey,
          Accept: 'application/json',
        },
      });
      const latencyMs = Date.now() - startedAt;

      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        accountState.mode = 'live-paper-api';
        accountState.accountId = String(data.account_number ?? data.id ?? accountState.accountId);
        accountState.status = String(data.status ?? 'ACTIVE');
        accountState.cash = Number(data.cash ?? accountState.cash);
        accountState.equity = Number(data.equity ?? accountState.equity);
        accountState.buyingPower = Number(data.buying_power ?? accountState.buyingPower);

        res.json({
          connected: true,
          paperOnly: PAPER_TRADING_ONLY,
          mode: 'live-paper-api',
          endpoint: `${ALPACA_PAPER_BASE_URL}/v2/account`,
          latencyMs,
          account: accountState,
          message: 'Connected to Alpaca Paper Trading API v2 (live execution locked out).',
        });
        return;
      }

      const errorText = await response.text();
      res.status(200).json({
        connected: false,
        paperOnly: PAPER_TRADING_ONLY,
        mode: 'live-paper-api',
        endpoint: `${ALPACA_PAPER_BASE_URL}/v2/account`,
        latencyMs,
        httpStatus: response.status,
        message: `Alpaca Paper API returned HTTP ${response.status}: ${errorText.slice(0, 160)}`,
      });
      return;
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const errMsg = err instanceof Error ? err.message : 'Unknown network error';
      res.status(200).json({
        connected: false,
        paperOnly: PAPER_TRADING_ONLY,
        mode: 'live-paper-api',
        endpoint: `${ALPACA_PAPER_BASE_URL}/v2/account`,
        latencyMs,
        message: `Failed to reach Alpaca Paper API: ${errMsg}`,
      });
      return;
    }
  }

  // Structured simulated paper sandbox fallback when env keys are not yet configured
  accountState.mode = 'simulated-paper';
  const latencyMs = Math.max(12, Date.now() - startedAt + 18);
  res.json({
    connected: true,
    paperOnly: PAPER_TRADING_ONLY,
    mode: 'simulated-paper',
    endpoint: `${ALPACA_PAPER_BASE_URL}/v2/account`,
    latencyMs,
    account: accountState,
    message:
      'ALPACA_API_KEY / ALPACA_SECRET_KEY not detected in environment. Running in deterministic Paper Trading Sandbox mode.',
  });
});

/**
 * POST /api/alpaca-bot/config
 */
alpacaMcpBotRouter.post('/config', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<{
    symbol: string;
    fastSma: number;
    slowSma: number;
    orderQty: number;
    autoScheduleEnabled: boolean;
  }>;

  const nextSymbol =
    typeof body.symbol === 'string' && body.symbol.trim().length > 0
      ? body.symbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 10)
      : strategyConfig.symbol;

  const nextFastSma =
    typeof body.fastSma === 'number' && Number.isFinite(body.fastSma)
      ? Math.max(2, Math.min(100, Math.round(body.fastSma)))
      : strategyConfig.fastSma;

  const nextSlowSma =
    typeof body.slowSma === 'number' && Number.isFinite(body.slowSma)
      ? Math.max(nextFastSma + 1, Math.min(200, Math.round(body.slowSma)))
      : Math.max(nextFastSma + 1, strategyConfig.slowSma);

  const nextOrderQty =
    typeof body.orderQty === 'number' && Number.isFinite(body.orderQty)
      ? Math.max(1, Math.min(10000, Math.round(body.orderQty)))
      : strategyConfig.orderQty;

  const nextAutoSchedule =
    typeof body.autoScheduleEnabled === 'boolean'
      ? body.autoScheduleEnabled
      : strategyConfig.autoScheduleEnabled;

  strategyConfig = {
    ...strategyConfig,
    symbol: nextSymbol,
    fastSma: nextFastSma,
    slowSma: nextSlowSma,
    orderQty: nextOrderQty,
    autoScheduleEnabled: nextAutoSchedule,
    paperOnly: PAPER_TRADING_ONLY,
  };

  const series = buildDailySeries(strategyConfig.symbol, strategyConfig.fastSma, strategyConfig.slowSma);
  const latestClose = series[series.length - 1]?.close ?? 0;
  syncAccountValuation(strategyConfig.symbol, latestClose);
  const evaluation = computeCurrentSignal(series, strategyConfig.symbol);
  lastSignal = evaluation.signal;

  res.json({
    paperOnly: PAPER_TRADING_ONLY,
    config: strategyConfig,
    series,
    lastSignal,
    signalSummary: evaluation,
    starterPrompts: buildStarterPrompts(strategyConfig),
  });
});

/**
 * POST /api/alpaca-bot/evaluate
 */
alpacaMcpBotRouter.post('/evaluate', (_req: Request, res: Response) => {
  const series = buildDailySeries(strategyConfig.symbol, strategyConfig.fastSma, strategyConfig.slowSma);
  const latestClose = series[series.length - 1]?.close ?? 0;
  syncAccountValuation(strategyConfig.symbol, latestClose);

  const evaluation = computeCurrentSignal(series, strategyConfig.symbol);
  const timestamp = new Date().toISOString();
  let executedQty = 0;

  if (evaluation.signal === 'BUY') {
    const orderCost = Number((strategyConfig.orderQty * evaluation.latestClose).toFixed(2));
    if (accountState.cash >= orderCost) {
      accountState.cash = Number((accountState.cash - orderCost).toFixed(2));
      accountState.positions.push({
        symbol: strategyConfig.symbol,
        qty: strategyConfig.orderQty,
        avgEntryPrice: evaluation.latestClose,
        currentPrice: evaluation.latestClose,
        marketValue: orderCost,
        unrealizedPl: 0,
        unrealizedPlPct: 0,
      });
      executedQty = strategyConfig.orderQty;
    }
  } else if (evaluation.signal === 'SELL') {
    const idx = accountState.positions.findIndex((p) => p.symbol === strategyConfig.symbol);
    if (idx !== -1) {
      const pos = accountState.positions[idx];
      const proceeds = Number((pos.qty * evaluation.latestClose).toFixed(2));
      accountState.cash = Number((accountState.cash + proceeds).toFixed(2));
      executedQty = pos.qty;
      accountState.positions.splice(idx, 1);
    }
  }

  syncAccountValuation(strategyConfig.symbol, evaluation.latestClose);
  lastSignal = evaluation.signal;
  lastEvaluationAt = timestamp;

  const modeTag: 'PAPER_API' | 'PAPER_SIM' =
    accountState.mode === 'live-paper-api' ? 'PAPER_API' : 'PAPER_SIM';

  const rawLine = `[${timestamp}] [${modeTag}] SYMBOL=${strategyConfig.symbol} SIGNAL=${evaluation.signal} QTY=${executedQty} PRICE=${evaluation.latestClose.toFixed(2)} SMA_FAST=${evaluation.latestFast.toFixed(2)} SMA_SLOW=${evaluation.latestSlow.toFixed(2)} REASON=${evaluation.reason}`;

  const logEntry: TradeLogEntry = {
    timestamp,
    symbol: strategyConfig.symbol,
    signal: evaluation.signal,
    qty: executedQty,
    price: evaluation.latestClose,
    fastSma: evaluation.latestFast,
    slowSma: evaluation.latestSlow,
    reason: evaluation.reason,
    mode: modeTag,
    rawLine,
  };

  const persistence = appendTradeLog(logEntry);

  res.json({
    paperOnly: PAPER_TRADING_ONLY,
    decision: {
      signal: evaluation.signal,
      symbol: strategyConfig.symbol,
      qty: executedQty,
      price: evaluation.latestClose,
      fastSma: evaluation.latestFast,
      slowSma: evaluation.latestSlow,
      reason: evaluation.reason,
      timestamp,
    },
    logEntry,
    persistence,
    account: accountState,
    series,
    lastSignal,
    lastEvaluationAt,
  });
});

/**
 * GET /api/alpaca-bot/logs
 */
alpacaMcpBotRouter.get('/logs', (_req: Request, res: Response) => {
  const result = readAllTradeLogs();
  res.json({
    paperOnly: PAPER_TRADING_ONLY,
    fileExists: result.fileExists,
    filePath: result.filePath,
    count: result.entries.length,
    entries: result.entries,
  });
});
