import React from 'react';
import {
  Globe,
  Shield,
  Activity,
  Layers,
  Fuel,
  Terminal,
  Cpu,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  CheckCircle2
} from 'lucide-react';
import { SovereignSeal } from './SovereignSeal';

interface MinimalHeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  gasPriceGwei: number;
  gasTankUsd: number;
}

export const MinimalHeader: React.FC<MinimalHeaderProps> = ({
  currentTab,
  onSelectTab,
  gasPriceGwei,
  gasTankUsd,
}) => {
  const primaryNavItems = [
    { id: 'COINBASE_CHAMPIONSHIP', label: 'Championship', tag: 'Rank #1' },
    { id: 'WAVE_SURFER_TREASURY', label: 'Wave Surfer', tag: 'Tier 3' },
    { id: 'EAGLE_SHIELD_QUANTUM', label: 'Eagle Shield', tag: 'US-SQTE' },
    { id: 'SOVEREIGN_OS_CORE', label: 'Sovereign OS', tag: 'Kernel' },
    { id: 'BOT_HQ', label: 'Bot HQ', tag: '4 Agents' },
    { id: 'CLOUDFLARE_EDGE_WORKER', label: 'Edge Worker', tag: 'Auto-Win' },
    { id: 'COMPLIANCE_AUDIT_CHAIN', label: 'Audit Chain', tag: 'HMAC' },
    { id: 'MT5_MOBILE_EA', label: 'MT5 Mobile', tag: 'No-VPS' },
    { id: 'ALPACA_MCP_BOT', label: 'Alpaca MCP', tag: 'Paper' },
    { id: 'FORMAL_VERIFICATION', label: 'Lean 4 Proof', tag: 'Gate' },
    { id: 'AI_ECOSYSTEM_HUB', label: 'AI Hub', tag: '10 Tools' },
    { id: 'JARVIS_BUILDER', label: 'Jarvis Dial Out', tag: ':8081' },
    { id: 'DEVICE_SANDBOX_MAPPING', label: 'Desktop Sync', tag: 'Bridge' },
  ];

  return (
    <header className="border-b border-white/[0.06] bg-[#080B10]/95 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Brand Anchor */}
        <div 
          onClick={() => onSelectTab('COINBASE_CHAMPIONSHIP')}
          className="flex items-center gap-2.5 cursor-pointer select-none group shrink-0"
        >
          <div className="w-8 h-8 rounded-lg bg-[#0D121B] border border-white/[0.08] flex items-center justify-center group-hover:border-emerald-500/40 transition-colors">
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight text-white">AEGENTIX</span>
            <span className="hidden xl:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              Championship Desk
            </span>
          </div>
        </div>

        {/* Clean Center Navigation */}
        <nav className="hidden md:flex items-center gap-1 bg-[#0D121B] border border-white/[0.06] p-1 rounded-xl overflow-x-auto max-w-full">
          {primaryNavItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent'
                }`}
              >
                <span>{item.label}</span>
                {item.tag && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isActive ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/[0.04] text-zinc-500'
                  }`}>
                    {item.tag}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Status Indicator */}
        <div className="flex items-center gap-2 font-mono text-xs shrink-0">
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0D121B] border border-white/[0.06] text-zinc-400 tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Base {gasPriceGwei} Gwei</span>
          </div>

          <button
            onClick={() => onSelectTab('AEGENTIS_OS')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#0D121B] text-zinc-300 border border-white/[0.08] hover:border-white/20 transition-all cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Modules</span>
          </button>

          <button
            onClick={() => onSelectTab('PORTAL_LANDING')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#0D121B] text-zinc-400 border border-white/[0.08] hover:text-white hover:border-white/20 transition-all cursor-pointer"
          >
            <span>Portal</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default MinimalHeader;
