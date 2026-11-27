#!/usr/bin/env node
/**
 * Aegentix Stardust // ROG RC73XA Starlink Mini Dish Telemetry Forwarder (Node.js 20+ ESM)
 *
 * Zero-secret-exposure telemetry relay for ASUSTeK ROG Xbox Ally X (RC73XA / AEG-JARVIS-PRIME):
 *  1. Auto-discovers STARLINK_TELEMETRY_TOKEN from process.env or local .env files on the ROG
 *     without ever echoing, printing, or logging the secret token.
 *  2. Checks https://starlink-edge.aegentixcybernetics.com/health first (reporting edge_colo
 *     and starlink_uplink_detected over AS14593).
 *  3. Polls http://127.0.0.1:8790 (/status, /health, or MCP POST /mcp) and probes TCP socket
 *     reachability on 192.168.100.1:9200.
 *  4. Signs snapshot digest with SHA-256 (VES-1) and POSTs JSON to
 *     https://starlink-edge.aegentixcybernetics.com/api/starlink/telemetry with
 *     Authorization: Bearer <token>.
 *
 * Usage:
 *   node scripts/rog-starlink-forwarder.mjs --once
 *   node scripts/rog-starlink-forwarder.mjs --watch --interval 15
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCliArgs(argv) {
  const options = {
    once: false,
    watch: false,
    intervalSeconds: 15,
    edgeBaseUrl:
      process.env.STARLINK_EDGE_URL || 'https://starlink-edge.aegentixcybernetics.com',
    localBridgeUrl:
      process.env.STARLINK_LOCAL_BRIDGE_URL || 'http://127.0.0.1:8790',
    dishGrpcAddr: process.env.STARLINK_DISH_GRPC_ADDR || '192.168.100.1:9200',
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const lower = arg.toLowerCase();

    if (lower === '--once' || lower === '-once') {
      options.once = true;
    } else if (lower === '--watch' || lower === '-watch') {
      options.watch = true;
    } else if (
      lower === '--interval' ||
      lower === '--interval-seconds' ||
      lower === '-intervalseconds'
    ) {
      const nextVal = Number(argv[i + 1]);
      if (Number.isFinite(nextVal) && nextVal >= 3 && nextVal <= 3600) {
        options.intervalSeconds = Math.round(nextVal);
        i += 1;
      }
    } else if (lower.startsWith('--interval=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val >= 3 && val <= 3600) {
        options.intervalSeconds = Math.round(val);
      }
    } else if (lower === '--edge-url' && argv[i + 1]) {
      options.edgeBaseUrl = argv[i + 1];
      i += 1;
    } else if (lower === '--bridge-url' && argv[i + 1]) {
      options.localBridgeUrl = argv[i + 1];
      i += 1;
    } else if (lower === '--dry-run' || lower === '-dryrun') {
      options.dryRun = true;
    } else if (lower === '--help' || lower === '-h') {
      options.help = true;
    }
  }

  return options;
}

function redactToken(message, token) {
  if (!message) return '';
  if (token && message.includes(token)) {
    return message.split(token).join('[REDACTED_TOKEN]');
  }
  return message;
}

function parseTokenFromEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^(?:export\s+)?STARLINK_TELEMETRY_TOKEN\s*=\s*(.+)$/);
      if (match) {
        let value = match[1].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (value) {
          return value;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function discoverTelemetryToken() {
  if (
    typeof process.env.STARLINK_TELEMETRY_TOKEN === 'string' &&
    process.env.STARLINK_TELEMETRY_TOKEN.trim().length > 0
  ) {
    return {
      found: true,
      token: process.env.STARLINK_TELEMETRY_TOKEN.trim(),
      source: 'env:STARLINK_TELEMETRY_TOKEN',
    };
  }

  const homeDir = os.homedir();
  const candidateDirs = [
    process.cwd(),
    path.resolve(__dirname, '..'),
    __dirname,
    homeDir ? path.join(homeDir, '.aegentix') : '',
    homeDir || '',
    'C:\\Aegentix',
    'C:\\Aegentix\\starlink',
  ].filter(Boolean);

  const envFiles = ['.env', '.env.local', '.env.production', 'starlink.env'];
  const seen = new Set();

  for (const dir of candidateDirs) {
    for (const fileName of envFiles) {
      const fullPath = path.resolve(dir, fileName);
      if (seen.has(fullPath)) continue;
      seen.add(fullPath);

      const token = parseTokenFromEnvFile(fullPath);
      if (token) {
        return {
          found: true,
          token,
          source: `dotenv:${fullPath}`,
        };
      }
    }
  }

  return {
    found: false,
    token: '',
    source: 'none',
  };
}

async function fetchJsonSafe(url, init = {}, timeoutMs = 8000) {
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
    const rawText = await response.text();
    let parsed = rawText;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // retain raw string if non-JSON
    }
    return {
      ok: response.ok,
      status: response.status,
      data: parsed,
    };
  } finally {
    clearTimeout(timer);
  }
}

function checkTcpPort(endpoint, timeoutMs = 1200) {
  const [host, portStr] = endpoint.split(':');
  const port = Number(portStr || 9200);

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function checkEdgeHealth(edgeBaseUrl) {
  const healthUrl = `${edgeBaseUrl.replace(/\/+$/, '')}/health`;
  try {
    const res = await fetchJsonSafe(healthUrl, { method: 'GET' }, 8000);
    if (res.ok && res.data && typeof res.data === 'object') {
      const edgeColo = res.data.edge_colo || 'UNKNOWN';
      const starlinkDetected = Boolean(res.data.starlink_uplink_detected);
      console.log(
        `  [EDGE] ${healthUrl} -> OK | edge_colo=${edgeColo} | starlink_uplink_detected=${starlinkDetected} (AS14593)`
      );
      return {
        ok: true,
        edge_colo: edgeColo,
        starlink_uplink_detected: starlinkDetected,
        service: res.data.service || 'aegentix-starlink-mcp',
      };
    }
    console.warn(`  [EDGE] ${healthUrl} returned HTTP ${res.status}`);
    return {
      ok: false,
      edge_colo: 'DEGRADED',
      starlink_uplink_detected: false,
      status: res.status,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [EDGE] Health check unreachable (${healthUrl}): ${msg}`);
    return {
      ok: false,
      edge_colo: 'UNREACHABLE',
      starlink_uplink_detected: false,
      error: msg,
    };
  }
}

async function pollLocalStarlinkBridge(localBridgeUrl, dishGrpcAddr) {
  const cleanBase = localBridgeUrl.replace(/\/+$/, '');

  // 1. GET /status
  try {
    const statusRes = await fetchJsonSafe(`${cleanBase}/status`, { method: 'GET' }, 3500);
    if (statusRes.ok) {
      return {
        source: `${cleanBase}/status`,
        bridge_online: true,
        payload: statusRes.data,
      };
    }
  } catch {
    // fallback to /health
  }

  // 2. GET /health
  try {
    const healthRes = await fetchJsonSafe(`${cleanBase}/health`, { method: 'GET' }, 3500);
    if (healthRes.ok) {
      return {
        source: `${cleanBase}/health`,
        bridge_online: true,
        payload: healthRes.data,
      };
    }
  } catch {
    // fallback to POST /mcp
  }

  // 3. POST /mcp (JSON-RPC 2.0)
  try {
    const mcpRes = await fetchJsonSafe(
      `${cleanBase}/mcp`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'starlink_dish_status', arguments: {} },
        }),
      },
      3500
    );
    if (mcpRes.ok) {
      return {
        source: `${cleanBase}/mcp`,
        bridge_online: true,
        payload: mcpRes.data,
      };
    }
  } catch {
    // fallback to direct TCP socket probe on 192.168.100.1:9200
  }

  const dishReachable = await checkTcpPort(dishGrpcAddr, 1200);
  return {
    source: 'direct_probe',
    bridge_online: false,
    dish_grpc_target: dishGrpcAddr,
    dish_grpc_reachable: dishReachable,
    status: dishReachable
      ? 'DISH_TCP_9200_REACHABLE_START_8790_BRIDGE'
      : 'AWAITING_LOCAL_8790_DISH_BRIDGE',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(
      [
        'Aegentix ROG RC73XA Starlink Mini Telemetry Forwarder (Node 20+)',
        '',
        'Options:',
        '  --once                 Execute a single telemetry push and exit (default)',
        '  --watch                Continuously poll & push dish telemetry',
        '  --interval <seconds>   Loop interval in watch mode (default: 15)',
        '  --edge-url <url>       Override Cloudflare Starlink Edge base URL',
        '  --bridge-url <url>     Override local dish bridge URL (default: http://127.0.0.1:8790)',
        '  --dry-run              Run health + local bridge probe without transmitting token',
      ].join('\n')
    );
    return;
  }

  console.log('==================================================================');
  console.log('  AEGENTIX STARDUST // ROG RC73XA STARLINK MINI FORWARDER (NODE)  ');
  console.log('==================================================================');

  const tokenInfo = discoverTelemetryToken();
  if (!tokenInfo.found && !opts.dryRun) {
    console.error(
      '  [ERR] STARLINK_TELEMETRY_TOKEN not found in environment or local .env files.'
    );
    console.error(
      '        Export STARLINK_TELEMETRY_TOKEN or add it to .env on RC73XA (value is never echoed).'
    );
    process.exitCode = 1;
    return;
  }

  if (tokenInfo.found) {
    console.log(
      `  [AUTH] Token resolved via ${tokenInfo.source} (redacted, zero-secret-exposure enforced)`
    );
  } else {
    console.log('  [AUTH] Dry-run mode active (no Authorization token transmitted)');
  }

  const runContinuous = opts.watch && !opts.once;
  const ingestUrl = `${opts.edgeBaseUrl.replace(/\/+$/, '')}/api/starlink/telemetry`;
  let cycle = 0;

  while (true) {
    cycle += 1;
    const capturedUtc = new Date().toISOString();
    console.log(`\n[CYCLE #${cycle}] ${capturedUtc}`);

    const edgePrecheck = await checkEdgeHealth(opts.edgeBaseUrl);
    const dishTelemetry = await pollLocalStarlinkBridge(
      opts.localBridgeUrl,
      opts.dishGrpcAddr
    );

    const canonicalPayload = JSON.stringify({
      node_identity: 'AEG-JARVIS-PRIME',
      host_model: 'ROG-RC73XA',
      captured_utc: capturedUtc,
      dish_target: opts.dishGrpcAddr,
      local_bridge: opts.localBridgeUrl,
      edge_precheck: edgePrecheck,
      dish_telemetry: dishTelemetry,
    });

    const ves1PayloadSha256 = crypto
      .createHash('sha256')
      .update(canonicalPayload)
      .digest('hex');

    const bodyEnvelope = {
      node_identity: 'AEG-JARVIS-PRIME',
      host_model: 'ASUSTeK ROG Xbox Ally X RC73XA',
      expected_asn: 'AS14593',
      platform: `${os.platform()}-${os.arch()}`,
      captured_utc: capturedUtc,
      dish_target: opts.dishGrpcAddr,
      local_bridge: opts.localBridgeUrl,
      edge_precheck: edgePrecheck,
      dish_telemetry: dishTelemetry,
      ves1_payload_sha256: ves1PayloadSha256,
    };

    if (opts.dryRun) {
      console.log(
        `  [DRY-RUN] Snapshot ready | source=${dishTelemetry.source} | bridge_online=${dishTelemetry.bridge_online} | sha256=${ves1PayloadSha256.slice(0, 16)}...`
      );
    } else {
      try {
        const pushRes = await fetchJsonSafe(
          ingestUrl,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokenInfo.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyEnvelope),
          },
          10000
        );

        if (!pushRes.ok) {
          throw new Error(`HTTP ${pushRes.status}`);
        }

        console.log(
          `  [PUSH] POST ${ingestUrl} -> HTTP ${pushRes.status} | source=${dishTelemetry.source} | sha256=${ves1PayloadSha256.slice(0, 16)}...`
        );
      } catch (err) {
        const rawErr = err instanceof Error ? err.message : String(err);
        console.error(
          `  [WARN] Telemetry push failed: ${redactToken(rawErr, tokenInfo.token)}`
        );
        if (!runContinuous) {
          process.exitCode = 1;
          return;
        }
      }
    }

    if (!runContinuous) {
      break;
    }

    await sleep(opts.intervalSeconds * 1000);
  }
}

main().catch((err) => {
  console.error('  [FATAL] Unexpected forwarder error:', err instanceof Error ? err.message : 'Unknown error');
  process.exitCode = 1;
});
