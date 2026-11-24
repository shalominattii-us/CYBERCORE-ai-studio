import React, { useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  Play,
  Save,
  Download,
  Monitor,
  Tablet,
  Smartphone,
  RotateCw,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Terminal,
  Code2,
  Shield,
  Waves,
  Landmark,
  Cpu,
  Check,
  History,
  Loader2,
} from 'lucide-react';

interface VibeTemplate {
  id: string;
  name: string;
  shortLabel: string;
  category: string;
  description: string;
  code: string;
}

interface VibeSnapshot {
  id: string;
  name: string;
  prompt: string;
  templateId?: string;
  code: string;
  createdAt: string;
}

interface BuildLogEntry {
  id: string;
  message: string;
  timestamp: string;
  source?: 'gemini' | 'jarvis-synthesizer' | 'system';
}

type ViewportSize = 'desktop' | 'tablet' | 'mobile';

const FALLBACK_EAGLE_SHIELD_HUD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Eagle Shield Quantum Radar HUD</title>
  <style>
    body { margin:0; background:#080B10; color:#E2E8F0; font-family: ui-monospace, monospace; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .box { background:#0D121B; border:1px solid #1E293B; border-radius:10px; padding:24px; text-align:center; width:min(420px, 92vw); }
    canvas { width:100%; height:220px; background:#06090E; border:1px solid #162032; border-radius:8px; margin:14px 0; display:block; }
  </style>
</head>
<body>
  <div class="box">
    <div style="font-size:12px;letter-spacing:0.12em;color:#38BDF8;font-weight:700;">EAGLE SHIELD // QUANTUM RADAR HUD</div>
    <canvas id="c"></canvas>
    <div style="font-size:11px;color:#10B981;">ML-KEM-1024 ACTIVE · LIVE SANDBOX READY</div>
  </div>
  <script>
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    let a = 0;
    function draw() {
      c.width = c.clientWidth; c.height = c.clientHeight;
      const cx = c.width/2, cy = c.height/2, r = Math.min(cx, cy) * 0.8;
      ctx.clearRect(0,0,c.width,c.height);
      ctx.strokeStyle = 'rgba(56,189,248,0.22)';
      for (let i=1;i<=3;i++){ ctx.beginPath(); ctx.arc(cx,cy,(r/3)*i,0,Math.PI*2); ctx.stroke(); }
      ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*r, cy+Math.sin(a)*r); ctx.stroke();
      a += 0.03; requestAnimationFrame(draw);
    }
    draw();
  </script>
</body>
</html>`;

const PRESET_META: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'eagle-shield-hud', label: 'Eagle Shield HUD', icon: Shield },
  { id: 'wave-surfer-deck', label: 'Wave Surfer Deck', icon: Waves },
  { id: 'treasury-vault', label: 'Treasury Vault', icon: Landmark },
  { id: 'jarvis-core', label: 'Jarvis Core', icon: Cpu },
];

export const EagleShieldVibeLabSuite: React.FC = () => {
  const [templates, setTemplates] = useState<VibeTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>('eagle-shield-hud');
  const [prompt, setPrompt] = useState<string>('');
  const [code, setCode] = useState<string>(FALLBACK_EAGLE_SHIELD_HUD);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [lastSource, setLastSource] = useState<'gemini' | 'jarvis-synthesizer' | 'blueprint'>('blueprint');
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [logOpen, setLogOpen] = useState<boolean>(true);
  const [buildLogs, setBuildLogs] = useState<BuildLogEntry[]>([
    {
      id: 'init-1',
      message: 'Eagle Shield Live Vibe-Code Studio initialized.',
      timestamp: new Date().toLocaleTimeString(),
      source: 'system',
    },
  ]);
  const [snapshots, setSnapshots] = useState<VibeSnapshot[]>([]);
  const [showSnapshots, setShowSnapshots] = useState<boolean>(false);
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);

  const appendLog = useCallback((message: string, source: BuildLogEntry['source'] = 'system') => {
    setBuildLogs((prev) => [
      ...prev.slice(-40),
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        message,
        timestamp: new Date().toLocaleTimeString(),
        source,
      },
    ]);
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadInitial = async () => {
      try {
        const res = await fetch('/api/vibe-lab/templates');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { ok: boolean; templates?: VibeTemplate[] };
        if (mounted && data.ok && Array.isArray(data.templates) && data.templates.length > 0) {
          setTemplates(data.templates);
          const hud = data.templates.find((t) => t.id === 'eagle-shield-hud') ?? data.templates[0];
          setActiveTemplateId(hud.id);
          setCode(hud.code);
          setLastSource('blueprint');
          appendLog(`Loaded default blueprint: ${hud.name}`, 'system');
        }
      } catch {
        if (mounted) {
          appendLog('Running with embedded Eagle Shield HUD fallback blueprint.', 'system');
        }
      }

      try {
        const snapRes = await fetch('/api/vibe-lab/snapshots');
        if (snapRes.ok) {
          const snapData = (await snapRes.json()) as { ok: boolean; snapshots?: VibeSnapshot[] };
          if (mounted && snapData.ok && Array.isArray(snapData.snapshots)) {
            setSnapshots(snapData.snapshots);
          }
        }
      } catch {
        // Ignore if snapshots endpoint not yet reachable
      }
    };

    void loadInitial();
    return () => {
      mounted = false;
    };
  }, [appendLog]);

  const handleSelectTemplate = async (templateId: string) => {
    setActiveTemplateId(templateId);
    const local = templates.find((t) => t.id === templateId);
    if (local) {
      setCode(local.code);
      setLastSource('blueprint');
      setIframeKey((k) => k + 1);
      appendLog(`Switched blueprint -> ${local.name}`, 'system');
      return;
    }

    try {
      const res = await fetch('/api/vibe-lab/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; code?: string; buildSteps?: string[] };
        if (data.ok && data.code) {
          setCode(data.code);
          setLastSource('blueprint');
          setIframeKey((k) => k + 1);
          (data.buildSteps ?? []).forEach((s) => appendLog(s, 'jarvis-synthesizer'));
        }
      }
    } catch {
      appendLog(`Unable to fetch blueprint "${templateId}".`, 'system');
    }
  };

  const handleBuildLive = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isBuilding) return;

    setIsBuilding(true);
    setLogOpen(true);
    appendLog(`Directive received: "${trimmed}"`, 'system');

    try {
      const res = await fetch('/api/vibe-lab/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          currentCode: code,
          templateId: activeTemplateId,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        code?: string;
        buildSteps?: string[];
        source?: 'gemini' | 'jarvis-synthesizer';
        error?: string;
      };

      if (!res.ok || !data.ok || !data.code) {
        throw new Error(data.error || `Build failed (${res.status})`);
      }

      setCode(data.code);
      const src = data.source ?? 'jarvis-synthesizer';
      setLastSource(src);
      setIframeKey((k) => k + 1);
      (data.buildSteps ?? ['Live build completed.']).forEach((step) => appendLog(step, src));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown build error';
      appendLog(`Build error: ${msg}`, 'system');
    } finally {
      setIsBuilding(false);
    }
  };

  const handleSaveSnapshot = async () => {
    const snapName = prompt.trim()
      ? prompt.trim().slice(0, 42)
      : `${activeTemplateId} · ${new Date().toLocaleTimeString()}`;

    try {
      const res = await fetch('/api/vibe-lab/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: snapName,
          prompt: prompt.trim(),
          templateId: activeTemplateId,
          code,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; snapshot?: VibeSnapshot };
        if (data.ok && data.snapshot) {
          setSnapshots((prev) => [data.snapshot as VibeSnapshot, ...prev]);
          appendLog(`Saved snapshot "${data.snapshot.name}"`, 'system');
        }
      }
    } catch {
      const localSnap: VibeSnapshot = {
        id: `local_${Date.now()}`,
        name: snapName,
        prompt: prompt.trim(),
        templateId: activeTemplateId,
        code,
        createdAt: new Date().toISOString(),
      };
      setSnapshots((prev) => [localSnap, ...prev]);
      appendLog(`Saved local snapshot "${snapName}"`, 'system');
    }

    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1800);
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTemplateId || 'eagle-shield-vibe-build'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    appendLog(`Downloaded HTML bundle (${code.length.toLocaleString()} bytes)`, 'system');
  };

  const viewportWidthClass =
    viewport === 'mobile'
      ? 'w-[390px] max-w-full'
      : viewport === 'tablet'
        ? 'w-[768px] max-w-full'
        : 'w-full';

  const lineCount = code.split('\n').length;

  return (
    <div
      className={`${
        isFullscreen ? 'fixed inset-0 z-50 p-4' : 'w-full min-h-[760px]'
      } bg-[#080B10] text-slate-200 flex flex-col gap-3 font-mono`}
    >
      {/* Top Vibe Command Bar */}
      <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h2 className="text-xs font-bold tracking-widest uppercase text-slate-100">
                Eagle Shield Live Vibe-Code Studio &amp; Render Lab
              </h2>
              <p className="text-[11px] text-slate-400">
                Real-time Jarvis synthesis · Sandboxed live HTML/CSS/JS viewport
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 tabular-nums">
              Engine: {lastSource}
            </span>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSnapshots((s) => !s)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-[#080B10] border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors tabular-nums"
              >
                <History className="w-3.5 h-3.5 text-sky-400" />
                <span>Snapshots ({snapshots.length})</span>
              </button>

              {showSnapshots && (
                <div className="absolute right-0 mt-1.5 w-72 bg-[#0D121B] border border-slate-800 rounded-lg shadow-2xl z-30 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 px-2 py-1 border-b border-slate-800/80">
                    Saved Build Snapshots
                  </div>
                  {snapshots.length === 0 ? (
                    <div className="text-xs text-slate-500 px-2 py-3 text-center">
                      No snapshots saved yet.
                    </div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/60">
                      {snapshots.map((snap) => (
                        <button
                          key={snap.id}
                          type="button"
                          onClick={() => {
                            setCode(snap.code);
                            setIframeKey((k) => k + 1);
                            setShowSnapshots(false);
                            appendLog(`Restored snapshot "${snap.name}"`, 'system');
                          }}
                          className="w-full text-left px-2 py-2 hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="text-xs text-slate-200 truncate">{snap.name}</div>
                          <div className="text-[10px] text-slate-500 tabular-nums">
                            {new Date(snap.createdAt).toLocaleTimeString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveSnapshot}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-[#080B10] border border-slate-800 hover:border-emerald-500/40 text-slate-200 transition-colors"
            >
              {savedFeedback ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Save className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{savedFeedback ? 'Saved' : 'Save Snapshot'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-[#080B10] border border-slate-800 hover:border-sky-500/40 text-slate-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Download HTML</span>
            </button>
          </div>
        </div>

        {/* Prompt Input & Build Live */}
        <form onSubmit={handleBuildLive} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what Jarvis should build live..."
            className="flex-1 bg-[#080B10] border border-slate-800 focus:border-sky-500/60 rounded-md px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <button
            type="submit"
            disabled={isBuilding || !prompt.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-bold bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-50 border border-sky-500/40 text-sky-300 transition-colors cursor-pointer"
          >
            {isBuilding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isBuilding ? 'Synthesizing...' : 'Build Live'}</span>
          </button>
        </form>

        {/* 4 Quick Blueprint Preset Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">
            Blueprints:
          </span>
          {PRESET_META.map((preset) => {
            const Icon = preset.icon;
            const active = activeTemplateId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => void handleSelectTemplate(preset.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border transition-colors ${
                  active
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                    : 'bg-[#080B10] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Split-Pane Live Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        {/* Left Pane: Code Editor + Collapsible Build Log */}
        <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg flex flex-col overflow-hidden min-h-[540px]">
          <div className="px-3 py-2 border-b border-slate-800/80 flex items-center justify-between bg-[#0A0E16]">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold">Live Source Editor</span>
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums">
              {lineCount} lines · {code.length.toLocaleString()} bytes
            </div>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            aria-label="Live HTML CSS JS Source Editor"
            className="flex-1 w-full bg-[#080B10] text-slate-200 text-[12px] leading-relaxed p-3 font-mono outline-none resize-none selection:bg-sky-500/30"
          />

          {/* Collapsible Jarvis Real-Time Build Log */}
          <div className="border-t border-slate-800/80 bg-[#0A0E16]">
            <button
              type="button"
              onClick={() => setLogOpen((o) => !o)}
              className="w-full px-3 py-2 flex items-center justify-between text-[11px] text-slate-300 hover:bg-slate-800/30 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold uppercase tracking-wider">
                  Jarvis Real-Time Build Log
                </span>
                <span className="text-[10px] text-slate-500 tabular-nums">
                  ({buildLogs.length})
                </span>
              </span>
              {logOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {logOpen && (
              <div className="max-h-36 overflow-y-auto px-3 pb-2.5 space-y-1 text-[11px] border-t border-slate-800/60 pt-2">
                {buildLogs.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 leading-snug">
                    <span className="text-slate-600 tabular-nums shrink-0">
                      [{entry.timestamp}]
                    </span>
                    <span
                      className={
                        entry.source === 'gemini'
                          ? 'text-sky-400'
                          : entry.source === 'jarvis-synthesizer'
                            ? 'text-emerald-400'
                            : 'text-slate-300'
                      }
                    >
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Live Render Viewport */}
        <div className="bg-[#0D121B] border border-slate-800/80 rounded-lg flex flex-col overflow-hidden min-h-[540px]">
          <div className="px-3 py-2 border-b border-slate-800/80 flex items-center justify-between bg-[#0A0E16]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34D399]" />
              <span className="text-xs font-semibold text-slate-200">Live Render Viewport</span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex items-center bg-[#080B10] border border-slate-800 rounded-md p-0.5">
                <button
                  type="button"
                  title="Desktop viewport"
                  onClick={() => setViewport('desktop')}
                  className={`p-1 rounded ${
                    viewport === 'desktop'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Tablet viewport"
                  onClick={() => setViewport('tablet')}
                  className={`p-1 rounded ${
                    viewport === 'tablet'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Tablet className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Mobile viewport"
                  onClick={() => setViewport('mobile')}
                  className={`p-1 rounded ${
                    viewport === 'mobile'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                title="Reload sandbox"
                onClick={() => {
                  setIframeKey((k) => k + 1);
                  appendLog('Reloaded live render sandbox.', 'system');
                }}
                className="p-1.5 rounded-md bg-[#080B10] border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen studio'}
                onClick={() => setIsFullscreen((f) => !f)}
                className="p-1.5 rounded-md bg-[#080B10] border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 bg-[#06090E] flex items-stretch justify-center overflow-auto p-2">
            <iframe
              key={iframeKey}
              title="Eagle Shield Live Render Viewport"
              srcDoc={code}
              sandbox="allow-scripts allow-forms"
              className={`${viewportWidthClass} h-full min-h-[480px] bg-[#080B10] border border-slate-800/80 rounded-md transition-all duration-200`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EagleShieldVibeLabSuite;
