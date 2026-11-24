import express, { type Request, type Response } from 'express';

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

export interface PromptGenerationRequest {
  toolId?: string;
  topic?: string;
}

export interface PromptGenerationResponse {
  toolId: string;
  toolName: string;
  category: AiToolCategory;
  topic: string;
  prompt: string;
  tips: string[];
  generatedAt: string;
}

const INITIAL_TOOLS: AiEcosystemTool[] = [
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

const toolsState: AiEcosystemTool[] = INITIAL_TOOLS.map((tool) => ({ ...tool }));

function buildTailoredPrompt(tool: AiEcosystemTool, rawTopic: string): { prompt: string; tips: string[] } {
  const topic = rawTopic.trim();

  switch (tool.id) {
    case 'napkin-ai':
      return {
        prompt: `Create a clean, executive-ready visual diagram explaining "${topic}" for Aegentix. Break the concept into 4-6 logical stages with directional flow arrows, concise 3-5 word node labels, and a 1-line takeaway caption under each stage. Style: dark-slate institutional minimalism with high-contrast typography.`,
        tips: [
          'Paste the generated text into Napkin AI and click the spark icon to cycle through Flow, Matrix, and Hub layouts.',
          'Export as SVG for crisp rendering inside Aegentix decks and docs.',
        ],
      };
    case 'gamma':
      return {
        prompt: `Generate an 8-slide institutional presentation on "${topic}" for the Aegentix team. Slide structure: (1) Executive Thesis, (2) Context & Opportunity, (3) Core Architecture / Framework, (4) Operational Workflow, (5) Key Metrics & Benchmarks, (6) Risks & Guardrails, (7) 90-Day Execution Plan, (8) Decision Ask. Keep copy tight, data-forward, and dark-theme ready.`,
        tips: [
          'Choose "Generate from notes" in Gamma and set text density to Concise.',
          'Apply a dark slate theme to match Aegentix brand guidelines.',
        ],
      };
    case 'elevenlabs':
      return {
        prompt: `[Voice Direction: Authoritative, calm, studio-broadcast tone | Speed: 1.0x | Stability: 0.65 | Clarity: 0.80]\n\n"Aegentix Intelligence Brief: ${topic}. Here is what matters right now. First, the core signal driving this shift. Second, how our workflow adapts without adding operational friction. And third, the single action item to execute today."`,
        tips: [
          'Use Eleven Multilingual v2 or Flash v2.5 for lowest latency.',
          'Add short line breaks to create natural broadcast pacing.',
        ],
      };
    case 'perplexity-ai':
      return {
        prompt: `Research "${topic}" in the context of 2026 enterprise AI and Aegentix operations. Provide: (1) a 3-sentence executive summary, (2) a comparison table of top approaches/players with verifiable metrics, (3) key risks or blind spots, and (4) inline citations to primary sources published within the last 12 months.`,
        tips: [
          'Enable Pro Search or Deep Research for multi-step source verification.',
          'Export citations directly into your Aegentix research vault.',
        ],
      };
    case 'udio':
      return {
        prompt: `Instrumental audio track inspired by "${topic}" for Aegentix media. Mood: focused, modern, cinematic tech-minimalism. Instrumentation: warm analog synth pads, subtle sub-bass pulse, crisp percussion, clean spatial reverb. Tempo: 106 BPM. Structure: atmospheric intro -> steady groove -> clean outro. No vocals.`,
        tips: [
          'Enable Manual Mode in Udio if you want strict adherence to genre and tempo tags.',
          'Use Extend to build a seamless 60-second background loop.',
        ],
      };
    case 'consensus':
      return {
        prompt: `What does peer-reviewed scientific literature conclude about "${topic}"? Synthesize the strongest empirical findings, note where studies disagree, highlight effect sizes or sample constraints, and list the top 5 most-cited papers with publication years.`,
        tips: [
          'Toggle the Consensus Meter on to see rapid yes/no/mixed evidence distribution.',
          'Filter by Study Type (Meta-Analysis / Systematic Review) for highest signal.',
        ],
      };
    case 'ideogram':
      return {
        prompt: `Editorial Swiss-style dark-mode visual for "${topic}", designed for Aegentix. Deep obsidian slate background (#080B10), 1px hairline geometric grid, subtle emerald and cyan data-accent glow, ultra-crisp sans-serif headline typography reading "${topic.toUpperCase().slice(0, 42)}", balanced negative space, studio quality, no clutter.`,
        tips: [
          'Use Ideogram 2.0+ with Design style preset for sharpest typography.',
          'Select 16:9 for hero banners or 1:1 for social cards.',
        ],
      };
    case 'tome':
      return {
        prompt: `Create a narrative-driven 7-page interactive Tome presentation on "${topic}" for Aegentix stakeholders. Frame it as a strategic story: The Tension -> The Insight -> The Aegentix Solution -> Live Proof -> Strategic Impact -> Implementation Timeline -> Next Step. Keep each tile scannable with one bold headline and three crisp bullets.`,
        tips: [
          'Pair each Tome tile with a clean diagram exported from Napkin AI or Ideogram.',
          'Share the live link for async executive review.',
        ],
      };
    case 'suno':
      return {
        prompt: `[Style: Modern electronic / cinematic tech anthem, 116 BPM, punchy bassline, bright arpeggiated synths, clean studio mix]\n[Theme: ${topic} — Aegentix Launch Edition]\nCreate an energetic, broadcast-ready 30-to-60 second instrumental opener with a memorable melodic hook and a crisp final hit.`,
        tips: [
          'Toggle Instrumental ON for background/keynote usage.',
          'Generate two variations and pick the cleanest intro transient.',
        ],
      };
    case 'notebooklm':
      return {
        prompt: `Ground your analysis strictly in my uploaded sources regarding "${topic}" for Aegentix. Produce: (1) an Executive Briefing (max 200 words), (2) a Key Claims & Evidence matrix with source citations, (3) 5 tough questions a skeptical reviewer would ask, and (4) an outline for a 5-minute Audio Overview.`,
        tips: [
          'Upload PDFs, Google Docs, or URLs first so NotebookLM stays 100% source-grounded.',
          'Click "Customize" on Audio Overview and paste the focus instructions.',
        ],
      };
    default:
      return {
        prompt: `Create an institutional, high-signal Aegentix deliverable for "${topic}" using ${tool.name}. Focus on clarity, verifiable structure, and immediate execution readiness.`,
        tips: ['Iterate once to tighten formatting and remove filler copy.'],
      };
  }
}

export const aiEcosystemHubRouter = express.Router();

// GET /api/ai-hub/tools
aiEcosystemHubRouter.get('/tools', (_req: Request, res: Response) => {
  const byCategory: Record<AiToolCategory, number> = {
    'Visuals & Decks': 0,
    'Voice & Audio': 0,
    'Research & Brain': 0,
    'Media & Music': 0,
  };

  let enabledCount = 0;
  for (const tool of toolsState) {
    byCategory[tool.category] += 1;
    if (tool.enabled) {
      enabledCount += 1;
    }
  }

  res.json({
    tools: toolsState,
    stats: {
      total: toolsState.length,
      enabled: enabledCount,
      byCategory,
    },
    updatedAt: new Date().toISOString(),
  });
});

// POST /api/ai-hub/tools/:id/toggle
aiEcosystemHubRouter.post('/tools/:id/toggle', (req: Request, res: Response) => {
  const { id } = req.params;
  const tool = toolsState.find((item) => item.id === id);

  if (!tool) {
    res.status(404).json({ error: `AI tool "${id}" not found.` });
    return;
  }

  tool.enabled = !tool.enabled;
  const enabledCount = toolsState.filter((item) => item.enabled).length;

  res.json({
    tool,
    enabledCount,
    updatedAt: new Date().toISOString(),
  });
});

// POST /api/ai-hub/prompt/generate
aiEcosystemHubRouter.post('/prompt/generate', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as PromptGenerationRequest;
  const toolId = typeof body.toolId === 'string' ? body.toolId.trim() : '';
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';

  if (!toolId) {
    res.status(400).json({ error: 'Missing required field: toolId' });
    return;
  }

  if (!topic) {
    res.status(400).json({ error: 'Missing required field: topic' });
    return;
  }

  const tool = toolsState.find((item) => item.id === toolId);
  if (!tool) {
    res.status(404).json({ error: `AI tool "${toolId}" not found.` });
    return;
  }

  const { prompt, tips } = buildTailoredPrompt(tool, topic);

  const responsePayload: PromptGenerationResponse = {
    toolId: tool.id,
    toolName: tool.name,
    category: tool.category,
    topic,
    prompt,
    tips,
    generatedAt: new Date().toISOString(),
  };

  res.json(responsePayload);
});
