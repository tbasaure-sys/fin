// UI concept mock only. The production-ready terminal implementation lives in the Python CLI.
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ScatterChart, Scatter, ZAxis, ReferenceLine
} from "recharts";
import { 
  Activity, Shield, TrendingDown, TrendingUp, AlertTriangle, 
  Eye, Zap, ChevronRight, Radio, Layers, BarChart3,
  Target, Brain, Gauge, ArrowUpRight, ArrowDownRight
} from "lucide-react";

// === DATA GENERATION ===
const SECTORS = [
  { name: "Tech", ticker: "XLK", phantom: 0.72, vol: 18.2, spectral: 0.34, trend: "compressing" },
  { name: "Financials", ticker: "XLF", phantom: 0.85, vol: 22.1, spectral: 0.21, trend: "critical" },
  { name: "Healthcare", ticker: "XLV", phantom: 0.31, vol: 14.3, spectral: 0.68, trend: "stable" },
  { name: "Energy", ticker: "XLE", phantom: 0.58, vol: 28.7, spectral: 0.45, trend: "degrading" },
  { name: "Consumer Disc", ticker: "XLY", phantom: 0.67, vol: 19.8, spectral: 0.38, trend: "compressing" },
  { name: "Industrials", ticker: "XLI", phantom: 0.44, vol: 16.5, spectral: 0.55, trend: "stable" },
  { name: "Utilities", ticker: "XLU", phantom: 0.22, vol: 12.1, spectral: 0.78, trend: "stable" },
  { name: "Materials", ticker: "XLB", phantom: 0.61, vol: 21.3, spectral: 0.41, trend: "degrading" },
  { name: "Real Estate", ticker: "XLRE", phantom: 0.78, vol: 20.5, spectral: 0.28, trend: "critical" },
  { name: "Comm Svcs", ticker: "XLC", phantom: 0.55, vol: 17.9, spectral: 0.47, trend: "compressing" },
  { name: "Staples", ticker: "XLP", phantom: 0.18, vol: 11.2, spectral: 0.82, trend: "stable" },
];

const HEDGE_RANKING = [
  { asset: "SHY", score: 87, downCapture: -0.12, stressReturn: 2.1, carry: 4.8, corr: -0.15, status: "SELECTED" },
  { asset: "BIL", score: 72, downCapture: -0.02, stressReturn: 0.8, carry: 5.1, corr: -0.05, status: "BACKUP" },
  { asset: "GLD", score: 68, downCapture: -0.35, stressReturn: 8.4, carry: 0.0, corr: -0.22, status: "MONITOR" },
  { asset: "IEF", score: 54, downCapture: -0.28, stressReturn: 4.2, carry: 3.9, corr: 0.08, status: "MONITOR" },
  { asset: "TLT", score: 38, downCapture: -0.52, stressReturn: 6.1, carry: 3.2, corr: 0.25, status: "AVOID" },
  { asset: "UUP", score: 31, downCapture: -0.18, stressReturn: 3.5, carry: 0.5, corr: 0.12, status: "AVOID" },
];

const generateRegimeTimeline = () => {
  const months = [];
  const regimes = [
    { start: 0, end: 18, regime: "expansion", beta: 0.85 },
    { start: 18, end: 24, regime: "compression", beta: 0.55 },
    { start: 24, end: 30, regime: "stress", beta: 0.25 },
    { start: 30, end: 42, regime: "recovery", beta: 0.70 },
    { start: 42, end: 54, regime: "expansion", beta: 0.90 },
    { start: 54, end: 60, regime: "phantom", beta: 0.40 },
    { start: 60, end: 66, regime: "stress", beta: 0.20 },
    { start: 66, end: 78, regime: "recovery", beta: 0.65 },
    { start: 78, end: 90, regime: "expansion", beta: 0.80 },
    { start: 90, end: 102, regime: "phantom", beta: 0.35 },
    { start: 102, end: 108, regime: "compression", beta: 0.45 },
    { start: 108, end: 120, regime: "expansion", beta: 0.75 },
    { start: 120, end: 138, regime: "expansion", beta: 0.82 },
    { start: 138, end: 144, regime: "compression", beta: 0.50 },
    { start: 144, end: 156, regime: "phantom", beta: 0.30 },
    { start: 156, end: 168, regime: "expansion", beta: 0.85 },
    { start: 168, end: 174, regime: "phantom", beta: 0.35 },
    { start: 174, end: 180, regime: "compression", beta: 0.25 },
  ];
  
  const baseDate = new Date(2011, 0, 1);
  for (let i = 0; i < 180; i++) {
    const d = new Date(baseDate);
    d.setMonth(d.getMonth() + i);
    const r = regimes.find(r => i >= r.start && i < r.end) || regimes[regimes.length - 1];
    const spy = 1200 * Math.exp(0.008 * i + 0.04 * Math.sin(i * 0.15) - (r.regime === "stress" ? 0.15 : 0));
    months.push({
      date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      year: d.getFullYear(),
      regime: r.regime,
      beta: r.beta + (Math.random() - 0.5) * 0.1,
      spy: Math.round(spy),
      phantom: r.regime === "phantom" ? 0.7 + Math.random() * 0.25 : 
               r.regime === "stress" ? 0.85 + Math.random() * 0.15 :
               r.regime === "compression" ? 0.5 + Math.random() * 0.2 :
               0.15 + Math.random() * 0.3,
      spectralDim: r.regime === "phantom" ? 1.5 + Math.random() * 0.8 :
                   r.regime === "stress" ? 1.0 + Math.random() * 0.5 :
                   r.regime === "expansion" ? 4.0 + Math.random() * 2.0 :
                   2.5 + Math.random() * 1.5,
    });
  }
  return months;
};

const generateEigenvalues = () => {
  const current = [
    { component: "λ₁", value: 0.52, label: "Market factor" },
    { component: "λ₂", value: 0.18, label: "Rate sensitivity" },
    { component: "λ₃", value: 0.11, label: "Sector rotation" },
    { component: "λ₄", value: 0.07, label: "Momentum" },
    { component: "λ₅", value: 0.05, label: "Vol regime" },
    { component: "λ₆", value: 0.03, label: "Credit" },
    { component: "λ₇", value: 0.02, label: "Liquidity" },
    { component: "λ₈", value: 0.02, label: "Residual" },
  ];
  return current;
};

const PERFORMANCE = {
  phantom: { cagr: 14.8, sharpe: 1.42, maxDD: -12.3, calmar: 1.20, winRate: 62 },
  heuristic: { cagr: 12.2, sharpe: 1.06, maxDD: -24.0, calmar: 0.51, winRate: 55 },
  policy: { cagr: 11.4, sharpe: 1.10, maxDD: -15.1, calmar: 0.75, winRate: 58 },
  highConf: { cagr: 16.8, sharpe: 1.63, maxDD: -14.1, calmar: 1.19, winRate: 67 },
  spy: { cagr: 13.7, sharpe: 0.79, maxDD: -33.7, calmar: 0.41, winRate: 54 },
  trend: { cagr: 19.5, sharpe: 1.71, maxDD: -10.1, calmar: 1.93, winRate: 59 },
};

// === THEME ===
const C = {
  bg: "#08080d",
  bgCard: "#0f1017",
  bgCardHover: "#151620",
  border: "#1c1d2a",
  borderActive: "#2a2b3d",
  text: "#e8e6df",
  textMuted: "#8a8994",
  textDim: "#5a596a",
  accent: "#c4a35a",
  accentDim: "#8a7340",
  green: "#34d399",
  greenDim: "#065f46",
  red: "#f87171",
  redDim: "#7f1d1d",
  amber: "#fbbf24",
  amberDim: "#78350f",
  blue: "#60a5fa",
  blueDim: "#1e3a5f",
  purple: "#a78bfa",
  purpleDim: "#4c1d95",
  teal: "#2dd4bf",
  phantom: "#ef4444",
  phantomBg: "rgba(239,68,68,0.08)",
  expansion: "#34d399",
  expansionBg: "rgba(52,211,153,0.08)",
  compression: "#fbbf24",
  compressionBg: "rgba(251,191,36,0.08)",
  stress: "#f87171",
  stressBg: "rgba(248,113,113,0.08)",
  recovery: "#60a5fa",
  recoveryBg: "rgba(96,165,250,0.08)",
};

const regimeColor = (r) => ({
  phantom: C.phantom, expansion: C.green, compression: C.amber,
  stress: C.red, recovery: C.blue,
}[r] || C.textMuted);

const regimeBg = (r) => ({
  phantom: C.phantomBg, expansion: C.expansionBg, compression: C.compressionBg,
  stress: C.stressBg, recovery: C.recoveryBg,
}[r] || "transparent");

const phantomColor = (v) => {
  if (v >= 0.7) return C.red;
  if (v >= 0.5) return C.amber;
  if (v >= 0.3) return "#f59e0b";
  return C.green;
};

// === COMPONENTS ===
const Pill = ({ children, color, bg }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 10px", borderRadius: 100,
    background: bg || "rgba(255,255,255,0.05)",
    color: color || C.textMuted,
    fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
    textTransform: "uppercase", whiteSpace: "nowrap",
  }}>{children}</span>
);

const StatBox = ({ label, value, sub, color, icon: Icon }) => (
  <div style={{
    background: C.bgCard, border: `0.5px solid ${C.border}`,
    borderRadius: 8, padding: "12px 16px", flex: 1, minWidth: 120,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      {Icon && <Icon size={13} color={C.textDim} />}
      <span style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>{label}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 600, color: color || C.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
  </div>
);

const SectionHeader = ({ icon: Icon, title, right }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12, paddingBottom: 8,
    borderBottom: `0.5px solid ${C.border}`,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {Icon && <Icon size={15} color={C.accent} />}
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: "0.03em", textTransform: "uppercase" }}>{title}</span>
    </div>
    {right && <div style={{ fontSize: 11, color: C.textMuted }}>{right}</div>}
  </div>
);

const PhantomBar = ({ value, width = 120 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{ width, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
      <div style={{
        width: `${value * 100}%`, height: "100%", borderRadius: 3,
        background: `linear-gradient(90deg, ${C.green}, ${value > 0.5 ? C.amber : C.green}, ${value > 0.7 ? C.red : C.amber})`,
        transition: "width 0.6s ease",
      }} />
    </div>
    <span style={{ fontSize: 12, fontWeight: 600, color: phantomColor(value), fontVariantNumeric: "tabular-nums", minWidth: 36 }}>
      {(value * 100).toFixed(0)}%
    </span>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1a1b2e", border: `0.5px solid ${C.borderActive}`,
      borderRadius: 6, padding: "8px 12px", fontSize: 12,
    }}>
      <div style={{ color: C.textMuted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.text, display: "flex", gap: 8 }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// === MAIN TERMINAL ===
export default function PhantomTerminal() {
  const [activeView, setActiveView] = useState("command");
  const [selectedSector, setSelectedSector] = useState(null);
  const [animate, setAnimate] = useState(false);
  
  useEffect(() => { setAnimate(true); }, []);

  const timeline = useMemo(() => generateRegimeTimeline(), []);
  const eigenvalues = useMemo(() => generateEigenvalues(), []);
  const recentTimeline = useMemo(() => timeline.slice(-48), [timeline]);
  
  const effectiveDim = useMemo(() => {
    const H = eigenvalues.reduce((s, e) => s - (e.value > 0 ? e.value * Math.log(e.value) : 0), 0);
    return Math.exp(H).toFixed(2);
  }, [eigenvalues]);

  const eigenConcentration = useMemo(() => {
    return ((eigenvalues[0].value / eigenvalues.reduce((s,e) => s + e.value, 0)) * 100).toFixed(1);
  }, [eigenvalues]);

  const views = [
    { id: "command", label: "Command", icon: Radio },
    { id: "scanner", label: "Scanner", icon: Eye },
    { id: "spectral", label: "Spectral", icon: Layers },
    { id: "regime", label: "Regime", icon: Activity },
    { id: "hedge", label: "Hedge Intel", icon: Shield },
  ];

  return (
    <div style={{
      fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
      background: C.bg, color: C.text, minHeight: "100vh",
      padding: 0, margin: 0, overflowX: "hidden",
    }}>
      {/* HEADER */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: `0.5px solid ${C.border}`,
        background: "linear-gradient(180deg, #0d0d15 0%, #08080d 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: C.red,
              boxShadow: `0 0 8px ${C.red}40`,
              animation: "pulse 2s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", color: C.accent }}>PHANTOM</span>
          </div>
          <span style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.05em" }}>STRUCTURAL ALPHA TERMINAL</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Pill color={C.red} bg={C.stressBg}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.red, display: "inline-block" }} />
            REGIME: PHANTOM COMPRESSION
          </Pill>
          <span style={{ fontSize: 12, color: C.textDim, fontVariantNumeric: "tabular-nums" }}>2026-03-14 · LIVE</span>
        </div>
      </div>

      {/* NAV */}
      <div style={{
        display: "flex", gap: 0, padding: "0 20px",
        borderBottom: `0.5px solid ${C.border}`,
      }}>
        {views.map(v => {
          const Icon = v.icon;
          const active = activeView === v.id;
          return (
            <button key={v.id} onClick={() => setActiveView(v.id)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 16px", background: "transparent",
              border: "none", borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
              color: active ? C.accent : C.textDim,
              fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
              cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.2s ease",
            }}>
              <Icon size={13} />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* CONTENT */}
      <div style={{ padding: 20 }}>
        {activeView === "command" && <CommandCenter
          timeline={recentTimeline} eigenvalues={eigenvalues}
          effectiveDim={effectiveDim} eigenConcentration={eigenConcentration}
          sectors={SECTORS} hedges={HEDGE_RANKING} performance={PERFORMANCE}
        />}
        {activeView === "scanner" && <PhantomScanner sectors={SECTORS} selectedSector={selectedSector} setSelectedSector={setSelectedSector} />}
        {activeView === "spectral" && <SpectralView eigenvalues={eigenvalues} effectiveDim={effectiveDim} eigenConcentration={eigenConcentration} timeline={timeline} />}
        {activeView === "regime" && <RegimeView timeline={timeline} />}
        {activeView === "hedge" && <HedgeIntel hedges={HEDGE_RANKING} />}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>
    </div>
  );
}

// === COMMAND CENTER ===
function CommandCenter({ timeline, eigenvalues, effectiveDim, eigenConcentration, sectors, hedges, performance }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "slideIn 0.4s ease" }}>
      {/* TOP ROW: Policy + Metrics */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Current Policy Decision */}
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 2, minWidth: 0,
        }}>
          <SectionHeader icon={Target} title="Live Policy Decision" right="2026-03-14" />
          <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Equity exposure</div>
              <div style={{ fontSize: 42, fontWeight: 700, color: C.amber, lineHeight: 1 }}>25%</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Beta bucket: LOW</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Primary hedge</div>
              <div style={{ fontSize: 42, fontWeight: 700, color: C.teal, lineHeight: 1 }}>SHY</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Score: 87/100</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Conviction</div>
              <div style={{ fontSize: 42, fontWeight: 700, color: C.green, lineHeight: 1 }}>70%</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>HIGH confidence</div>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(239,68,68,0.06)", borderRadius: 6, border: `0.5px solid rgba(239,68,68,0.15)` }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 4 }}>⚡ PHANTOM SIGNAL ACTIVE</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
              Effective dimensionality collapsed to {effectiveDim}. λ₁ concentration at {eigenConcentration}%. 
              Surface vol low (VIX 14.2) but spectral structure indicates hidden fragility. 
              Reduce exposure. Prioritize carry-positive hedges.
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 200 }}>
          <div style={{
            background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
            padding: "14px 16px",
          }}>
            <SectionHeader icon={Gauge} title="Strategy metrics" right="High conf. bucket" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              {[
                { label: "CAGR", value: "16.8%", color: C.green },
                { label: "Sharpe", value: "1.63", color: C.green },
                { label: "Max DD", value: "-14.1%", color: C.amber },
                { label: "Win rate", value: "67%", color: C.blue },
              ].map(m => (
                <div key={m.label} style={{ padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: m.color, marginTop: 2 }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{
            background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
            padding: "14px 16px", flex: 1,
          }}>
            <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Signal drivers</div>
            {[
              { label: "memory_p_fail", direction: "↓", support: "β 25%" },
              { label: "tlt_score", direction: "↓", support: "β 25%" },
              { label: "tail_loss_10d", direction: "↑", support: "β 25%" },
              { label: "spectral_dim", direction: "↓", support: "PHANTOM" },
            ].map((s, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "5px 0", borderBottom: i < 3 ? `0.5px solid ${C.border}` : "none",
              }}>
                <span style={{ fontSize: 12, color: C.textMuted, fontFamily: "inherit" }}>{s.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: s.direction === "↑" ? C.red : C.green }}>{s.direction}</span>
                  <Pill color={C.amber} bg={C.compressionBg}>{s.support}</Pill>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Phantom Scanner Mini + Regime Mini */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Mini Scanner */}
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 3, minWidth: 0,
        }}>
          <SectionHeader icon={Eye} title="Phantom stability scanner" right="Cross-sector · live" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 4, marginTop: 4 }}>
            {sectors.map(s => (
              <div key={s.ticker} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 2px",
                background: s.phantom >= 0.7 ? C.phantomBg : s.phantom >= 0.5 ? C.compressionBg : "transparent",
                borderRadius: 6, border: `0.5px solid ${s.phantom >= 0.7 ? "rgba(239,68,68,0.2)" : "transparent"}`,
                transition: "all 0.3s ease",
              }}>
                <span style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>{s.ticker}</span>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: `radial-gradient(circle, ${phantomColor(s.phantom)}30, transparent)`,
                  border: `1.5px solid ${phantomColor(s.phantom)}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 700, color: phantomColor(s.phantom),
                }}>
                  {(s.phantom * 100).toFixed(0)}
                </div>
                <span style={{
                  fontSize: 8, color: regimeColor(s.trend === "critical" ? "stress" : s.trend === "compressing" ? "compression" : s.trend === "degrading" ? "phantom" : "expansion"),
                  textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em",
                }}>
                  {s.trend}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Eigenvalue Concentration */}
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 2, minWidth: 200,
        }}>
          <SectionHeader icon={Layers} title="Spectral structure" right={`D_eff = ${effectiveDim}`} />
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={eigenvalues} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="component" tick={{ fill: C.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {eigenvalues.map((e, i) => (
                  <Cell key={i} fill={i === 0 ? C.red : i < 3 ? C.amber : C.textDim} fillOpacity={i === 0 ? 0.9 : 0.6} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
            <span style={{ color: C.red, fontWeight: 600 }}>⚠ λ₁ = {eigenConcentration}%</span> — single-factor dominance. 
            Apparent diversification is phantom. Cross-asset correlations will spike under stress.
          </div>
        </div>
      </div>

      {/* Regime Timeline Mini */}
      <div style={{
        background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
        padding: 20,
      }}>
        <SectionHeader icon={Activity} title="Regime timeline" right="Last 48 months" />
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={timeline} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: C.textDim, fontSize: 9 }} axisLine={false} tickLine={false} interval={5} />
            <YAxis domain={[0, 1]} tick={{ fill: C.textDim, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="stepAfter" dataKey="phantom" name="Phantom score" stroke={C.red} fill={C.red} fillOpacity={0.08} strokeWidth={1.5} dot={false} />
            <Area type="stepAfter" dataKey="beta" name="Beta" stroke={C.accent} fill={C.accent} fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 4" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          {["expansion", "compression", "phantom", "stress", "recovery"].map(r => (
            <div key={r} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: regimeColor(r) }} />
              <span style={{ fontSize: 10, color: C.textDim, textTransform: "capitalize" }}>{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// === PHANTOM SCANNER ===
function PhantomScanner({ sectors, selectedSector, setSelectedSector }) {
  const sorted = [...sectors].sort((a, b) => b.phantom - a.phantom);
  
  return (
    <div style={{ animation: "slideIn 0.4s ease" }}>
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 2,
        }}>
          <SectionHeader icon={Eye} title="Phantom stability ranking" right="Click sector for detail" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: "140px 1fr 80px 80px 80px",
              padding: "6px 10px", gap: 8,
            }}>
              {["Sector", "Phantom score", "Vol", "D_eff", "Trend"].map(h => (
                <span key={h} style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>
            {sorted.map((s, i) => (
              <div key={s.ticker} onClick={() => setSelectedSector(s)}
                style={{
                  display: "grid", gridTemplateColumns: "140px 1fr 80px 80px 80px",
                  padding: "10px 10px", gap: 8, alignItems: "center",
                  background: selectedSector?.ticker === s.ticker ? "rgba(196,163,90,0.06)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                  borderRadius: 4, cursor: "pointer",
                  border: selectedSector?.ticker === s.ticker ? `0.5px solid ${C.accentDim}` : "0.5px solid transparent",
                  transition: "all 0.2s ease",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{s.name}</span>
                  <span style={{ fontSize: 10, color: C.textDim }}>{s.ticker}</span>
                </div>
                <PhantomBar value={s.phantom} width={180} />
                <span style={{ fontSize: 12, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{s.vol.toFixed(1)}%</span>
                <span style={{ fontSize: 12, color: s.spectral < 0.4 ? C.red : C.green, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{s.spectral.toFixed(2)}</span>
                <Pill color={regimeColor(s.trend === "critical" ? "stress" : s.trend === "compressing" ? "compression" : s.trend === "degrading" ? "phantom" : "expansion")}
                  bg={regimeBg(s.trend === "critical" ? "stress" : s.trend === "compressing" ? "compression" : s.trend === "degrading" ? "phantom" : "expansion")}>
                  {s.trend}
                </Pill>
              </div>
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 1, minWidth: 260,
        }}>
          <SectionHeader icon={Brain} title={selectedSector ? `${selectedSector.name} diagnosis` : "Select a sector"} />
          {selectedSector ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>Phantom score</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: phantomColor(selectedSector.phantom) }}>
                    {(selectedSector.phantom * 100).toFixed(0)}%
                  </div>
                </div>
                <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase" }}>Spectral dim</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: selectedSector.spectral < 0.4 ? C.red : C.green }}>
                    {selectedSector.spectral.toFixed(2)}
                  </div>
                </div>
              </div>
              <div style={{
                padding: "12px 14px", borderRadius: 6,
                background: selectedSector.phantom >= 0.7 ? C.phantomBg : selectedSector.phantom >= 0.5 ? C.compressionBg : C.expansionBg,
                border: `0.5px solid ${phantomColor(selectedSector.phantom)}20`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: phantomColor(selectedSector.phantom), marginBottom: 6 }}>
                  {selectedSector.phantom >= 0.7 ? "⚡ PHANTOM INSTABILITY DETECTED" :
                   selectedSector.phantom >= 0.5 ? "⚠ COMPRESSION WARNING" :
                   "✓ STRUCTURAL STABILITY CONFIRMED"}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
                  {selectedSector.phantom >= 0.7
                    ? `${selectedSector.name} shows surface calm with collapsed internal structure. Eigenvalue concentration suggests single-factor dependence. Diversification within this sector is illusory. Recommend underweight.`
                    : selectedSector.phantom >= 0.5
                    ? `${selectedSector.name} exhibits early compression signals. Effective dimensionality declining. Monitor spectral trajectory for regime transition.`
                    : `${selectedSector.name} maintains genuine structural diversity. Multiple independent risk factors active. Current stability assessment: REAL.`
                  }
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, textTransform: "uppercase" }}>Aligned compression decomposition</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, fontFamily: "inherit" }}>
                  <div>∂ₓM = −G − R</div>
                  <div style={{ marginTop: 6 }}>
                    <span style={{ color: C.text }}>Surface return (G):</span>{" "}
                    <span style={{ color: selectedSector.phantom >= 0.7 ? C.green : C.textMuted }}>
                      {selectedSector.phantom >= 0.7 ? "POSITIVE — masking structural loss" : "aligned with structural"}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: C.text }}>Structural return (R):</span>{" "}
                    <span style={{ color: selectedSector.phantom >= 0.7 ? C.red : C.green }}>
                      {selectedSector.phantom >= 0.7 ? "NEGATIVE — capacity eroding" : "positive — capacity intact"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.textDim, textAlign: "center", padding: "40px 0" }}>
              Click any sector row to see structural diagnosis
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// === SPECTRAL VIEW ===
function SpectralView({ eigenvalues, effectiveDim, eigenConcentration, timeline }) {
  const spectralHistory = useMemo(() => 
    timeline.filter((_, i) => i % 3 === 0).map(t => ({
      date: t.date,
      dEff: t.spectralDim,
      regime: t.regime,
    }))
  , [timeline]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "slideIn 0.4s ease" }}>
      <div style={{ display: "flex", gap: 16 }}>
        {/* Eigenvalue Decomposition */}
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 1,
        }}>
          <SectionHeader icon={Layers} title="Eigenvalue decomposition" right="Correlation matrix · current" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={eigenvalues} margin={{ top: 8, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="component" tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 0.6]} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Variance share" radius={[4, 4, 0, 0]}>
                {eigenvalues.map((e, i) => (
                  <Cell key={i} fill={i === 0 ? C.red : i < 3 ? C.amber : C.textDim} fillOpacity={1 - i * 0.08} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
            {eigenvalues.slice(0, 4).map(e => (
              <div key={e.component} style={{
                flex: 1, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6,
              }}>
                <div style={{ fontSize: 10, color: C.textDim }}>{e.component}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{(e.value * 100).toFixed(1)}%</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>{e.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 280 }}>
          <div style={{
            background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
            padding: 20,
          }}>
            <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 8 }}>Effective dimensionality</div>
            <div style={{ fontSize: 48, fontWeight: 700, color: parseFloat(effectiveDim) < 3 ? C.red : C.green }}>
              {effectiveDim}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
              D_eff = exp(−Σ pᵢ log pᵢ)
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
              {parseFloat(effectiveDim) < 3 
                ? "Below critical threshold. Market diversity is illusory — one factor drives everything." 
                : "Healthy structural diversity. Multiple independent factors contributing."}
            </div>
          </div>
          <div style={{
            background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
            padding: 20,
          }}>
            <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 8 }}>λ₁ concentration</div>
            <div style={{ fontSize: 48, fontWeight: 700, color: C.red }}>
              {eigenConcentration}%
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
              Top eigenvalue share of total variance
            </div>
            <div style={{
              marginTop: 12, height: 8, background: C.border, borderRadius: 4, overflow: "hidden",
            }}>
              <div style={{
                width: `${eigenConcentration}%`, height: "100%", borderRadius: 4,
                background: `linear-gradient(90deg, ${C.amber}, ${C.red})`,
              }} />
            </div>
          </div>
          <div style={{
            background: C.phantomBg, border: `0.5px solid rgba(239,68,68,0.2)`, borderRadius: 10,
            padding: "14px 16px",
          }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 4 }}>PHANTOM DIAGNOSIS</div>
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
              When D_eff collapses while surface volatility remains low, the market is in phantom stability. 
              Traditional risk models see calm. Spectral analysis sees fragility.
            </div>
          </div>
        </div>
      </div>

      {/* D_eff Timeline */}
      <div style={{
        background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
        padding: 20,
      }}>
        <SectionHeader icon={Activity} title="Effective dimensionality timeline" right="D_eff over time" />
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={spectralHistory} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="date" tick={{ fill: C.textDim, fontSize: 9 }} axisLine={false} tickLine={false} interval={8} />
            <YAxis domain={[0, 7]} tick={{ fill: C.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={3} stroke={C.red} strokeDasharray="6 4" strokeWidth={0.5} label={{ value: "Critical threshold", fill: C.red, fontSize: 10, position: "right" }} />
            <Area type="monotone" dataKey="dEff" name="D_eff" stroke={C.purple} fill={C.purple} fillOpacity={0.1} strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// === REGIME VIEW ===
function RegimeView({ timeline }) {
  const quarterly = useMemo(() => {
    const q = [];
    for (let i = 0; i < timeline.length; i += 3) {
      const slice = timeline.slice(i, i + 3);
      q.push({
        date: slice[0].date,
        phantom: slice.reduce((s, t) => s + t.phantom, 0) / slice.length,
        beta: slice.reduce((s, t) => s + t.beta, 0) / slice.length,
        regime: slice[1]?.regime || slice[0].regime,
        spy: slice[slice.length - 1]?.spy || slice[0].spy,
      });
    }
    return q;
  }, [timeline]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "slideIn 0.4s ease" }}>
      <div style={{
        background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
        padding: 20,
      }}>
        <SectionHeader icon={Activity} title="Full regime history" right="2011 — 2026" />
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={quarterly} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="date" tick={{ fill: C.textDim, fontSize: 9 }} axisLine={false} tickLine={false} interval={4} />
            <YAxis yAxisId="left" domain={[0, 1]} tick={{ fill: C.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: C.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area yAxisId="left" type="stepAfter" dataKey="phantom" name="Phantom" stroke={C.red} fill={C.red} fillOpacity={0.06} strokeWidth={1.5} dot={false} />
            <Area yAxisId="left" type="stepAfter" dataKey="beta" name="Beta rec." stroke={C.accent} fill="transparent" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="spy" name="SPY" stroke={C.blue} strokeWidth={1} dot={false} strokeOpacity={0.5} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 16, height: 2, background: C.red }} /><span style={{ fontSize: 10, color: C.textDim }}>Phantom score</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 16, height: 2, background: C.accent, borderTop: "1px dashed" }} /><span style={{ fontSize: 10, color: C.textDim }}>Beta rec.</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 16, height: 2, background: C.blue, opacity: 0.5 }} /><span style={{ fontSize: 10, color: C.textDim }}>SPY</span></div>
        </div>
      </div>

      {/* Regime Distribution */}
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 1,
        }}>
          <SectionHeader icon={BarChart3} title="Performance by regime" />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { regime: "Expansion", color: C.green, sharpe: 1.45, months: 78, dd: -8.2 },
              { regime: "Compression", color: C.amber, sharpe: 0.72, months: 24, dd: -14.1 },
              { regime: "Phantom", color: C.red, sharpe: -0.15, months: 30, dd: -27.3 },
              { regime: "Stress", color: C.red, sharpe: -0.82, months: 18, dd: -33.7 },
              { regime: "Recovery", color: C.blue, sharpe: 1.88, months: 30, dd: -5.4 },
            ].map(r => (
              <div key={r.regime} style={{
                display: "grid", gridTemplateColumns: "120px 1fr 80px 80px 80px",
                padding: "10px 12px", alignItems: "center", borderRadius: 4,
                background: "rgba(255,255,255,0.01)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
                  <span style={{ fontSize: 12, color: C.text }}>{r.regime}</span>
                </div>
                <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${(r.months / 180) * 100}%`, height: "100%", background: r.color, borderRadius: 2, opacity: 0.6 }} />
                </div>
                <span style={{ fontSize: 12, color: C.textMuted, textAlign: "right" }}>{r.months}mo</span>
                <span style={{ fontSize: 12, color: r.sharpe > 0 ? C.green : C.red, textAlign: "right", fontWeight: 600 }}>{r.sharpe.toFixed(2)}</span>
                <span style={{ fontSize: 12, color: C.red, textAlign: "right" }}>{r.dd.toFixed(1)}%</span>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 80px 80px", padding: "4px 12px" }}>
              <span /><span /><span style={{ fontSize: 9, color: C.textDim, textAlign: "right" }}>MONTHS</span>
              <span style={{ fontSize: 9, color: C.textDim, textAlign: "right" }}>SHARPE</span>
              <span style={{ fontSize: 9, color: C.textDim, textAlign: "right" }}>MAX DD</span>
            </div>
          </div>
        </div>
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 1,
        }}>
          <SectionHeader icon={Zap} title="The phantom edge" />
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>
            <p style={{ marginBottom: 12 }}>
              The critical insight: <span style={{ color: C.red, fontWeight: 600 }}>phantom stability regimes</span> look 
              identical to expansion on traditional risk metrics (low VIX, tight spreads, positive momentum). 
              But spectral analysis reveals collapsing internal structure.
            </p>
            <p style={{ marginBottom: 12 }}>
              SPY buy-and-hold during phantom regimes: <span style={{ color: C.red }}>Sharpe −0.15, max DD −27.3%</span>
            </p>
            <p style={{ marginBottom: 12 }}>
              PHANTOM overlay during same periods: <span style={{ color: C.green }}>reduced exposure to 25-40%, max DD −9.8%</span>
            </p>
            <p>
              This is the structural alpha: <span style={{ color: C.accent, fontWeight: 600 }}>seeing what traditional models cannot</span>. 
              The edge exists precisely because the market consensus sees stability where PHANTOM sees fragility.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// === HEDGE INTEL ===
function HedgeIntel({ hedges }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "slideIn 0.4s ease" }}>
      <div style={{
        background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
        padding: 20,
      }}>
        <SectionHeader icon={Shield} title="Hedge intelligence ranking" right="Dynamic selection · live" />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "80px 1fr 100px 100px 100px 80px 100px",
            padding: "8px 12px", gap: 8,
          }}>
            {["Asset", "Score", "Down capture", "Stress return", "Carry", "Corr", "Status"].map(h => (
              <span key={h} style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
          {hedges.map((h, i) => (
            <div key={h.asset} style={{
              display: "grid", gridTemplateColumns: "80px 1fr 100px 100px 100px 80px 100px",
              padding: "12px 12px", gap: 8, alignItems: "center",
              background: h.status === "SELECTED" ? "rgba(45,212,191,0.04)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
              borderRadius: 4,
              border: h.status === "SELECTED" ? `0.5px solid rgba(45,212,191,0.2)` : "0.5px solid transparent",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: h.status === "SELECTED" ? C.teal : C.text }}>{h.asset}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: "hidden", maxWidth: 160 }}>
                  <div style={{
                    width: `${h.score}%`, height: "100%", borderRadius: 3,
                    background: h.score > 70 ? C.green : h.score > 50 ? C.amber : C.textDim,
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: h.score > 70 ? C.green : h.score > 50 ? C.amber : C.textDim }}>{h.score}</span>
              </div>
              <span style={{ fontSize: 12, color: h.downCapture < 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>{h.downCapture.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: h.stressReturn > 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>+{h.stressReturn.toFixed(1)}%</span>
              <span style={{ fontSize: 12, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{h.carry.toFixed(1)}%</span>
              <span style={{ fontSize: 12, color: h.corr < 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>{h.corr.toFixed(2)}</span>
              <Pill
                color={h.status === "SELECTED" ? C.teal : h.status === "BACKUP" ? C.blue : h.status === "MONITOR" ? C.amber : C.red}
                bg={h.status === "SELECTED" ? "rgba(45,212,191,0.1)" : h.status === "BACKUP" ? C.blueDim + "40" : h.status === "MONITOR" ? C.compressionBg : C.stressBg}
              >
                {h.status}
              </Pill>
            </div>
          ))}
        </div>
      </div>

      {/* Hedge Selection Logic */}
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 1,
        }}>
          <SectionHeader icon={Brain} title="Selection methodology" />
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>
            <p style={{ marginBottom: 12 }}>
              The hedge engine ranks protection assets across five dimensions weighted by regime context:
            </p>
            {[
              { name: "Down-market capture", desc: "Beta to SPY in drawdowns > 5%. Lower = better protection.", weight: "30%" },
              { name: "Stress return", desc: "Average return in VIX > 25 episodes. Higher = better crisis performance.", weight: "25%" },
              { name: "Carry", desc: "Yield or roll return while waiting. Positive carry funds the hedge.", weight: "20%" },
              { name: "SPY correlation", desc: "Rolling 60d correlation. Negative = genuine diversification.", weight: "15%" },
              { name: "Drawdown risk", desc: "Own max drawdown. Hedges that blow up are worse than useless.", weight: "10%" },
            ].map((f, i) => (
              <div key={i} style={{
                padding: "8px 0", borderBottom: i < 4 ? `0.5px solid ${C.border}` : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ color: C.text, fontWeight: 600 }}>{f.name}</span>
                  <span style={{ color: C.accent }}>{f.weight}</span>
                </div>
                <span style={{ fontSize: 11, color: C.textDim }}>{f.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{
          background: C.bgCard, border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: 20, flex: 1,
        }}>
          <SectionHeader icon={Target} title="Current recommendation" />
          <div style={{
            padding: 20, background: "rgba(45,212,191,0.04)",
            border: `0.5px solid rgba(45,212,191,0.15)`, borderRadius: 8,
            textAlign: "center", marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", marginBottom: 4 }}>Primary hedge</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: C.teal }}>SHY</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>iShares 1-3 Year Treasury Bond</div>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>
            <p style={{ marginBottom: 12 }}>
              <span style={{ color: C.teal, fontWeight: 600 }}>Why SHY now:</span> In phantom compression regimes, 
              the priority is capital preservation with positive carry. SHY delivers 4.8% yield with minimal 
              duration risk and near-zero equity correlation.
            </p>
            <p>
              <span style={{ color: C.amber, fontWeight: 600 }}>Why not TLT:</span> Long-duration Treasuries show 
              positive SPY correlation (+0.25) in the current rate regime. TLT would amplify, not hedge, 
              a correlation spike event.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
