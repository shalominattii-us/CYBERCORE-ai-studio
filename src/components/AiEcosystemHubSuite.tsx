import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Mic,
  Music,
  Pin,
  PinOff,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react';

export type AiToolCategory =
  | 'Visuals & Decks'
  | 'Voice & Audio'
  | 'Research & Brain'
  | 'Media & Music';

export interface AiEcosystemTool {
  id: string;
  name: string;
  url: string;
  category: AiToolCategory;
  tagline: string;
  useCaseForAegentix: string;
  readyPrompt: string;
  enabled: boolean;
}

interface GeneratedPromptState {
  toolId: string;
  toolName: string;
  category: AiToolCategory;
  topic: string;
  prompt: string;
  tips: string[];
  generatedAt: string;
}

type CategoryFilter = 'All' | AiToolCategory;

const FALLBACK_TOOLS: AiEcosystemTool[] = [
  {
    id: 'napkin-ai',
    name: 'Napkin AI',
    url: 'https://www.napkin.ai',
    category: 'Visuals & Decks',
    tagline: 'Instant text-to-diagram visual storytelling for technical concepts and architecture.',
    useCaseForAegentix:
      'Convert Aegentix multi-agent architectures, signal pipelines, and trading workflows into clean executive diagrams in seconds.',
    readyPrompt:
      'Visualize the Aegentix autonomous execution pipeline: Market Telemetry -> Regime Classifier -> Risk Governor -> Multi-Agent Swarm -> Execution & Audit Ledger. Use a clean, dark-mode institutional flow with 5 labeled stages and concise callouts.',
    enabled: true,
  },
  {
    id: 'gamma',
    name: 'Gamma',
    url: 'https://gamma.app',
    category: 'Visuals & Decks',
    tagline: 'AI-native presentation decks, memos, and interactive briefs without slide formatting.',
    useCaseForAegentix:
      'Generate investor updates, Aegentix product briefs, and client onboarding decks directly from structured bullet outlines.',
    readyPrompt:
      'Create a 10-slide institutional executive deck introducing Aegentix AI Studio: Problem (fragmented workflows), Solution (unified command hub), Architecture, Live Telemetry, Security & Governance, Unit Economics, Roadmap, and Call to Action. Tone: crisp, quantitative, dark-slate aesthetic.',
    enabled: true,
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    url: 'https://elevenlabs.io',
    category: 'Voice & Audio',
    tagline: 'Studio-grade neural voice synthesis, dubbing, and low-latency conversational audio.',
    useCaseForAegentix:
      'Power Aegentix executive briefings, automated morning market audio summaries, and multilingual product walkthroughs.',
    readyPrompt:
      '[Voice: Calm, authoritative studio narrator | Pace: 1.0x | Stability: 0.65] "Good morning. Here is your Aegentix Command Brief. Overnight telemetry shows three regime shifts across core markets, zero risk breaches, and two priority swarm deliverables ready for review."',
    enabled: true,
  },
  {
    id: 'perplexity-ai',
    name: 'Perplexity AI',
    url: 'https://www.perplexity.ai',
    category: 'Research & Brain',
    tagline: 'Real-time cited answer engine for deep competitive intelligence and market synthesis.',
    useCaseForAegentix:
      'Run rapid, source-verified competitive scans, regulatory checks, and live macro briefings for Aegentix decision memos.',
    readyPrompt:
      'Conduct a cited 2026 competitive intelligence brief on autonomous AI studio platforms and multi-agent command hubs. Compare pricing, latency, enterprise governance, and key differentiators in a markdown table with primary source links.',
    enabled: true,
  },
  {
    id: 'udio',
    name: 'Udio',
    url: 'https://www.udio.com',
    category: 'Media & Music',
    tagline: 'High-fidelity AI music production with granular stem-level sonic texture.',
    useCaseForAegentix:
      'Compose bespoke sonic branding, product launch trailers, and ambient focus soundscapes for Aegentix studio sessions.',
    readyPrompt:
      'Instrumental cyber-minimalist electronic score, 108 BPM, warm analog Juno-106 pads, crisp sub-bass pulse, subtle modular arpeggios, cinematic tension building to a clean institutional resolve, studio-mastered, no vocals.',
    enabled: false,
  },
  {
    id: 'consensus',
    name: 'Consensus',
    url: 'https://consensus.app',
    category: 'Research & Brain',
    tagline: 'Peer-reviewed scientific search engine extracting evidence directly from academic papers.',
    useCaseForAegentix:
      'Ground Aegentix quantitative models, agent evaluation frameworks, and human-in-the-loop UX in peer-reviewed research.',
    readyPrompt:
      'What does peer-reviewed research show about multi-agent LLM orchestration reliability, verification loops, and hallucination reduction compared to single-agent chains? Summarize consensus findings with study citations.',
    enabled: true,
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    url: 'https://ideogram.ai',
    category: 'Visuals & Decks',
    tagline: 'Precision AI image generation with industry-leading typography and brand layout control.',
    useCaseForAegentix:
      'Design crisp launch posters, UI hero banners, social cards, and typographic badges for Aegentix releases.',
    readyPrompt:
      'Minimalist institutional tech poster on deep obsidian slate (#080B10), hairline geometric grid, subtle cyan and emerald telemetry accents, bold clean sans-serif typography reading "AEGENTIX COMMAND HUB 2026", ultra-sharp, editorial Swiss design.',
    enabled: true,
  },
  {
    id: 'tome',
    name: 'Tome',
    url: 'https://tome.app',
    category: 'Visuals & Decks',
    tagline: 'Narrative-driven visual storytelling and interactive sales & strategy presentations.',
    useCaseForAegentix:
      'Craft persuasive interactive pitch narratives and customer case studies that combine live copy with clean visual pacing.',
    readyPrompt:
      'Build an interactive 8-tile narrative story titled "From Chaos to Command: How Aegentix Unifies AI Operations." Structure: Hook, Operational Bottleneck, The Swarm Paradigm, Before/After Metrics, Security Posture, and Next Steps.',
    enabled: false,
  },
  {
    id: 'suno',
    name: 'Suno',
    url: 'https://suno.com',
    category: 'Media & Music',
    tagline: 'Full-song AI audio generation for hooks, jingles, anthems, and rapid creative demos.',
    useCaseForAegentix:
      'Produce high-energy promo tracks, podcast intros, and event walk-on music for Aegentix media campaigns.',
    readyPrompt:
      'Genre: Modern synthwave / tech-house intro, 118 BPM, punchy kick, shimmering plucks, futuristic broadcast energy, 30-second clean instrumental loop suitable for a product keynote opener.',
    enabled: false,
  },
  {
    id: 'notebooklm',
    name: 'NotebookLM',
    url: 'https://notebooklm.google.com',
    category: 'Research & Brain',
    tagline: 'Source-grounded AI research workspace with Audio Overviews and cross-document synthesis.',
    useCaseForAegentix:
      'Ingest Aegentix SOPs, architecture specs, and transcripts to generate grounded Q&A, study guides, and executive Audio Overviews.',
    readyPrompt:
      'Using only the uploaded Aegentix architecture and strategy documents, generate: (1) a 5-bullet executive synthesis, (2) a table of open risks and mitigations, and (3) a 5-minute Audio Overview script highlighting key decisions.',
    enabled: true,
  },
];

const CATEGORY_TABS: CategoryFilter[] = [
  'All',
  'Visuals & Decks',
  'Voice & Audio',
  'Research & Brain',
  'Media & Music',
];

function getCategoryIcon(category: AiToolCategory) {
  switch (category) {
    case 'Visuals & Decks':
      return Layers;
    case 'Voice & Audio':
      return Mic;
    case 'Research & Brain':
      return Brain;
    case 'Media & Music':
      return Music;
  }
}

function getCategoryBadgeClasses(category: AiToolCategory): string {
  switch (category) {
    case 'Visuals & Decks':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
    case 'Voice & Audio':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'Research & Brain':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'Media & Music':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-300';
  }
}

function buildLocalFallbackPrompt(tool: AiEcosystemTool, topic: string): GeneratedPromptState {
  return {
    toolId: tool.id,
    toolName: tool.name,
    category: tool.category,
    topic,
    prompt: `Aegentix ${tool.name} Brief — Topic: "${topic}". Produce an institutional, high-signal output tailored for ${tool.name} (${tool.category}). Structure with clear hierarchy, concise executive language, and zero filler.`,
    tips: [
      `Launch ${tool.name} and paste this prompt directly into a new workspace.`,
      'Refine once with target audience or length constraints if needed.',
    ],
    generatedAt: new Date().toISOString(),
  };
}

export const AiEcosystemHubSuite: React.FC = () => {
  const [tools, setTools] = useState<AiEcosystemTool[]>(FALLBACK_TOOLS);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Prompt Studio state
  const [studioTopic, setStudioTopic] = useState('');
  const [studioToolId, setStudioToolId] = useState<string>('napkin-ai');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<GeneratedPromptState | null>(null);
  const [copiedStudio, setCopiedStudio] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTools() {
      try {
        const res = await fetch('/api/ai-hub/tools');
        if (!res.ok) return;
        const data = (await res.json()) as { tools?: AiEcosystemTool[] };
        if (!cancelled && Array.isArray(data.tools) && data.tools.length > 0) {
          setTools(data.tools);
        }
      } catch {
        // Keep local fallback dataset when API is not yet mounted
      }
    }

    void loadTools();
    return () => {
      cancelled = true;
    };
  }, []);

  const enabledCount = useMemo(
    () => tools.filter((tool) => tool.enabled).length,
    [tools],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      All: tools.length,
      'Visuals & Decks': 0,
      'Voice & Audio': 0,
      'Research & Brain': 0,
      'Media & Music': 0,
    };
    for (const tool of tools) {
      counts[tool.category] += 1;
    }
    return counts;
  }, [tools]);

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesCategory = activeCategory === 'All' || tool.category === activeCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        tool.name.toLowerCase().includes(q) ||
        tool.tagline.toLowerCase().includes(q) ||
        tool.useCaseForAegentix.toLowerCase().includes(q) ||
        tool.category.toLowerCase().includes(q)
      );
    });
  }, [tools, activeCategory, searchQuery]);

  const selectedStudioTool = useMemo(
    () => tools.find((t) => t.id === studioToolId) ?? tools[0],
    [tools, studioToolId],
  );

  async function handleCopyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for restricted clipboard contexts
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    if (key === '__studio__') {
      setCopiedStudio(true);
      window.setTimeout(() => setCopiedStudio(false), 1800);
    } else {
      setCopiedId(key);
      window.setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1800);
    }
  }

  async function handleToggleTool(id: string) {
    setTogglingId(id);
    setTools((prev) =>
      prev.map((tool) => (tool.id === id ? { ...tool, enabled: !tool.enabled } : tool)),
    );

    try {
      const res = await fetch(`/api/ai-hub/tools/${encodeURIComponent(id)}/toggle`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = (await res.json()) as { tool?: AiEcosystemTool };
        if (data.tool) {
          setTools((prev) =>
            prev.map((item) => (item.id === id ? data.tool! : item)),
          );
        }
      }
    } catch {
      // Optimistic toggle remains active locally
    } finally {
      setTogglingId(null);
    }
  }

  async function handleGeneratePrompt(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTopic = studioTopic.trim();
    if (!trimmedTopic || !selectedStudioTool) return;

    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai-hub/prompt/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolId: selectedStudioTool.id,
          topic: trimmedTopic,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as GeneratedPromptState;
        setGeneratedResult(data);
      } else {
        setGeneratedResult(buildLocalFallbackPrompt(selectedStudioTool, trimmedTopic));
      }
    } catch {
      setGeneratedResult(buildLocalFallbackPrompt(selectedStudioTool, trimmedTopic));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div
      className="min-h-screen w-full bg-[#080B10] text-slate-100 antialiased"
      style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Bar */}
        <header className="mb-6 flex flex-col gap-4 border-b border-white/[0.08] pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              Aegentix Creative Command Hub
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              2026 AI Ecosystem Directory
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              10 curated high-leverage AI platforms wired into your Aegentix workflow with 1-click launch and tailored prompt synthesis.
            </p>
          </div>

          <div
            className="flex items-center gap-3"
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
          >
            <div className="rounded-lg border border-white/[0.08] bg-[#0D121B] px-4 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                Curated Stack
              </div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                {tools.length}
                <span className="ml-1 text-xs font-normal text-slate-400">platforms</span>
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0D121B] px-4 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                Pinned Active
              </div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-400">
                {enabledCount}
                <span className="ml-1 text-xs font-normal text-slate-400">/ {tools.length}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Interactive Prompt Studio Bar */}
        <section className="mb-6 rounded-xl border border-white/[0.08] bg-[#0D121B] p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold tracking-wide text-white">
                Prompt Studio
              </h2>
              <span className="text-xs text-slate-400">
                Enter any idea or brief to generate a platform-optimized Aegentix prompt in 1 click.
              </span>
            </div>
            <span
              className="text-[11px] tabular-nums text-slate-500"
              style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
            >
              POST /api/ai-hub/prompt/generate
            </span>
          </div>

          <form
            onSubmit={handleGeneratePrompt}
            className="flex flex-col gap-3 lg:flex-row lg:items-center"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={studioTopic}
                onChange={(e) => setStudioTopic(e.target.value)}
                placeholder="e.g. Q3 autonomous trading risk architecture, investor update deck, morning macro audio brief..."
                className="w-full rounded-lg border border-white/[0.08] bg-[#080B10] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500/60"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={studioToolId}
                onChange={(e) => setStudioToolId(e.target.value)}
                aria-label="Target AI Platform"
                className="rounded-lg border border-white/[0.08] bg-[#080B10] px-3.5 py-2.5 text-sm text-slate-200 outline-none transition focus:border-cyan-500/60"
              >
                {tools.map((tool) => (
                  <option key={tool.id} value={tool.id} className="bg-[#0D121B] text-white">
                    {tool.name} ({tool.category})
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={isGenerating || !studioTopic.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'Synthesizing...' : 'Generate Prompt'}
              </button>
            </div>
          </form>

          {generatedResult && (
            <div className="mt-4 rounded-lg border border-cyan-500/25 bg-[#080B10] p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-cyan-300">
                    {generatedResult.toolName}
                  </span>
                  <span className="text-xs text-slate-500">•</span>
                  <span className="text-xs text-slate-400">
                    Topic: &ldquo;{generatedResult.topic}&rdquo;
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText(generatedResult.prompt, '__studio__')}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#0D121B] px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-500/40 hover:text-white"
                  >
                    {copiedStudio ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy Prompt
                      </>
                    )}
                  </button>
                  {selectedStudioTool && (
                    <a
                      href={selectedStudioTool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20"
                    >
                      Launch {generatedResult.toolName}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>

              <pre
                className="whitespace-pre-wrap rounded-md border border-white/[0.06] bg-[#0D121B] p-3 text-xs leading-relaxed text-slate-200"
                style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
              >
                {generatedResult.prompt}
              </pre>

              {generatedResult.tips.length > 0 && (
                <ul className="mt-2.5 space-y-1 text-xs text-slate-400">
                  {generatedResult.tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-cyan-400" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Category Tabs + Search Bar */}
        <section className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORY_TABS.map((tab) => {
              const isActive = activeCategory === tab;
              const label = tab === 'All' ? `All (${categoryCounts.All})` : tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveCategory(tab)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                      : 'border-white/[0.08] bg-[#0D121B] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
                  }`}
                >
                  <span>{label}</span>
                  {tab !== 'All' && (
                    <span
                      className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-slate-300"
                      style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                    >
                      {categoryCounts[tab]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools, use cases..."
              className="w-full rounded-lg border border-white/[0.08] bg-[#0D121B] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500/60"
            />
          </div>
        </section>

        {/* 2-Column Tool Grid */}
        {filteredTools.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#0D121B] p-10 text-center">
            <p className="text-sm text-slate-400">
              No AI platforms match your current filter. Try clearing the search bar or switching categories.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredTools.map((tool, index) => {
              const CategoryIcon = getCategoryIcon(tool.category);
              const isCopied = copiedId === tool.id;
              const isToggling = togglingId === tool.id;

              return (
                <article
                  key={tool.id}
                  className={`flex flex-col justify-between rounded-xl border bg-[#0D121B] p-5 transition ${
                    tool.enabled
                      ? 'border-white/[0.12] hover:border-cyan-500/35'
                      : 'border-white/[0.06] opacity-80 hover:border-white/[0.14] hover:opacity-100'
                  }`}
                >
                  <div>
                    {/* Card Top Row */}
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span
                            className="text-[11px] tabular-nums text-slate-500"
                            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                          >
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <h3 className="text-base font-semibold text-white">{tool.name}</h3>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${getCategoryBadgeClasses(
                              tool.category,
                            )}`}
                          >
                            <CategoryIcon className="h-3 w-3" />
                            {tool.category}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-400">{tool.tagline}</p>
                      </div>

                      {/* Pin / Active Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleTool(tool.id)}
                        disabled={isToggling}
                        title={tool.enabled ? 'Unpin from active workflow' : 'Pin to active workflow'}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          tool.enabled
                            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                            : 'border-white/[0.08] bg-[#080B10] text-slate-400 hover:border-white/[0.18] hover:text-slate-200'
                        }`}
                      >
                        {tool.enabled ? (
                          <>
                            <Pin className="h-3.5 w-3.5" />
                            Active
                          </>
                        ) : (
                          <>
                            <PinOff className="h-3.5 w-3.5" />
                            Pinned Off
                          </>
                        )}
                      </button>
                    </div>

                    {/* Aegentix Use Case */}
                    <div className="mb-3 rounded-lg border border-white/[0.06] bg-[#080B10] p-3">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Aegentix Workflow Use Case
                      </div>
                      <p className="text-xs leading-relaxed text-slate-300">
                        {tool.useCaseForAegentix}
                      </p>
                    </div>

                    {/* Ready Prompt Preview */}
                    <div className="mb-4 rounded-lg border border-white/[0.06] bg-[#080B10]/80 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Ready Aegentix Prompt
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setStudioToolId(tool.id);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-[11px] text-cyan-400 transition hover:text-cyan-300"
                        >
                          Customize in Studio
                        </button>
                      </div>
                      <p
                        className="line-clamp-3 text-[11px] leading-relaxed text-slate-400"
                        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                      >
                        {tool.readyPrompt}
                      </p>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                    <button
                      type="button"
                      onClick={() => handleCopyText(tool.readyPrompt, tool.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#080B10] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-500/40 hover:text-white"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          Copied Prompt
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy Aegentix Prompt
                        </>
                      )}
                    </button>

                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20"
                    >
                      Launch Platform
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AiEcosystemHubSuite;
