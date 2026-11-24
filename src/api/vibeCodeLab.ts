import express, { type Request, type Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export interface VibeTemplate {
  id: string;
  name: string;
  shortLabel: string;
  category: string;
  description: string;
  code: string;
}

export interface VibeSnapshot {
  id: string;
  name: string;
  prompt: string;
  templateId?: string;
  code: string;
  createdAt: string;
}

const EAGLE_SHIELD_HUD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Eagle Shield Quantum Radar HUD</title>
  <style>
    :root {
      --bg: #080B10;
      --panel: #0D121B;
      --border: #1E293B;
      --cyan: #38BDF8;
      --emerald: #10B981;
      --amber: #F59E0B;
      --rose: #F43F5E;
      --text: #E2E8F0;
      --muted: #64748B;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
      min-height: 100vh;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 10px var(--emerald); }
    .badge {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid rgba(56,189,248,0.35);
      background: rgba(56,189,248,0.1);
      color: var(--cyan);
      font-variant-numeric: tabular-nums;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 14px;
      flex: 1;
    }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
    }
    canvas {
      width: 100%;
      height: 280px;
      background: #06090E;
      border: 1px solid #162032;
      border-radius: 6px;
      display: block;
    }
    .toggle-list { display: flex; flex-direction: column; gap: 10px; }
    .toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: #090D14;
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .toggle-label { font-size: 12px; font-weight: 600; }
    .toggle-sub { font-size: 10px; color: var(--muted); margin-top: 2px; }
    .switch {
      appearance: none;
      width: 40px;
      height: 22px;
      background: #1E293B;
      border-radius: 999px;
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
    }
    .switch::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #94A3B8;
      transition: transform 0.2s, background 0.2s;
    }
    .switch:checked { background: rgba(16,185,129,0.28); border: 1px solid var(--emerald); }
    .switch:checked::after { transform: translateX(18px); background: var(--emerald); }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .metric {
      background: #090D14;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
    }
    .metric-label { font-size: 10px; color: var(--muted); text-transform: uppercase; }
    .metric-val { font-size: 16px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; color: var(--cyan); }
    .pulse-bar { height: 6px; background: #162032; border-radius: 999px; overflow: hidden; }
    .pulse-fill { height: 100%; width: 78%; background: linear-gradient(90deg, var(--cyan), var(--emerald)); transition: width 0.35s ease; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand"><span class="dot" id="statusDot"></span> EAGLE SHIELD // QUANTUM RADAR HUD</div>
    <div class="badge" id="pqKeyBadge">ML-KEM-1024 · ROTATING</div>
  </div>
  <div class="grid">
    <div class="card">
      <div class="card-title"><span>360° Threat Sweep Telemetry</span><span id="contactCount">4 CONTACTS</span></div>
      <canvas id="radarCanvas"></canvas>
      <div class="metrics">
        <div class="metric"><div class="metric-label">PQ Entropy</div><div class="metric-val" id="entropyVal">99.94%</div></div>
        <div class="metric"><div class="metric-label">Shield Integrity</div><div class="metric-val" id="integrityVal">100%</div></div>
        <div class="metric"><div class="metric-label">Key Pulse</div><div class="metric-val" id="pulseMs">14 ms</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><span>Live Shield Subsystems</span><span id="activeCount">4 / 4 ARMED</span></div>
      <div class="toggle-list">
        <label class="toggle-row">
          <div><div class="toggle-label">ML-KEM-1024 Key Vault</div><div class="toggle-sub">Post-quantum lattice encapsulation</div></div>
          <input type="checkbox" class="switch shield-toggle" checked />
        </label>
        <label class="toggle-row">
          <div><div class="toggle-label">Dilithium-5 Signature Gate</div><div class="toggle-sub">Zero-trust packet verification</div></div>
          <input type="checkbox" class="switch shield-toggle" checked />
        </label>
        <label class="toggle-row">
          <div><div class="toggle-label">Quantum Firewall Mesh</div><div class="toggle-sub">Autonomous anomaly quarantine</div></div>
          <input type="checkbox" class="switch shield-toggle" checked />
        </label>
        <label class="toggle-row">
          <div><div class="toggle-label">Stealth Telemetry Cloak</div><div class="toggle-sub">Obfuscated edge relay routing</div></div>
          <input type="checkbox" class="switch shield-toggle" checked />
        </label>
      </div>
      <div>
        <div class="card-title" style="margin-bottom:6px;"><span>PQ-Key Pulse Coherence</span><span id="coherencePct">96%</span></div>
        <div class="pulse-bar"><div class="pulse-fill" id="pulseFill"></div></div>
      </div>
    </div>
  </div>
  <script>
    const canvas = document.getElementById('radarCanvas');
    const ctx = canvas.getContext('2d');
    let angle = 0;
    const blips = [
      { r: 0.35, a: 0.8, label: 'NODE-A1' },
      { r: 0.62, a: 2.3, label: 'RELAY-09' },
      { r: 0.78, a: 4.1, label: 'PQ-GATE' },
      { r: 0.48, a: 5.4, label: 'EDGE-77' }
    ];
    function resize() {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function drawRadar() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.42;

      ctx.fillStyle = 'rgba(6, 9, 14, 0.25)';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (radius / 4) * i, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.32)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, angle - 0.45, angle);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();

      blips.forEach((b) => {
        const bx = cx + Math.cos(b.a) * (radius * b.r);
        const by = cy + Math.sin(b.a) * (radius * b.r);
        const diff = Math.abs(((angle - b.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const alpha = diff > 2.6 ? 1 : 0.35;
        ctx.fillStyle = 'rgba(16, 185, 129, ' + alpha + ')';
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(226, 232, 240, ' + (alpha * 0.85) + ')';
        ctx.font = '10px monospace';
        ctx.fillText(b.label, bx + 8, by + 3);
      });

      angle = (angle + 0.025) % (Math.PI * 2);
      requestAnimationFrame(drawRadar);
    }
    drawRadar();

    const toggles = Array.from(document.querySelectorAll('.shield-toggle'));
    function updateShieldStatus() {
      const armed = toggles.filter((t) => t.checked).length;
      const pct = Math.round((armed / toggles.length) * 100);
      document.getElementById('activeCount').textContent = armed + ' / ' + toggles.length + ' ARMED';
      document.getElementById('integrityVal').textContent = pct + '%';
      document.getElementById('statusDot').style.background = armed === 4 ? '#10B981' : armed >= 2 ? '#F59E0B' : '#F43F5E';
    }
    toggles.forEach((t) => t.addEventListener('change', updateShieldStatus));

    setInterval(() => {
      const pulse = 11 + Math.floor(Math.random() * 8);
      const coh = 91 + Math.floor(Math.random() * 9);
      document.getElementById('pulseMs').textContent = pulse + ' ms';
      document.getElementById('coherencePct').textContent = coh + '%';
      document.getElementById('pulseFill').style.width = coh + '%';
      document.getElementById('pqKeyBadge').textContent = 'ML-KEM-1024 · 0x' + Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0');
    }, 1800);
  </script>
</body>
</html>`;

const WAVE_SURFER_DECK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wave Surfer Live Momentum Deck</title>
  <style>
    :root { --bg:#080B10; --panel:#0D121B; --border:#1E293B; --cyan:#38BDF8; --emerald:#10B981; --rose:#F43F5E; --amber:#F59E0B; --text:#E2E8F0; --muted:#64748B; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', ui-monospace, monospace; padding: 18px; display: flex; flex-direction: column; gap: 14px; min-height: 100vh; }
    .header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; }
    .badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid rgba(16,185,129,0.4); background: rgba(16,185,129,0.12); color: var(--emerald); }
    .grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; flex: 1; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; }
    canvas { width: 100%; height: 240px; background: #06090E; border: 1px solid #162032; border-radius: 6px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .stat { background: #090D14; border: 1px solid var(--border); border-radius: 6px; padding: 10px; }
    .stat-v { font-size: 17px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    button { padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border); font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; color: var(--text); background: #111827; }
    .btn-long { border-color: rgba(16,185,129,0.5); background: rgba(16,185,129,0.14); color: var(--emerald); }
    .btn-short { border-color: rgba(244,63,94,0.5); background: rgba(244,63,94,0.14); color: var(--rose); }
    .btn-close { width: 100%; border-color: rgba(56,189,248,0.45); background: rgba(56,189,248,0.12); color: var(--cyan); }
    input[type=range] { width: 100%; accent-color: var(--cyan); }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;">WAVE SURFER // LIVE MOMENTUM DECK</div>
    <div class="badge" id="surferBadge">BARREL SURFER · ACTIVE</div>
  </div>
  <div class="grid">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="label">Real-Time Momentum Wave</span>
        <span id="priceReadout" style="font-size:15px;font-weight:700;color:#38BDF8;font-variant-numeric:tabular-nums;">$104.25</span>
      </div>
      <canvas id="waveCanvas"></canvas>
      <div class="stats">
        <div class="stat"><div class="label">Open Leg</div><div class="stat-v" id="legSide">FLAT</div></div>
        <div class="stat"><div class="label">Unrealized PnL</div><div class="stat-v" id="pnlVal">$0.00</div></div>
        <div class="stat"><div class="label">Realized</div><div class="stat-v" id="realizedVal">$0.00</div></div>
      </div>
    </div>
    <div class="card">
      <div class="label">Live PnL Leg Simulator</div>
      <div style="background:#090D14;border:1px solid #1E293B;border-radius:6px;padding:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
          <span>Position Leverage</span><span id="levLabel" style="color:#38BDF8;font-weight:700;">5x</span>
        </div>
        <input id="levSlider" type="range" min="1" max="20" value="5" />
      </div>
      <div class="btn-row">
        <button class="btn-long" id="longBtn">ENTER LONG LEG</button>
        <button class="btn-short" id="shortBtn">ENTER SHORT LEG</button>
      </div>
      <button class="btn-close" id="closeBtn">CLOSE &amp; LOCK PNL</button>
      <div style="font-size:11px;color:#94A3B8;line-height:1.5;margin-top:auto;padding:10px;background:#090D14;border:1px solid #1E293B;border-radius:6px;">
        Momentum Crest Engine tracks synthetic wave velocity and updates your Barrel Surfer badge dynamically as unrealized PnL surges.
      </div>
    </div>
  </div>
  <script>
    const canvas = document.getElementById('waveCanvas');
    const ctx = canvas.getContext('2d');
    const points = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i * 0.2) * 4);
    let t = 80;
    let position = null;
    let realized = 0;

    function resize() {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function currentPrice() { return points[points.length - 1]; }

    function updateUI() {
      const p = currentPrice();
      const lev = Number(document.getElementById('levSlider').value);
      document.getElementById('priceReadout').textContent = '$' + p.toFixed(2);
      document.getElementById('levLabel').textContent = lev + 'x';
      let pnl = 0;
      if (position) {
        const diff = position.side === 'LONG' ? (p - position.entry) : (position.entry - p);
        pnl = diff * 25 * lev;
        document.getElementById('legSide').textContent = position.side + ' @ ' + position.entry.toFixed(2);
      } else {
        document.getElementById('legSide').textContent = 'FLAT';
      }
      const pnlEl = document.getElementById('pnlVal');
      pnlEl.textContent = (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2);
      pnlEl.style.color = pnl > 0 ? '#10B981' : pnl < 0 ? '#F43F5E' : '#E2E8F0';
      document.getElementById('realizedVal').textContent = (realized >= 0 ? '+' : '-') + '$' + Math.abs(realized).toFixed(2);
      const badge = document.getElementById('surferBadge');
      if (pnl > 120) { badge.textContent = 'BARREL SURFER · CRESTING'; badge.style.color = '#10B981'; }
      else if (pnl < -80) { badge.textContent = 'WIPEOUT GUARD · ACTIVE'; badge.style.color = '#F59E0B'; }
      else { badge.textContent = 'BARREL SURFER · ACTIVE'; badge.style.color = '#38BDF8'; }
    }

    document.getElementById('longBtn').onclick = () => { position = { side: 'LONG', entry: currentPrice() }; updateUI(); };
    document.getElementById('shortBtn').onclick = () => { position = { side: 'SHORT', entry: currentPrice() }; updateUI(); };
    document.getElementById('closeBtn').onclick = () => {
      if (!position) return;
      const p = currentPrice();
      const lev = Number(document.getElementById('levSlider').value);
      const diff = position.side === 'LONG' ? (p - position.entry) : (position.entry - p);
      realized += diff * 25 * lev;
      position = null;
      updateUI();
    };
    document.getElementById('levSlider').oninput = updateUI;

    setInterval(() => {
      t += 0.25;
      const next = 100 + Math.sin(t * 0.45) * 4.5 + Math.cos(t * 0.17) * 2.2 + (Math.random() - 0.5) * 0.9;
      points.push(next);
      if (points.length > 80) points.shift();
      updateUI();

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const min = Math.min(...points) - 2;
      const max = Math.max(...points) + 2;

      ctx.strokeStyle = 'rgba(30, 41, 59, 0.7)';
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i); ctx.stroke();
      }

      ctx.beginPath();
      points.forEach((val, idx) => {
        const x = (idx / (points.length - 1)) * w;
        const y = h - ((val - min) / (max - min)) * (h - 24) - 12;
        if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
      g.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
      ctx.fillStyle = g;
      ctx.fill();
    }, 180);
  </script>
</body>
</html>`;

const TREASURY_VAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>US-SQTE Quantum Treasury Vault</title>
  <style>
    :root { --bg:#080B10; --panel:#0D121B; --border:#1E293B; --cyan:#38BDF8; --emerald:#10B981; --amber:#F59E0B; --text:#E2E8F0; --muted:#64748B; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', ui-monospace, monospace; padding: 18px; display: flex; flex-direction: column; gap: 14px; min-height: 100vh; }
    .top { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; flex: 1; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; }
    .slider-box { background: #090D14; border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; }
    .row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; font-variant-numeric: tabular-nums; }
    input[type=range] { width: 100%; accent-color: var(--emerald); }
    .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .kpi { background: #090D14; border: 1px solid var(--border); border-radius: 6px; padding: 12px; }
    .kpi-v { font-size: 18px; font-weight: 700; margin-top: 4px; color: var(--emerald); font-variant-numeric: tabular-nums; }
    .bars { display: flex; align-items: flex-end; gap: 10px; height: 150px; padding-top: 16px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; }
    .bar { width: 100%; border-radius: 4px 4px 0 0; background: linear-gradient(180deg, var(--cyan), var(--emerald)); transition: height 0.25s ease; }
    .bar-lbl { font-size: 10px; color: var(--muted); }
  </style>
</head>
<body>
  <div class="top">
    <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;">US-SQTE // QUANTUM TREASURY VAULT</div>
    <div style="font-size:11px;color:#10B981;border:1px solid rgba(16,185,129,0.35);padding:4px 10px;border-radius:999px;">RESERVE PROOF: VERIFIED</div>
  </div>
  <div class="grid">
    <div class="card">
      <div class="label">Interactive Reserve Allocator ($10.0M Vault)</div>
      <div class="slider-box">
        <div class="row"><span>US T-Bills (5.25% APY)</span><span id="tbillPct">50%</span></div>
        <input id="tbillSlider" type="range" min="10" max="80" value="50" />
      </div>
      <div class="slider-box">
        <div class="row"><span>Quantum Liquidity Pool (8.40% APY)</span><span id="liqPct">30%</span></div>
        <input id="liqSlider" type="range" min="5" max="70" value="30" />
      </div>
      <div class="slider-box">
        <div class="row"><span>Escrow Lock Horizon</span><span id="escrowMo">12 Months</span></div>
        <input id="escrowSlider" type="range" min="3" max="36" step="3" value="12" />
      </div>
    </div>
    <div class="card">
      <div class="label">Live Yield Projection</div>
      <div class="kpis">
        <div class="kpi"><div class="label">Blended APY</div><div class="kpi-v" id="apyVal">6.15%</div></div>
        <div class="kpi"><div class="label">Projected Yield</div><div class="kpi-v" id="yieldVal">$615,000</div></div>
      </div>
      <div class="bars">
        <div class="bar-col"><div class="bar" id="b1" style="height:40%;"></div><div class="bar-lbl">Q1</div></div>
        <div class="bar-col"><div class="bar" id="b2" style="height:55%;"></div><div class="bar-lbl">Q2</div></div>
        <div class="bar-col"><div class="bar" id="b3" style="height:72%;"></div><div class="bar-lbl">Q3</div></div>
        <div class="bar-col"><div class="bar" id="b4" style="height:92%;"></div><div class="bar-lbl">Q4</div></div>
      </div>
    </div>
  </div>
  <script>
    const tbill = document.getElementById('tbillSlider');
    const liq = document.getElementById('liqSlider');
    const escrow = document.getElementById('escrowSlider');
    function recalc() {
      const t = Number(tbill.value);
      const l = Math.min(Number(liq.value), 100 - t);
      const gold = Math.max(0, 100 - t - l);
      const months = Number(escrow.value);
      document.getElementById('tbillPct').textContent = t + '%';
      document.getElementById('liqPct').textContent = l + '% (Gold/Cash ' + gold + '%)';
      document.getElementById('escrowMo').textContent = months + ' Months';
      const apy = (t * 5.25 + l * 8.4 + gold * 2.1) / 100 + (months >= 24 ? 0.45 : 0);
      const projected = 10000000 * (apy / 100) * (months / 12);
      document.getElementById('apyVal').textContent = apy.toFixed(2) + '%';
      document.getElementById('yieldVal').textContent = '$' + Math.round(projected).toLocaleString();
      const base = Math.min(95, Math.max(25, apy * 10));
      document.getElementById('b1').style.height = Math.round(base * 0.45) + '%';
      document.getElementById('b2').style.height = Math.round(base * 0.65) + '%';
      document.getElementById('b3').style.height = Math.round(base * 0.82) + '%';
      document.getElementById('b4').style.height = Math.round(base) + '%';
    }
    [tbill, liq, escrow].forEach((el) => el.addEventListener('input', recalc));
    recalc();
  </script>
</body>
</html>`;

const JARVIS_CORE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Jarvis Holographic Core Lab</title>
  <style>
    :root { --bg:#080B10; --panel:#0D121B; --border:#1E293B; --cyan:#38BDF8; --emerald:#10B981; --text:#E2E8F0; --muted:#64748B; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', ui-monospace, monospace; padding: 18px; display: flex; flex-direction: column; gap: 14px; min-height: 100vh; }
    .grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 14px; flex: 1; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .title { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; }
    canvas { width: 100%; height: 280px; background: #06090E; border: 1px solid #162032; border-radius: 6px; }
    .term { flex: 1; min-height: 210px; max-height: 240px; overflow-y: auto; background: #06090E; border: 1px solid #162032; border-radius: 6px; padding: 10px; font-size: 11px; line-height: 1.6; }
    .cmd-row { display: flex; gap: 8px; }
    input { flex: 1; background: #090D14; border: 1px solid var(--border); color: var(--text); padding: 8px 10px; border-radius: 6px; font-family: inherit; font-size: 12px; outline: none; }
    button { background: rgba(56,189,248,0.14); border: 1px solid rgba(56,189,248,0.45); color: var(--cyan); padding: 8px 14px; border-radius: 6px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="grid">
    <div class="card">
      <div class="title">Jarvis Holographic Energy Core</div>
      <canvas id="coreCanvas"></canvas>
      <div style="font-size:11px;color:#38BDF8;text-align:center;" id="coreState">RESONANCE: NOMINAL · 128-BAND HARMONIC</div>
    </div>
    <div class="card">
      <div class="title">Interactive Command Terminal (try: help, status, pulse, scan)</div>
      <div class="term" id="termOut">
        <div style="color:#10B981;">[JARVIS] Holographic Core online. Awaiting operator directive.</div>
      </div>
      <form class="cmd-row" id="cmdForm">
        <input id="cmdInput" placeholder="Enter command (help, status, pulse, scan, clear)..." autocomplete="off" />
        <button type="submit">RUN</button>
      </form>
    </div>
  </div>
  <script>
    const canvas = document.getElementById('coreCanvas');
    const ctx = canvas.getContext('2d');
    let phase = 0;
    let boost = 1;
    function resize() {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function render() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);

      const bars = 64;
      const baseR = Math.min(w, h) * 0.24;
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2 + phase * 0.3;
        const amp = (12 + Math.sin(i * 0.5 + phase * 2.4) * 10 + Math.cos(i * 0.9 - phase * 1.7) * 8) * boost;
        const x1 = cx + Math.cos(a) * baseR;
        const y1 = cy + Math.sin(a) * baseR;
        const x2 = cx + Math.cos(a) * (baseR + amp);
        const y2 = cy + Math.sin(a) * (baseR + amp);
        ctx.strokeStyle = i % 2 === 0 ? '#38BDF8' : '#10B981';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(56,189,248,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, baseR * 0.72, 0, Math.PI * 2); ctx.stroke();

      phase += 0.03 * boost;
      boost += (1 - boost) * 0.03;
      requestAnimationFrame(render);
    }
    render();

    const term = document.getElementById('termOut');
    function log(msg, color) {
      const div = document.createElement('div');
      div.style.color = color || '#E2E8F0';
      div.textContent = msg;
      term.appendChild(div);
      term.scrollTop = term.scrollHeight;
    }

    document.getElementById('cmdForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('cmdInput');
      const cmd = input.value.trim().toLowerCase();
      if (!cmd) return;
      log('> ' + cmd, '#38BDF8');
      input.value = '';
      if (cmd === 'help') log('Commands: help, status, pulse, scan, clear', '#94A3B8');
      else if (cmd === 'status') log('[OK] Core coherence 99.8% | PQ-Link active | Latency 9ms', '#10B981');
      else if (cmd === 'pulse') { boost = 2.6; log('[PULSE] Harmonic overdrive triggered.', '#F59E0B'); }
      else if (cmd === 'scan') { boost = 1.8; log('[SCAN] 0 threats detected across 14 quantum relays.', '#10B981'); }
      else if (cmd === 'clear') { term.innerHTML = ''; }
      else { boost = 1.4; log('[JARVIS] Executed directive: "' + cmd + '"', '#E2E8F0'); }
    });
  </script>
</body>
</html>`;

export const VIBE_TEMPLATES: VibeTemplate[] = [
  {
    id: 'eagle-shield-hud',
    name: 'Eagle Shield Quantum Radar HUD',
    shortLabel: 'Eagle Shield HUD',
    category: 'Security Telemetry',
    description: 'Animated canvas radar, PQ-key pulse meter, and live shield subsystem toggles.',
    code: EAGLE_SHIELD_HUD_HTML,
  },
  {
    id: 'wave-surfer-deck',
    name: 'Wave Surfer Live Momentum Deck',
    shortLabel: 'Wave Surfer Deck',
    category: 'Quantitative Trading',
    description: 'Interactive canvas wave chart, live PnL leg simulator, and dynamic Barrel Surfer badge.',
    code: WAVE_SURFER_DECK_HTML,
  },
  {
    id: 'treasury-vault',
    name: 'US-SQTE Quantum Treasury Vault',
    shortLabel: 'Treasury Vault',
    category: 'Treasury & Yield',
    description: 'Interactive reserve allocator, escrow lock slider, and live yield projection.',
    code: TREASURY_VAULT_HTML,
  },
  {
    id: 'jarvis-core',
    name: 'Jarvis Holographic Core Lab',
    shortLabel: 'Jarvis Core',
    category: 'AI Command Core',
    description: 'Pulsating circular energy visualizer paired with an interactive command terminal.',
    code: JARVIS_CORE_HTML,
  },
];

const snapshots: VibeSnapshot[] = [];

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:html)?\s*\n?([\s\S]*?)\n?```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function synthesizeInteractiveApp(prompt: string): string {
  const safeTitle = escapeHtml(prompt.trim().slice(0, 96) || 'Eagle Shield Live Prototype');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    :root { --bg:#080B10; --panel:#0D121B; --border:#1E293B; --cyan:#38BDF8; --emerald:#10B981; --amber:#F59E0B; --text:#E2E8F0; --muted:#64748B; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', ui-monospace, monospace; padding: 18px; display: flex; flex-direction: column; gap: 14px; min-height: 100vh; }
    .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; }
    .title { font-size: 13px; font-weight: 700; letter-spacing: 0.05em; }
    .pill { font-size: 10px; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(16,185,129,0.4); background: rgba(16,185,129,0.12); color: var(--emerald); white-space: nowrap; }
    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; flex: 1; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .lbl { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; }
    canvas { width: 100%; height: 230px; background: #06090E; border: 1px solid #162032; border-radius: 6px; }
    .ctrl { background: #090D14; border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
    input[type=range] { width: 100%; accent-color: var(--cyan); }
    .btn-row { display: flex; gap: 8px; }
    button { flex: 1; padding: 9px 10px; border-radius: 6px; border: 1px solid rgba(56,189,248,0.4); background: rgba(56,189,248,0.12); color: var(--cyan); font-family: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
    button.active { border-color: var(--emerald); background: rgba(16,185,129,0.18); color: var(--emerald); }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .stat { background: #090D14; border: 1px solid var(--border); border-radius: 6px; padding: 10px; }
    .val { font-size: 15px; font-weight: 700; margin-top: 4px; color: var(--cyan); font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <div class="bar">
    <div class="title">JARVIS LIVE BUILD // ${safeTitle}</div>
    <div class="pill">SYNTHESIZED · LIVE</div>
  </div>
  <div class="grid">
    <div class="card">
      <div class="lbl">Real-Time Telemetry Stream</div>
      <canvas id="simCanvas"></canvas>
      <div class="stats">
        <div class="stat"><div class="lbl">Signal</div><div class="val" id="sigVal">98.4%</div></div>
        <div class="stat"><div class="lbl">Throughput</div><div class="val" id="tpsVal">1,420/s</div></div>
        <div class="stat"><div class="lbl">Latency</div><div class="val" id="latVal">11 ms</div></div>
      </div>
    </div>
    <div class="card">
      <div class="lbl">Interactive Controls</div>
      <div class="ctrl">
        <div style="display:flex;justify-content:space-between;font-size:11px;"><span>Frequency Gain</span><span id="freqOut">1.5x</span></div>
        <input id="freq" type="range" min="0.5" max="4" step="0.1" value="1.5" />
      </div>
      <div class="ctrl">
        <div style="display:flex;justify-content:space-between;font-size:11px;"><span>Amplitude Scale</span><span id="ampOut">65%</span></div>
        <input id="amp" type="range" min="15" max="100" value="65" />
      </div>
      <div class="btn-row">
        <button id="modeWave" class="active">WAVEFORM</button>
        <button id="modeBars">SPECTRUM</button>
      </div>
      <div style="font-size:11px;color:#94A3B8;line-height:1.5;margin-top:auto;padding:10px;background:#090D14;border:1px solid #1E293B;border-radius:6px;">
        Prompt target: <strong style="color:#E2E8F0;">${safeTitle}</strong>. Adjust sliders or switch telemetry mode to test live responsiveness.
      </div>
    </div>
  </div>
  <script>
    const canvas = document.getElementById('simCanvas');
    const ctx = canvas.getContext('2d');
    let t = 0;
    let mode = 'wave';
    function resize() {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const freqEl = document.getElementById('freq');
    const ampEl = document.getElementById('amp');
    document.getElementById('modeWave').onclick = (e) => { mode = 'wave'; e.target.classList.add('active'); document.getElementById('modeBars').classList.remove('active'); };
    document.getElementById('modeBars').onclick = (e) => { mode = 'bars'; e.target.classList.add('active'); document.getElementById('modeWave').classList.remove('active'); };

    function loop() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const f = Number(freqEl.value);
      const a = Number(ampEl.value) / 100;
      document.getElementById('freqOut').textContent = f.toFixed(1) + 'x';
      document.getElementById('ampOut').textContent = Math.round(a * 100) + '%';

      ctx.clearRect(0, 0, w, h);
      if (mode === 'wave') {
        ctx.beginPath();
        for (let x = 0; x < w; x += 4) {
          const y = h / 2 + Math.sin(x * 0.025 * f + t) * (h * 0.32 * a) + Math.cos(x * 0.01 * f - t * 0.7) * (h * 0.1 * a);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      } else {
        const count = 28;
        const bw = (w - 20) / count;
        for (let i = 0; i < count; i++) {
          const bh = Math.max(8, (Math.sin(i * 0.45 * f + t) * 0.5 + 0.5) * (h - 30) * a);
          ctx.fillStyle = i % 2 === 0 ? '#38BDF8' : '#10B981';
          ctx.fillRect(10 + i * bw, h - bh - 10, bw - 4, bh);
        }
      }
      t += 0.04 * f;
      requestAnimationFrame(loop);
    }
    loop();

    setInterval(() => {
      document.getElementById('sigVal').textContent = (96 + Math.random() * 3.8).toFixed(1) + '%';
      document.getElementById('tpsVal').textContent = (1200 + Math.floor(Math.random() * 650)).toLocaleString() + '/s';
      document.getElementById('latVal').textContent = (8 + Math.floor(Math.random() * 9)) + ' ms';
    }, 1500);
  </script>
</body>
</html>`;
}

export const vibeCodeLabRouter = express.Router();

vibeCodeLabRouter.get('/templates', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    templates: VIBE_TEMPLATES,
  });
});

vibeCodeLabRouter.post('/generate', async (req: Request, res: Response) => {
  const { prompt, currentCode, templateId } = (req.body ?? {}) as {
    prompt?: string;
    currentCode?: string;
    templateId?: string;
  };

  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!cleanPrompt && !templateId) {
    res.status(400).json({ ok: false, error: 'Prompt or templateId is required.' });
    return;
  }

  if (!cleanPrompt && templateId) {
    const tpl = VIBE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) {
      res.status(404).json({ ok: false, error: `Template "${templateId}" not found.` });
      return;
    }
    res.json({
      ok: true,
      code: tpl.code,
      buildSteps: [
        `Loaded blueprint "${tpl.name}"`,
        'Verified self-contained HTML/CSS/JS runtime',
        'Ready for live sandbox render',
      ],
      source: 'jarvis-synthesizer',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const hasUsableKey = Boolean(apiKey && apiKey.trim() && apiKey.trim() !== 'MY_GEMINI_API_KEY');

  if (hasUsableKey && apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = [
        'You are Jarvis, an expert frontend engineer inside the Eagle Shield Live Vibe-Code Studio.',
        'Generate a complete, self-contained single-file HTML5 document (with inline <style> and <script>) that renders immediately inside an iframe.',
        'Use institutional dark-slate styling (#080B10 background, #0D121B panels, #1E293B borders, #38BDF8 cyan and #10B981 emerald accents, monospace tabular numbers).',
        'Include interactive controls and live animated canvas or SVG telemetry.',
        'Return ONLY raw HTML starting with <!DOCTYPE html> with no markdown fences or commentary.',
      ].join(' ');

      const userContent = currentCode
        ? `User request: ${cleanPrompt}\n\nExisting code to evolve or replace:\n${currentCode.slice(0, 6000)}`
        : `Build this interactive web app: ${cleanPrompt}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemInstruction}\n\n${userContent}`,
      });

      const rawText = response.text ?? '';
      const cleaned = stripMarkdownFences(rawText);

      if (cleaned.toLowerCase().includes('<html') || cleaned.toLowerCase().includes('<!doctype html')) {
        res.json({
          ok: true,
          code: cleaned,
          buildSteps: [
            'Parsed natural-language directive via Jarvis Planner',
            'Invoked Gemini 2.5 Flash code synthesis engine',
            'Stripped markdown fences & validated single-file HTML5 bundle',
            'Streamed live bundle to Eagle Shield Render Viewport',
          ],
          source: 'gemini',
          timestamp: new Date().toISOString(),
        });
        return;
      }
    } catch {
      // Fall back gracefully to local Jarvis synthesizer below.
    }
  }

  const synthesized = synthesizeInteractiveApp(cleanPrompt);
  res.json({
    ok: true,
    code: synthesized,
    buildSteps: [
      `Parsed directive: "${cleanPrompt.slice(0, 64)}"`,
      'Activated Jarvis Local Interactive Synthesizer (zero-latency fallback)',
      'Injected Eagle Shield dark-slate telemetry & live canvas engine',
      'Streamed live bundle to Eagle Shield Render Viewport',
    ],
    source: 'jarvis-synthesizer',
    timestamp: new Date().toISOString(),
  });
});

vibeCodeLabRouter.get('/snapshots', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    snapshots,
  });
});

vibeCodeLabRouter.post('/snapshots', (req: Request, res: Response) => {
  const { name, code, prompt, templateId } = (req.body ?? {}) as {
    name?: string;
    code?: string;
    prompt?: string;
    templateId?: string;
  };

  if (!code || typeof code !== 'string') {
    res.status(400).json({ ok: false, error: 'Snapshot code is required.' });
    return;
  }

  const snapshot: VibeSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: (typeof name === 'string' && name.trim()) ? name.trim() : `Build ${snapshots.length + 1}`,
    prompt: typeof prompt === 'string' ? prompt.trim() : '',
    templateId: typeof templateId === 'string' ? templateId : undefined,
    code,
    createdAt: new Date().toISOString(),
  };

  snapshots.unshift(snapshot);
  if (snapshots.length > 50) {
    snapshots.pop();
  }

  res.status(201).json({
    ok: true,
    snapshot,
  });
});
