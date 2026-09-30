export type ThemeId = "slate" | "emerald" | "purple" | "ocean" | "sunset";

export interface ThemePreset {
  id: ThemeId;
  name: string;
  description: string;
  icon: string;
  // Tailwind Class Map for accurate styling
  bgMain: string;          // Main background of workspace and outer layers
  bgSidebar: string;       // Sidebar background
  borderColor: string;     // Border color for sections and divider
  bgForm: string;          // Inner form / container backgrounds
  bgInput: string;         // Plain inputs
  textMuted: string;       // For small muted descriptors or subtitles
  textMain: string;        // Primary readable text

  // Accent specific colors
  accentName: string;      // Color keyword, e.g. "emerald", "indigo"
  accentText: string;      // e.g. text-indigo-400
  accentBg: string;        // e.g. bg-indigo-600
  accentHoverBg: string;   // e.g. hover:bg-indigo-500
  accentActiveBg: string;  // e.g. active:bg-indigo-700
  accentBgMuted: string;   // e.g. bg-indigo-500/10
  accentBorderMuted: string; // e.g. border-indigo-500/20
  accentGlow: string;      // e.g. shadow-indigo-500/10 or shadow-indigo-600/30
  accentBorder: string;    // e.g. border-indigo-500
  accentTextMuted: string; // e.g. text-indigo-300

  // Chat window bubbles and message lists
  bubbleMe: string;        // Message bubble for myself
  bubbleMeBorder: string;  // Message bubble border for myself
  bubbleOther: string;     // Message bubble for other users
  bubbleOtherBorder: string; // Message bubble border for other users
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "slate",
    name: "Midnight Slate",
    description: "The classic dark dashboard layout with rich slate blues and indigo indicators.",
    icon: "🌌",
    bgMain: "bg-[#0F172A]",
    bgSidebar: "bg-[#1E293B]/50",
    borderColor: "border-slate-800",
    bgForm: "bg-[#1E293B]",
    bgInput: "bg-slate-900/90",
    textMuted: "text-slate-500",
    textMain: "text-slate-100",
    accentName: "indigo",
    accentText: "text-indigo-400",
    accentBg: "bg-indigo-600",
    accentHoverBg: "hover:bg-indigo-500",
    accentActiveBg: "active:bg-indigo-700",
    accentBgMuted: "bg-indigo-500/10",
    accentBorderMuted: "border-indigo-500/20",
    accentGlow: "shadow-indigo-500/10",
    accentBorder: "border-indigo-500",
    accentTextMuted: "text-indigo-300",
    bubbleMe: "bg-indigo-600 border-indigo-500 text-white",
    bubbleMeBorder: "border-indigo-500",
    bubbleOther: "bg-slate-800 border-slate-700/50 text-slate-200",
    bubbleOtherBorder: "border-slate-700/50"
  },
  {
    id: "emerald",
    name: "Emerald Forest",
    description: "Deep organic moss and spruce tones featuring tranquil emerald accents.",
    icon: "🌲",
    bgMain: "bg-[#061C15]",
    bgSidebar: "bg-[#0B2C24]/50",
    borderColor: "border-emerald-900/60",
    bgForm: "bg-[#0B2C24]",
    bgInput: "bg-emerald-950/80",
    textMuted: "text-emerald-600/90",
    textMain: "text-emerald-50",
    accentName: "emerald",
    accentText: "text-emerald-400",
    accentBg: "bg-emerald-600",
    accentHoverBg: "hover:bg-emerald-500",
    accentActiveBg: "active:bg-emerald-700",
    accentBgMuted: "bg-emerald-500/10",
    accentBorderMuted: "border-emerald-500/20",
    accentGlow: "shadow-emerald-500/10",
    accentBorder: "border-emerald-500",
    accentTextMuted: "text-emerald-300",
    bubbleMe: "bg-emerald-600 border-emerald-500 text-white",
    bubbleMeBorder: "border-emerald-500",
    bubbleOther: "bg-emerald-900/40 border-emerald-800/40 text-emerald-100",
    bubbleOtherBorder: "border-emerald-800/40"
  },
  {
    id: "purple",
    name: "Cyberpunk Purple",
    description: "Immersive neon cyber-vibe styling using dark violet and electric fuchsia.",
    icon: "🔮",
    bgMain: "bg-[#0B051D]",
    bgSidebar: "bg-[#180C34]/50",
    borderColor: "border-purple-900/60",
    bgForm: "bg-[#180C34]",
    bgInput: "bg-purple-950/75",
    textMuted: "text-purple-400/60",
    textMain: "text-purple-50",
    accentName: "fuchsia",
    accentText: "text-fuchsia-400",
    accentBg: "bg-fuchsia-600",
    accentHoverBg: "hover:bg-fuchsia-500",
    accentActiveBg: "active:bg-fuchsia-700",
    accentBgMuted: "bg-fuchsia-500/10",
    accentBorderMuted: "border-fuchsia-500/20",
    accentGlow: "shadow-fuchsia-500/10",
    accentBorder: "border-fuchsia-500",
    accentTextMuted: "text-fuchsia-300",
    bubbleMe: "bg-fuchsia-600 border-fuchsia-500 text-white",
    bubbleMeBorder: "border-fuchsia-500",
    bubbleOther: "bg-purple-950/40 border-purple-800/40 text-purple-100",
    bubbleOtherBorder: "border-purple-800/40"
  },
  {
    id: "ocean",
    name: "Ocean Deep",
    description: "Cool underwater explorer interface featuring navy dark currents and clear cyans.",
    icon: "🐙",
    bgMain: "bg-[#04101E]",
    bgSidebar: "bg-[#081F38]/50",
    borderColor: "border-sky-950",
    bgForm: "bg-[#081F38]",
    bgInput: "bg-sky-950/85",
    textMuted: "text-sky-600/80",
    textMain: "text-sky-50",
    accentName: "cyan",
    accentText: "text-cyan-400",
    accentBg: "bg-cyan-600",
    accentHoverBg: "hover:bg-cyan-500",
    accentActiveBg: "active:bg-cyan-700",
    accentBgMuted: "bg-cyan-500/10",
    accentBorderMuted: "border-cyan-500/20",
    accentGlow: "shadow-cyan-500/10",
    accentBorder: "border-cyan-500",
    accentTextMuted: "text-cyan-300",
    bubbleMe: "bg-cyan-600 border-cyan-500 text-white",
    bubbleMeBorder: "border-cyan-500",
    bubbleOther: "bg-sky-900/40 border-sky-850 text-cyan-50",
    bubbleOtherBorder: "border-sky-850"
  },
  {
    id: "sunset",
    name: "Crimson Sunset",
    description: "Deep warm volcanic basalt canvas utilizing fiery terracotta and gold highlights.",
    icon: "🌋",
    bgMain: "bg-[#1C0D0D]",
    bgSidebar: "bg-[#331414]/50",
    borderColor: "border-amber-950/70",
    bgForm: "bg-[#331414]",
    bgInput: "bg-orange-950/50",
    textMuted: "text-amber-700/80",
    textMain: "text-amber-50",
    accentName: "amber",
    accentText: "text-amber-400",
    accentBg: "bg-amber-600",
    accentHoverBg: "hover:bg-amber-500",
    accentActiveBg: "active:bg-amber-700",
    accentBgMuted: "bg-amber-500/10",
    accentBorderMuted: "border-amber-500/20",
    accentGlow: "shadow-amber-500/10",
    accentBorder: "border-amber-500",
    accentTextMuted: "text-amber-300",
    bubbleMe: "bg-amber-600 border-amber-500 text-white",
    bubbleMeBorder: "border-amber-500",
    bubbleOther: "bg-orange-950/30 border-orange-900/40 text-amber-100",
    bubbleOtherBorder: "border-orange-900/40"
  }
];

export function getTheme(id: ThemeId): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) || THEME_PRESETS[0];
}
