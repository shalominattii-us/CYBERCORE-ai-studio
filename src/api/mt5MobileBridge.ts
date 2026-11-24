import express, { type Request, type Response } from 'express';

export type Mt5ModuleType = 'EA' | 'INDICATOR';

export interface Mt5ModuleConfig {
  lotSize: number;
  stopLossPips: number;
  takeProfitPips: number;
  magicNumber: number;
  demoOnly: boolean;
}

export interface Mt5Module {
  id: string;
  filename: string;
  type: Mt5ModuleType;
  symbol: string;
  timeframe: string;
  enabled: boolean;
  installPath: string;
  deployedAt: string;
  config: Mt5ModuleConfig;
  lastSignal?: string;
}

export interface BridgeLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'RECOVERY' | 'EXEC';
  source: string;
  message: string;
}

export interface SetupGuideStep {
  step: number;
  id: string;
  title: string;
  category: 'WINLATOR' | 'WINE' | 'MT5' | 'ANDROID_OS' | 'MQL5_FILES';
  summary: string;
  details: string[];
  pathHint?: string;
  critical?: boolean;
}

interface ToggleRequestBody {
  id?: string;
  filename?: string;
  enabled?: boolean;
}

interface DeployRequestBody {
  filename?: string;
  type?: Mt5ModuleType;
  symbol?: string;
  timeframe?: string;
  lotSize?: number;
  stopLossPips?: number;
  takeProfitPips?: number;
  magicNumber?: number;
  demoOnly?: boolean;
}

const startedAtMs = Date.now() - 4 * 3600 * 1000 - 18 * 60 * 1000;
let currentTerminalPid = 4192;
let recoveryCount = 0;
let lastRecoveryIso: string | null = null;

const installedModules: Mt5Module[] = [
  {
    id: 'ea-ofi-scalper',
    filename: 'Aegentix_OFI_Scalper.ex5',
    type: 'EA',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    enabled: true,
    installPath: 'C:\\Program Files\\MetaTrader 5\\MQL5\\Experts\\Aegentix_OFI_Scalper.ex5',
    deployedAt: '2026-11-23T14:10:00.000Z',
    config: {
      lotSize: 0.05,
      stopLossPips: 18,
      takeProfitPips: 36,
      magicNumber: 880101,
      demoOnly: true,
    },
    lastSignal: 'BUY_IMBALANCE +0.74σ (Demo)',
  },
  {
    id: 'ea-gold-momentum',
    filename: 'Gold_Momentum_Guard.ex5',
    type: 'EA',
    symbol: 'XAUUSD',
    timeframe: 'M5',
    enabled: true,
    installPath: 'C:\\Program Files\\MetaTrader 5\\MQL5\\Experts\\Gold_Momentum_Guard.ex5',
    deployedAt: '2026-11-23T15:25:00.000Z',
    config: {
      lotSize: 0.02,
      stopLossPips: 25,
      takeProfitPips: 50,
      magicNumber: 880102,
      demoOnly: true,
    },
    lastSignal: 'TRAILING_STOP_ARMED @ 2684.40',
  },
  {
    id: 'ea-sma-trend',
    filename: 'SMA_Trend_Follower.ex5',
    type: 'EA',
    symbol: 'EURUSD',
    timeframe: 'M15',
    enabled: false,
    installPath: 'C:\\Program Files\\MetaTrader 5\\MQL5\\Experts\\SMA_Trend_Follower.ex5',
    deployedAt: '2026-11-23T16:00:00.000Z',
    config: {
      lotSize: 0.1,
      stopLossPips: 30,
      takeProfitPips: 60,
      magicNumber: 880103,
      demoOnly: true,
    },
    lastSignal: 'STANDBY (Disabled)',
  },
  {
    id: 'ind-orderflow-delta',
    filename: 'OrderFlow_Delta_Ind.ex5',
    type: 'INDICATOR',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    enabled: true,
    installPath: 'C:\\Program Files\\MetaTrader 5\\MQL5\\Indicators\\OrderFlow_Delta_Ind.ex5',
    deployedAt: '2026-11-23T14:05:00.000Z',
    config: {
      lotSize: 0,
      stopLossPips: 0,
      takeProfitPips: 0,
      magicNumber: 0,
      demoOnly: true,
    },
    lastSignal: 'CUM_DELTA +1,420 ticks',
  },
  {
    id: 'ind-rsi-divergence',
    filename: 'RSI_Divergence_Pro.ex5',
    type: 'INDICATOR',
    symbol: 'EURUSD',
    timeframe: 'M15',
    enabled: true,
    installPath: 'C:\\Program Files\\MetaTrader 5\\MQL5\\Indicators\\RSI_Divergence_Pro.ex5',
    deployedAt: '2026-11-23T14:08:00.000Z',
    config: {
      lotSize: 0,
      stopLossPips: 0,
      takeProfitPips: 0,
      magicNumber: 0,
      demoOnly: true,
    },
    lastSignal: 'BULL_DIV_CONFIRMED (RSI 34.2)',
  },
];

const bridgeLogs: BridgeLogEntry[] = [
  {
    id: 'log-001',
    timestamp: new Date(Date.now() - 180_000).toISOString(),
    level: 'INFO',
    source: 'WinlatorContainer',
    message: 'Wine 9.2 (Box64 0.2.8) container healthy. Zero-VPS mobile bridge active.',
  },
  {
    id: 'log-002',
    timestamp: new Date(Date.now() - 120_000).toISOString(),
    level: 'INFO',
    source: 'AndroidKeepAlive',
    message: 'Unrestricted battery profile verified; Doze mode & background kill bypassed.',
  },
  {
    id: 'log-003',
    timestamp: new Date(Date.now() - 45_000).toISOString(),
    level: 'EXEC',
    source: 'Aegentix_OFI_Scalper.ex5',
    message: 'Heartbeat OK on XAUUSD M1 [Magic 880101] — Demo Account Safety Lock enforced.',
  },
];

const setupGuideChecklist: SetupGuideStep[] = [
  {
    step: 1,
    id: 'install-winlator',
    title: 'Install Winlator & Create MT5 Windows Container',
    category: 'WINLATOR',
    summary: 'Provision a lightweight x86_64 Windows container directly on Android without paying for a monthly VPS.',
    details: [
      'Install Winlator (v8.0+) APK on Android 12/13/14+ (64-bit ARMv8 device with >= 6GB RAM recommended).',
      'Create a new container: Screen Size 1280x720, Graphics Driver VirGL / Turnip (Adreno), DX Wrapper WineD3D.',
      'Set Box64 Preset to "Compatibility" or "Intermediate" for stable MetaTrader 5 tick processing.',
    ],
    critical: true,
  },
  {
    step: 2,
    id: 'wine-components',
    title: 'Configure Required Wine Components (Gecko / Mono / WebView)',
    category: 'WINE',
    summary: 'Ensure MT5 installer and MQL5 Market/WebRequest dialogs render cleanly inside Wine.',
    details: [
      'Launch the container and open Start Menu -> System Tools -> Wine Configuration (winecfg).',
      'Set Windows Version to Windows 10 (64-bit) so mt5setup.exe passes OS verification.',
      'Install Wine Mono and Wine Gecko when prompted; verify wininet & crypt32 libraries are enabled.',
    ],
  },
  {
    step: 3,
    id: 'install-mt5-windows',
    title: 'Run Official MT4/MT5 Windows Installer (mt5setup.exe)',
    category: 'MT5',
    summary: 'Install the full desktop MetaTrader 5 terminal inside the container to unlock Expert Advisors & custom indicators.',
    details: [
      'Download mt5setup.exe (or broker MT4/MT5 installer) into Android /Download (mapped to D:\\ inside Winlator).',
      'Run D:\\mt5setup.exe inside the Winlator desktop and complete installation to C:\\Program Files\\MetaTrader 5.',
      'Log in with a DEMO account first and enable "Allow Algo Trading" in Tools -> Options -> Expert Advisors.',
    ],
    pathHint: 'D:\\mt5setup.exe -> C:\\Program Files\\MetaTrader 5\\terminal64.exe',
    critical: true,
  },
  {
    step: 4,
    id: 'copy-mql5-files',
    title: 'Copy .ex5 / .mq5 EAs & Custom Indicators to MQL5 Folders',
    category: 'MQL5_FILES',
    summary: 'Place compiled Expert Advisors and Custom Indicators into the MT5 Data Folder.',
    details: [
      'In MT5, click File -> Open Data Folder to locate your terminal instance directory.',
      'Copy Expert Advisors (.ex5 / .mq5) into MQL5\\Experts\\ and Custom Indicators into MQL5\\Indicators\\.',
      'Right-click Navigator -> Refresh, then drag EAs/Indicators onto charts with Demo Safety Lock enabled.',
    ],
    pathHint: 'MQL5\\Experts\\  |  MQL5\\Indicators\\',
  },
  {
    step: 5,
    id: 'android-battery-bypass',
    title: 'Bypass Android Battery Optimization & Background Keep-Alive',
    category: 'ANDROID_OS',
    summary: 'Prevent Android Doze / OEM task killers from suspending Winlator while your screen is off.',
    details: [
      'Open Android Settings -> Apps -> Winlator -> Battery -> Select "Unrestricted" (disable battery optimization).',
      'Lock Winlator in Android Recents (tap app icon -> Lock / Keep open) to prevent RAM reclamation.',
      'Keep device connected to charger or enable Developer Options -> Stay Awake while charging for 24/5 sessions.',
    ],
    critical: true,
  },
  {
    step: 6,
    id: 'task-manager-recovery',
    title: 'Winlator Task Manager Swipe-Recovery (Frozen Terminal Fix)',
    category: 'WINLATOR',
    summary: 'Recover a hung terminal64.exe process in seconds without rebooting the phone.',
    details: [
      'Swipe from the left edge of the Winlator screen to open the side drawer and tap "Task Manager".',
      'Select terminal64.exe (or terminal.exe for MT4) -> End Process to clear the frozen Wine thread.',
      'Relaunch MetaTrader 5 from the desktop shortcut or use the 1-click "Task Manager Recover" button in this UI.',
    ],
  },
];

function appendLog(
  level: BridgeLogEntry['level'],
  source: string,
  message: string
): BridgeLogEntry {
  const entry: BridgeLogEntry = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
  };
  bridgeLogs.unshift(entry);
  if (bridgeLogs.length > 40) {
    bridgeLogs.length = 40;
  }
  return entry;
}

export const mt5MobileBridgeRouter = express.Router();

mt5MobileBridgeRouter.get('/status', (_req: Request, res: Response) => {
  const uptimeSeconds = Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000));
  const activeEaCount = installedModules.filter((m) => m.type === 'EA' && m.enabled).length;
  const activeIndicatorCount = installedModules.filter(
    (m) => m.type === 'INDICATOR' && m.enabled
  ).length;

  res.json({
    ok: true,
    mode: 'NO_VPS_ANDROID_WINLATOR',
    deviceProfile: {
      device: 'Android 14 (ARM64 Snapdragon 8 Gen 3)',
      containerEngine: 'Winlator 8.0 + Box64 0.2.8',
      wineVersion: 'Wine 9.2 (Windows 10 64-bit)',
      vpsCostMonthlyUsd: 0,
    },
    health: {
      cpuUsagePct: 24 + (uptimeSeconds % 9),
      ramUsedMb: 2840,
      ramTotalMb: 12288,
      batteryPct: 87,
      charging: true,
      thermalC: 36.4,
      uptimeSeconds,
    },
    backgroundKeepAlive: {
      enabled: true,
      batteryOptimizationBypassed: true,
      wakeLockActive: true,
      dozeWhitelist: true,
      recentsLocked: true,
    },
    terminal: {
      processName: 'terminal64.exe',
      pid: currentTerminalPid,
      status: 'RUNNING',
      broker: 'MetaQuotes-Demo',
      accountId: '50284910',
      algoTradingEnabled: true,
      pingMs: 26,
      recoveryCount,
      lastRecoveryIso,
      lastHeartbeatIso: new Date().toISOString(),
    },
    demoSafetyLock: {
      enabled: true,
      mode: 'DEMO_ONLY',
      liveTradingBlocked: true,
      note: 'All mobile EA executions are restricted to demo accounts by safety lock.',
    },
    summary: {
      totalModules: installedModules.length,
      activeEaCount,
      activeIndicatorCount,
    },
    modules: installedModules,
    logs: bridgeLogs,
  });
});

mt5MobileBridgeRouter.post('/ea/toggle', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as ToggleRequestBody;
  const target = installedModules.find(
    (m) =>
      (typeof body.id === 'string' && m.id === body.id) ||
      (typeof body.filename === 'string' &&
        m.filename.toLowerCase() === body.filename.toLowerCase())
  );

  if (!target) {
    res.status(404).json({
      ok: false,
      error: 'Requested EA or Custom Indicator was not found in the Winlator MQL5 directory.',
    });
    return;
  }

  target.enabled = typeof body.enabled === 'boolean' ? body.enabled : !target.enabled;
  target.lastSignal = target.enabled
    ? `ACTIVE (${target.symbol} ${target.timeframe} · Demo)`
    : 'STANDBY (Disabled)';

  const logEntry = appendLog(
    'EXEC',
    target.filename,
    `${target.type} ${target.enabled ? 'ENABLED' : 'DISABLED'} on ${target.symbol} ${target.timeframe} (PID ${currentTerminalPid}).`
  );

  res.json({
    ok: true,
    module: target,
    log: logEntry,
  });
});

mt5MobileBridgeRouter.post('/ea/deploy', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as DeployRequestBody;
  const rawFilename = typeof body.filename === 'string' ? body.filename.trim() : '';

  if (!rawFilename) {
    res.status(400).json({
      ok: false,
      error: 'Filename is required (e.g. My_Scalper.ex5 or Custom_VWAP.mq5).',
    });
    return;
  }

  const validExt = /\.(ex5|mq5|ex4|mq4)$/i.test(rawFilename);
  if (!validExt) {
    res.status(400).json({
      ok: false,
      error: 'Unsupported file extension. Allowed formats: .ex5, .mq5, .ex4, .mq4.',
    });
    return;
  }

  const moduleType: Mt5ModuleType = body.type === 'INDICATOR' ? 'INDICATOR' : 'EA';
  const symbol =
    typeof body.symbol === 'string' && body.symbol.trim()
      ? body.symbol.trim().toUpperCase()
      : 'XAUUSD';
  const timeframe =
    typeof body.timeframe === 'string' && body.timeframe.trim()
      ? body.timeframe.trim().toUpperCase()
      : 'M5';

  const lotSize =
    moduleType === 'EA'
      ? Math.max(0.01, Math.min(10, Number(body.lotSize) || 0.05))
      : 0;
  const stopLossPips =
    moduleType === 'EA'
      ? Math.max(1, Math.min(500, Number(body.stopLossPips) || 20))
      : 0;
  const takeProfitPips =
    moduleType === 'EA'
      ? Math.max(1, Math.min(1000, Number(body.takeProfitPips) || 40))
      : 0;
  const magicNumber =
    moduleType === 'EA'
      ? Math.max(1000, Number(body.magicNumber) || 880100 + installedModules.length + 1)
      : 0;

  // Demo-account safety lock is always enforced
  const demoOnly = true;
  const folder = moduleType === 'EA' ? 'Experts' : 'Indicators';
  const id = `${moduleType.toLowerCase()}-${Date.now()}`;

  const newModule: Mt5Module = {
    id,
    filename: rawFilename,
    type: moduleType,
    symbol,
    timeframe,
    enabled: true,
    installPath: `C:\\Program Files\\MetaTrader 5\\MQL5\\${folder}\\${rawFilename}`,
    deployedAt: new Date().toISOString(),
    config: {
      lotSize,
      stopLossPips,
      takeProfitPips,
      magicNumber,
      demoOnly,
    },
    lastSignal: `DEPLOYED & ATTACHED (${symbol} ${timeframe} · Demo)`,
  };

  installedModules.unshift(newModule);

  const logEntry = appendLog(
    'INFO',
    'MQL5Deployer',
    `Deployed ${moduleType} ${rawFilename} to MQL5\\${folder}\\ (${symbol} ${timeframe}, DemoOnly=true).`
  );

  res.status(201).json({
    ok: true,
    module: newModule,
    log: logEntry,
  });
});

mt5MobileBridgeRouter.post('/task-manager/recover', (_req: Request, res: Response) => {
  const previousPid = currentTerminalPid;
  currentTerminalPid = previousPid + Math.floor(17 + Math.random() * 83);
  recoveryCount += 1;
  lastRecoveryIso = new Date().toISOString();

  const logEntry = appendLog(
    'RECOVERY',
    'WinlatorTaskMgr',
    `Swipe-recovery executed: terminated frozen terminal64.exe (PID ${previousPid}) and cleanly restarted MT5 in Wine 9.2 (new PID ${currentTerminalPid}).`
  );

  res.json({
    ok: true,
    previousPid,
    newPid: currentTerminalPid,
    recoveryCount,
    recoveredAt: lastRecoveryIso,
    status: 'RUNNING',
    log: logEntry,
  });
});

mt5MobileBridgeRouter.get('/setup-guide', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    title: 'Zero-VPS Android MT4/MT5 EA & Indicator Setup Guide (Winlator + Wine)',
    mql5Paths: {
      experts: 'C:\\Program Files\\MetaTrader 5\\MQL5\\Experts\\',
      indicators: 'C:\\Program Files\\MetaTrader 5\\MQL5\\Indicators\\',
      androidSharedDrive: '/storage/emulated/0/Download (mapped as D:\\ in Winlator)',
    },
    steps: setupGuideChecklist,
  });
});
