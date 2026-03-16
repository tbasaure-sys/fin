"use client";

import Link from "next/link";
import { startTransition, useEffect, useState, useTransition } from "react";

function formatPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  return `${(number * 100).toFixed(1)}%`;
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function severityClass(severity) {
  if (severity === "high") return "is-high";
  if (severity === "medium") return "is-medium";
  return "is-low";
}

function statusClass(status) {
  if (status === "fresh" || status === "live") return "is-good";
  if (status === "preferred") return "is-good";
  if (status === "aging" || status === "briefing" || status === "cache" || status === "heartbeat") return "is-warn";
  if (status === "active") return "is-warn";
  if (status === "stale" || status === "down" || status === "reconnecting") return "is-bad";
  return "is-neutral";
}

function resolveModuleId(moduleRefs, rawValue) {
  const value = rawValue.trim().toLowerCase();
  if (!value) return null;

  return moduleRefs.find((item) => {
    const title = item.title.toLowerCase();
    const kicker = item.kicker.toLowerCase();
    return item.id === value || title === value || title.includes(value) || kicker === value;
  })?.id || null;
}

function ModuleCard({ moduleRef, status, focused, onFocus, children }) {
  return (
    <section
      id={`module-${moduleRef.id}`}
      className={`terminal-module ${focused ? "is-focused" : ""}`}
    >
      <header className="module-header">
        <div>
          <p className="module-kicker">{moduleRef.kicker}</p>
          <h2>{moduleRef.title}</h2>
        </div>
        <div className="module-header-actions">
          <span className={`status-pill ${statusClass(status?.status)}`}>
            {status?.status || "unknown"}
          </span>
          <button className="ghost-button" onClick={() => onFocus(moduleRef.id)}>
            {focused ? "Close" : "Focus"}
          </button>
        </div>
      </header>
      <div className="module-body">{children}</div>
    </section>
  );
}

function ActionsModule({ module }) {
  return (
    <>
      <div className="panel-block">
        <p className="block-title">What the terminal would do next</p>
        <p className="support-copy">{module.subtitle}</p>
      </div>
      <div className="action-stack">
        {(module.actions || []).map((action) => (
          <article className={`action-card action-${action.type}`} key={action.id}>
            <div className="action-topline">
              <span className="action-rank">{action.priority}</span>
              <div className="action-tags">
                <span className={`status-pill ${action.type === "add" ? "is-good" : action.type === "trim" ? "is-medium" : "is-neutral"}`}>
                  {action.plainLabel}
                </span>
                <span className="action-source">{action.sourceLabel}</span>
              </div>
            </div>
            <div className="action-header">
              <strong>{action.ticker}</strong>
              <span>{action.company}</span>
            </div>
            <div className="action-grid">
              <div><span>Size</span><strong>{action.size}</strong></div>
              <div><span>Funding</span><strong>{action.funding}</strong></div>
              <div><span>Role</span><strong>{action.role}</strong></div>
            </div>
            <p className="action-conviction">{action.conviction}</p>
            <ul className="signal-list">
              <li>{action.whyNow}</li>
              <li>{action.watchFor}</li>
            </ul>
            <div className="action-invalidation">
              <span>What would change this</span>
              <strong>{action.invalidation}</strong>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function CommandModule({ module }) {
  return (
    <>
      <div className="hero-strip">
        <div>
          <p className="eyebrow">Current posture</p>
          <div className="hero-readout">{module.betaTarget}</div>
          <p className="support-copy">{module.headline}</p>
        </div>
        <div className="hero-grid">
          <div><span>Market backdrop</span><strong>{module.regime}</strong></div>
          <div><span>Confidence</span><strong>{module.confidence}</strong></div>
          <div><span>Shock absorber</span><strong>{module.hedge}</strong></div>
          <div><span>Diversification</span><strong>{module.structureState}</strong></div>
        </div>
      </div>
      <div className="grid-two">
        <div className="panel-block">
          <p className="block-title">Why this makes sense</p>
          <ul className="signal-list">
            {(module.summary || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="panel-block">
          <p className="block-title">What would change this view</p>
          <ul className="signal-list">
            {(module.flips || []).length
              ? module.flips.map((item) => <li key={item}>{item}</li>)
              : <li>Waiting for live policy thresholds.</li>}
          </ul>
        </div>
      </div>
      <div className="panel-block">
        <p className="block-title">Possible paths</p>
        <div className="scenario-list">
          {(module.scenarios || []).map((scenario) => (
            <div className="scenario-row" key={scenario.name}>
              <div>
                <strong>{scenario.name}</strong>
                <span>{scenario.stance}</span>
              </div>
              <strong>{formatPct(scenario.probability)}</strong>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PortfolioModule({ module }) {
  return (
    <>
      <div className="metric-band">
        <div><span>Annual return</span><strong>{module.analytics.annualReturn}</strong></div>
        <div><span>Typical swings</span><strong>{module.analytics.annualVolatility}</strong></div>
        <div><span>Reward vs risk</span><strong>{module.analytics.sharpeRatio}</strong></div>
        <div><span>Holdings</span><strong>{module.analytics.holdingsCount}</strong></div>
      </div>
      <div className="data-table compact-table">
        <div className="data-row data-head">
          <span>Ticker</span><span>Sector</span><span>Weight</span><span>Brief</span>
        </div>
        {(module.holdings || []).map((row) => (
          <div className="data-row" key={row.ticker}>
            <span>{row.ticker}</span><span>{row.sector}</span><span>{row.weight}</span><span>{row.conviction || row.upside}</span>
          </div>
        ))}
      </div>
      <div className="panel-block">
        <p className="block-title">Portfolio read</p>
        <ul className="signal-list">
          {(module.notes || []).map((note) => <li key={note}>{note}</li>)}
        </ul>
      </div>
    </>
  );
}

function ScannerModule({ module }) {
  return (
    <>
      <div className="panel-block">
        <p className="block-title">Idea summary</p>
        <p className="support-copy">{module.insight}</p>
      </div>
      <div className="data-table">
        <div className="data-row data-head">
          <span>Ticker</span><span>Type</span><span>Score</span><span>Value gap</span><span>Momentum</span>
        </div>
        {(module.rows || []).map((row) => (
          <div className="data-row" key={row.ticker}>
            <span>{row.ticker}</span><span>{row.bucket}</span><span>{formatNumber(row.discovery, 2)}</span><span>{row.valuationGap}</span><span>{row.momentum}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function RiskModule({ module }) {
  return (
    <>
      <div className="metric-grid">
        {(module.metrics || []).map((metric) => (
          <div className="metric-tile" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <div className="panel-block">
        <p className="block-title">Risk read</p>
        <ul className="signal-list">
          {(module.narrative || []).length
            ? module.narrative.map((line) => <li key={line}>{line}</li>)
            : <li>Risk module is mounted and waiting for full structural narratives.</li>}
        </ul>
      </div>
    </>
  );
}

function SpectralModule({ module }) {
  return (
    <>
      <div className="metric-grid">
        <div className="metric-tile"><span>Concentration</span><strong>{module.compressionScore}</strong></div>
        <div className="metric-tile"><span>Room to diversify</span><strong>{module.freedomScore}</strong></div>
        <div className="metric-tile"><span>True variety</span><strong>{module.effectiveDimension ?? "-"}</strong></div>
        <div className="metric-tile"><span>Top factor share</span><strong>{module.eig1Share}</strong></div>
      </div>
      <div className="panel-block">
        <p className="block-title">Balance read</p>
        <ul className="signal-list">
          {(module.narrative || []).length
            ? module.narrative.map((line) => <li key={line}>{line}</li>)
            : <li>Structural diversification narrative will appear as spectral artifacts are promoted.</li>}
        </ul>
      </div>
    </>
  );
}

function ThemesModule({ module }) {
  return (
    <div className="theme-grid">
      {(module.rows || []).map((row) => (
        <div className="theme-card" key={row.label}>
          <span className={`status-pill ${statusClass(row.signal)}`}>{row.signal}</span>
          <strong>{row.label}</strong>
          <span>{formatNumber(row.score, 2)}</span>
        </div>
      ))}
    </div>
  );
}

function InternationalModule({ module }) {
  return (
    <>
      <div className="data-table">
        <div className="data-row data-head">
          <span>Market</span><span>Ticker</span><span>Score</span><span>Momentum</span>
        </div>
        {(module.rows || []).map((row) => (
          <div className="data-row" key={`${row.label}-${row.ticker}`}>
            <span>{row.label}</span><span>{row.ticker}</span><span>{formatNumber(row.score, 2)}</span><span>{row.momentum}</span>
          </div>
        ))}
      </div>
      <p className="support-copy">{module.note}</p>
    </>
  );
}

function AuditModule({ module }) {
  return (
    <div className="panel-block">
      <p className="block-title">Research log</p>
      <ul className="signal-list">
        {(module.lines || []).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}

function renderModule(moduleRef, moduleData, status, focused, onFocus) {
  const bodyById = {
    actions: <ActionsModule module={moduleData} />,
    command: <CommandModule module={moduleData} />,
    portfolio: <PortfolioModule module={moduleData} />,
    scanner: <ScannerModule module={moduleData} />,
    risk: <RiskModule module={moduleData} />,
    spectral: <SpectralModule module={moduleData} />,
    themes: <ThemesModule module={moduleData} />,
    international: <InternationalModule module={moduleData} />,
    audit: <AuditModule module={moduleData} />,
  };

  return (
    <ModuleCard
      key={moduleRef.id}
      moduleRef={moduleRef}
      status={status}
      focused={focused}
      onFocus={onFocus}
    >
      {bodyById[moduleRef.id]}
    </ModuleCard>
  );
}

export default function TerminalApp({ initialSession, initialDashboard }) {
  const [session] = useState(initialSession);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [activeModule, setActiveModule] = useState(initialDashboard.module_refs[0]?.id || "command");
  const [focusedModule, setFocusedModule] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [density, setDensity] = useState("dense");
  const [connectionState, setConnectionState] = useState("connected");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [commandFeedback, setCommandFeedback] = useState("Type a stock, module, or action like `refresh`.");
  const [isPending, startRefresh] = useTransition();

  async function rememberCommand(command) {
    const response = await fetch(`/api/v1/workspaces/${dashboard.workspace_summary.id}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const payload = await response.json();
    setDashboard((current) => ({
      ...current,
      command_history: payload.history || current.command_history,
    }));
  }

  function jumpToModule(moduleId, focus = false) {
    setActiveModule(moduleId);
    setFocusedModule(focus ? moduleId : null);
    setTimeout(() => {
      document.getElementById(`module-${moduleId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  async function loadDashboard() {
    const response = await fetch(`/api/v1/workspaces/${dashboard.workspace_summary.id}/dashboard`, { cache: "no-store" });
    const payload = await response.json();
    setDashboard(payload);
    return payload;
  }

  function cycleModule(direction) {
    const currentIndex = dashboard.module_refs.findIndex((item) => item.id === activeModule);
    const nextIndex = (currentIndex + direction + dashboard.module_refs.length) % dashboard.module_refs.length;
    jumpToModule(dashboard.module_refs[nextIndex].id);
  }

  function applySavedView(viewId) {
    const presets = {
      "founder-tape": { moduleId: "actions", alerts: true, densityMode: "dense" },
      "barbell-book": { moduleId: "portfolio", alerts: true, densityMode: "dense" },
      "discovery-lab": { moduleId: "scanner", alerts: false, densityMode: "compact" },
      "live-command": { moduleId: "actions", alerts: true, densityMode: "dense" },
      "scanner-deep-dive": { moduleId: "scanner", alerts: false, densityMode: "compact" },
    };
    const preset = presets[viewId];
    if (!preset) return;
    setDensity(preset.densityMode);
    setAlertsOpen(preset.alerts);
    jumpToModule(preset.moduleId);
    setCommandFeedback(`Loaded ${viewId.replace(/-/g, " ")}.`);
  }

  useEffect(() => {
    const workspaceId = dashboard.workspace_summary.id;
    const source = new EventSource(`/api/v1/workspaces/${workspaceId}/stream`);

    source.addEventListener("connection_state_changed", (event) => {
      const payload = JSON.parse(event.data);
      setConnectionState(payload.state);
    });

    source.addEventListener("module_refresh_started", () => {
      setConnectionState("briefing");
    });

    source.addEventListener("quote_update", (event) => {
      const payload = JSON.parse(event.data);
      startTransition(() => {
        setDashboard((current) => ({
          ...current,
          market_ribbon: current.market_ribbon.map((item) => item.symbol === payload.symbol ? {
            ...item,
            price: payload.price,
            changePct: payload.changePct,
          } : item),
        }));
      });
    });

    source.addEventListener("alert_created", (event) => {
      const payload = JSON.parse(event.data);
      startTransition(() => {
        setDashboard((current) => ({
          ...current,
          alerts: [payload.alert, ...current.alerts]
            .filter((alert, index, items) => items.findIndex((item) => item.id === alert.id) === index)
            .slice(0, 20),
        }));
      });
    });

    source.addEventListener("module_refresh_completed", async () => {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/dashboard`, { cache: "no-store" });
      const payload = await response.json();
      startTransition(() => setDashboard(payload));
    });

    source.onerror = () => setConnectionState("reconnecting");
    return () => source.close();
  }, [dashboard.workspace_summary.id]);

  useEffect(() => {
    function onKeyDown(event) {
      const tagName = event.target?.tagName?.toLowerCase();
      const isTyping = tagName === "input" || tagName === "textarea";

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }

      if (!isTyping && event.key === "/") {
        event.preventDefault();
        setCommandOpen(true);
      }

      if (!isTyping && event.key === "[") {
        event.preventDefault();
        cycleModule(-1);
      }

      if (!isTyping && event.key === "]") {
        event.preventDefault();
        cycleModule(1);
      }

      if (!isTyping && /^[1-9]$/.test(event.key)) {
        const target = dashboard.module_refs[Number(event.key) - 1];
        if (target) {
          event.preventDefault();
          jumpToModule(target.id, event.shiftKey);
        }
      }

      if (event.key === "Escape") {
        setFocusedModule(null);
        setCommandOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeModule, dashboard.module_refs]);

  async function refreshTerminal() {
    startRefresh(async () => {
      await fetch("/api/refresh", { method: "POST" });
      await loadDashboard();
      setConnectionState("live");
      setCommandFeedback("Terminal refreshed from Railway.");
    });
  }

  async function addWatchlistSymbol(symbolInput) {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return;

    await fetch(`/api/v1/workspaces/${dashboard.workspace_summary.id}/watchlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, name: symbol, conviction: "User added", lastSignal: "Watching" }),
    });

    await loadDashboard();
    setCommandText("");
    setCommandOpen(false);
    setCommandFeedback(`${symbol} added to the shared watchlist.`);
  }

  async function runCommand(rawValue = commandText) {
    const value = rawValue.trim();
    if (!value) return;

    const normalized = value.toLowerCase();
    const moduleId = resolveModuleId(dashboard.module_refs, normalized);

    if (normalized === "refresh" || normalized === "sync") {
      await rememberCommand(value);
      await refreshTerminal();
      setCommandOpen(false);
      return;
    }

    if (normalized === "dense" || normalized === "compact") {
      await rememberCommand(value);
      setDensity(normalized);
      setCommandFeedback(`Density switched to ${normalized}.`);
      setCommandText("");
      setCommandOpen(false);
      return;
    }

    if (normalized === "alerts") {
      await rememberCommand(value);
      setAlertsOpen(true);
      setCommandFeedback("Alerts drawer opened.");
      setCommandText("");
      setCommandOpen(false);
      return;
    }

    if (normalized.startsWith("focus ")) {
      const target = resolveModuleId(dashboard.module_refs, normalized.replace(/^focus\s+/, ""));
      if (target) {
        await rememberCommand(value);
        jumpToModule(target, true);
        setCommandFeedback(`Focused ${target}.`);
        setCommandText("");
        setCommandOpen(false);
        return;
      }
    }

    if (normalized.startsWith("view ") || normalized.startsWith("open ")) {
      const target = resolveModuleId(dashboard.module_refs, normalized.replace(/^(view|open)\s+/, ""));
      if (target) {
        await rememberCommand(value);
        jumpToModule(target);
        setCommandFeedback(`Jumped to ${target}.`);
        setCommandText("");
        setCommandOpen(false);
        return;
      }
    }

    if (moduleId) {
      await rememberCommand(value);
      jumpToModule(moduleId);
      setCommandFeedback(`Jumped to ${moduleId}.`);
      setCommandText("");
      setCommandOpen(false);
      return;
    }

    if (normalized.startsWith("add ")) {
      await rememberCommand(value);
      await addWatchlistSymbol(normalized.replace(/^add\s+/, ""));
      return;
    }

    if (/^[a-z.]{1,8}$/i.test(value)) {
      await rememberCommand(`add ${value.toUpperCase()}`);
      await addWatchlistSymbol(value);
      return;
    }

    if (normalized.startsWith("view:")) {
      const viewId = normalized.replace(/^view:/, "").trim();
      await rememberCommand(value);
      applySavedView(viewId);
      setCommandText("");
      setCommandOpen(false);
      return;
    }

    setCommandFeedback("Command not recognized. Try `focus actions`, `view portfolio`, `refresh`, or a ticker.");
  }

  const orderedModules = [
    ...dashboard.module_refs.filter((item) => item.id === activeModule),
    ...dashboard.module_refs.filter((item) => item.id !== activeModule),
  ];
  const commandPresets = [
    { label: "Refresh", command: "refresh" },
    { label: "Next Moves", command: "focus actions" },
    { label: "Focus Risk", command: "focus risk" },
    { label: "View Scanner", command: "view scanner" },
    { label: "Founder Tape", command: "view:founder-tape" },
    { label: "Compact", command: "compact" },
    { label: "Add NVDA", command: "add NVDA" },
    { label: "Alerts", command: "alerts" },
  ];

  return (
    <main className={`terminal-root density-${density}`}>
      <div className="terminal-noise" />
      <header className="top-shell">
        <div className="brand-cluster">
          <div className="brand-mark" />
          <div>
            <p className="eyebrow">Retail decision terminal</p>
            <h1>BLS Prime</h1>
          </div>
        </div>
        <div className="workspace-strip">
          <div className="workspace-metadata">
            <span className={`status-pill ${statusClass(dashboard.workspace_summary.backend_status)}`}>
              {dashboard.workspace_summary.backend_status}
            </span>
            <span>{dashboard.workspace_summary.mode}</span>
            <span>{session.access.provider === "shared-link" ? "Private link alpha" : "Invite alpha"}</span>
            <span>{dashboard.workspace_summary.last_updated_label}</span>
          </div>
          <div className="top-actions">
            <button className="command-trigger" onClick={() => setCommandOpen(true)}>Cmd Palette</button>
            <button className="ghost-button" onClick={() => setDensity((current) => current === "dense" ? "compact" : "dense")}>
              {density === "dense" ? "Compact" : "Dense"}
            </button>
            <button className="ghost-button" onClick={() => setAlertsOpen((current) => !current)}>
              {alertsOpen ? "Hide alerts" : "Show alerts"}
            </button>
            <button className="primary-button" onClick={refreshTerminal} disabled={isPending}>
              {isPending ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <section className="market-ribbon">
        {dashboard.market_ribbon.map((item) => (
          <article className="ticker-card" key={item.symbol}>
            <div>
              <strong>{item.symbol}</strong>
              <span>{item.label}</span>
            </div>
            <div>
              <strong>{item.price ? formatNumber(item.price, 2) : "-"}</strong>
              <span className={Number(item.changePct) >= 0 ? "up" : "down"}>{formatPct(item.changePct)}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="tape-brief">
        <div className="tape-copy">
          <p className="eyebrow">Market Tape</p>
          <strong>{dashboard.market_brief.headline}</strong>
          <span>{dashboard.alpha_briefing.asOf}</span>
        </div>
        <div className="tape-metrics">
          <div className="tape-pill">
            <span>Tone</span>
            <strong>{dashboard.market_brief.bias}</strong>
          </div>
          <div className="tape-pill">
            <span>Leading</span>
            <strong>{dashboard.market_brief.leader}</strong>
          </div>
          <div className="tape-pill">
            <span>Cooling</span>
            <strong>{dashboard.market_brief.laggard}</strong>
          </div>
        </div>
      </section>

      <div className="terminal-layout">
        <aside className="workspace-rail">
          <section className="rail-card">
            <p className="rail-title">Workspace</p>
            <div className="identity-card">
              <strong>{session.user.name}</strong>
              <span>{session.user.email}</span>
              <span>{dashboard.workspace_summary.primary_stance}</span>
            </div>
            <div className="connection-state">
              <span className={`status-pill ${statusClass(connectionState)}`}>{connectionState}</span>
              <span>{session.access.provider === "shared-link" ? "Private link access" : "Invite-only alpha"}</span>
            </div>
          </section>

          <section className="rail-card">
            <p className="rail-title">Alpha Pulse</p>
            <p className="pulse-copy">{dashboard.alpha_briefing.pulse}</p>
            <div className="mini-stat-grid">
              {dashboard.alpha_briefing.stats.map((item) => (
                <div className="mini-stat" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="pulse-ideas">
              {dashboard.alpha_briefing.topIdeas.map((idea) => (
                <div className="pulse-idea" key={idea.symbol}>
                  <strong>{idea.symbol}</strong>
                  <span>{idea.conviction}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rail-card">
            <p className="rail-title">Navigation</p>
            <p className="rail-hint">`1-9` jump, `Shift+1-9` focus, `[` and `]` cycle, `/` opens commands.</p>
            <nav className="rail-nav">
              {dashboard.module_refs.map((item) => (
                <button
                  className={`rail-link ${activeModule === item.id ? "is-active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    jumpToModule(item.id);
                  }}
                >
                  <span>{item.kicker}</span>
                  <strong>{item.title}</strong>
                </button>
              ))}
            </nav>
          </section>

          <section className="rail-card">
            <p className="rail-title">Saved views</p>
            {(dashboard.saved_views || []).map((view) => (
              <button className="saved-view saved-view-button" key={view.id} onClick={() => applySavedView(view.id)}>
                <strong>{view.name}</strong>
                <span>{view.description}</span>
              </button>
            ))}
          </section>

          <section className="rail-card">
            <p className="rail-title">Watchlist</p>
            <div className="watchlist-stack">
              {(dashboard.watchlist || []).slice(0, 5).map((item) => (
                <div className="watchlist-row" key={item.symbol}>
                  <div>
                    <strong>{item.symbol}</strong>
                    <span>{item.lastSignal || item.conviction}</span>
                  </div>
                  <span className={Number(item.changePct) >= 0 ? "up" : "down"}>{formatPct(item.changePct)}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="module-grid">
          {orderedModules.map((moduleRef) => renderModule(
            moduleRef,
            dashboard.modules[moduleRef.id],
            dashboard.module_status.find((item) => item.id === moduleRef.id),
            focusedModule === moduleRef.id,
            (moduleId) => setFocusedModule((current) => current === moduleId ? null : moduleId),
          ))}
        </section>

        <aside className={`alerts-drawer ${alertsOpen ? "is-open" : ""}`}>
          <section className="rail-card">
            <p className="rail-title">Live alerts</p>
            <div className="alerts-list">
              {dashboard.alerts.map((alert) => (
                <article className={`alert-card ${severityClass(alert.severity)}`} key={alert.id}>
                  <div className="alert-topline">
                    <span className={`status-pill ${severityClass(alert.severity)}`}>{alert.severity}</span>
                    <span>{alert.source}</span>
                  </div>
                  <strong>{alert.title}</strong>
                  <p>{alert.body}</p>
                  <span className="alert-action">{alert.action}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="rail-card">
            <p className="rail-title">Alpha status</p>
            <div className="status-stack">
              {dashboard.module_status.map((item) => (
                <div className="status-row" key={item.id}>
                  <span>{item.title}</span>
                  <span className={`status-pill ${statusClass(item.status)}`}>
                    {item.staleDays === null ? item.status : `${item.status} ${item.staleDays}d`}
                  </span>
                </div>
              ))}
            </div>
            <Link href="/legacy" className="legacy-anchor">Open legacy workstation</Link>
          </section>

          <section className="rail-card">
            <p className="rail-title">Recent commands</p>
            <div className="command-history-list">
              {(dashboard.command_history || []).length
                ? dashboard.command_history.slice(0, 6).map((entry) => (
                  <button
                    className="history-row"
                    key={entry.id}
                    onClick={() => {
                      setCommandText(entry.command);
                      setCommandOpen(true);
                    }}
                  >
                    <strong>{entry.command}</strong>
                    <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
                  </button>
                ))
                : <p className="empty-copy">No command history yet. Open the palette with `Cmd/Ctrl+K` or `/`.</p>}
            </div>
          </section>
        </aside>
      </div>

      {focusedModule ? (
        <div className="focus-overlay" onClick={() => setFocusedModule(null)}>
          <div className="focus-surface" onClick={(event) => event.stopPropagation()}>
            {renderModule(
              dashboard.module_refs.find((item) => item.id === focusedModule),
              dashboard.modules[focusedModule],
              dashboard.module_status.find((item) => item.id === focusedModule),
              true,
              () => setFocusedModule(null),
            )}
          </div>
        </div>
      ) : null}

      {commandOpen ? (
        <div className="command-overlay" onClick={() => setCommandOpen(false)}>
          <div className="command-shell" onClick={(event) => event.stopPropagation()}>
            <div className="command-header">
              <strong>Command palette</strong>
              <span>Jump around, add stocks, switch layout, or refresh the terminal.</span>
            </div>
            <div className="command-input-row">
              <input
                autoFocus
                value={commandText}
                onChange={(event) => setCommandText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runCommand();
                  }
                }}
                placeholder="Try focus actions, view portfolio, refresh, or add NVDA"
              />
              <button className="primary-button" onClick={() => runCommand()}>Run</button>
            </div>
            <p className="command-feedback">{commandFeedback}</p>
            <div className="command-presets">
              {commandPresets.map((preset) => (
                <button
                  className="preset-chip"
                  key={preset.command}
                  onClick={() => {
                    setCommandText(preset.command);
                    runCommand(preset.command);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="command-shortcuts">
              {dashboard.module_refs.map((item) => (
                <button
                  className="shortcut-card"
                  key={item.id}
                  onClick={() => {
                    jumpToModule(item.id);
                    setCommandOpen(false);
                  }}
                >
                  <span>{item.kicker}</span>
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
            <div className="command-history-list is-inline">
              {(dashboard.command_history || []).slice(0, 4).map((entry) => (
                <button
                  className="history-row"
                  key={entry.id}
                  onClick={() => {
                    setCommandText(entry.command);
                  }}
                >
                  <strong>{entry.command}</strong>
                  <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
