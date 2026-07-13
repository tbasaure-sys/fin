import {
  CHANNEL_PROFILE_VERSION,
  CHANNEL_PUBLIC_SOURCE_VALUES,
  CHANNEL_SENSITIVE_SOURCE_VALUES,
  sanitizeChannelAnswers,
} from "./contract.js";

export {
  CHANNEL_ANSWER_SCHEMA,
  CHANNEL_PROFILE_VERSION,
  CHANNEL_STORAGE_KEY,
  createEmptyChannelAnswers,
  sanitizeChannelAnswers,
} from "./contract.js";
export { CHANNEL_QUESTIONS } from "./questions.js";

const b = (es, en) => ({ es, en });

const SCORE_MAPS = Object.freeze({
  direct_experience: Object.freeze({ none: 0, occasional: 7, repeated: 14, operator: 20 }),
  repeatability: Object.freeze({ one_off: 0, quarterly: 5, monthly: 10, weekly: 15 }),
  issuer_kpi_mapping: Object.freeze({ none: 0, issuer_only: 5, issuer_kpi: 10, issuer_kpi_timing: 15 }),
  testability: Object.freeze({ narrative: 0, directional: 5, dated_falsifier: 10, repeated_predictions: 15 }),
  protection_time_fit: Object.freeze({
    none: Object.freeze({ structuralProtection: 0, timeFit: 0 }),
    attention_fit: Object.freeze({ structuralProtection: 5, timeFit: 5 }),
    specialized_fit: Object.freeze({ structuralProtection: 8, timeFit: 5 }),
    local_fit: Object.freeze({ structuralProtection: 10, timeFit: 5 }),
    protected_low_time: Object.freeze({ structuralProtection: 8, timeFit: 1 }),
  }),
});

const CRITERIA = Object.freeze({
  directExperience: Object.freeze({ max: 20, label: b("Experiencia directa", "Direct experience") }),
  publicVerifiability: Object.freeze({ max: 20, label: b("Verificabilidad pública", "Public verifiability") }),
  repeatability: Object.freeze({ max: 15, label: b("Repetibilidad", "Repeatability") }),
  issuerKpiMapping: Object.freeze({ max: 15, label: b("Conexión emisor-KPI", "Issuer-KPI mapping") }),
  testability: Object.freeze({ max: 15, label: b("Falsabilidad", "Testability") }),
  structuralProtection: Object.freeze({ max: 10, label: b("Protección estructural", "Structural protection") }),
  timeFit: Object.freeze({ max: 5, label: b("Ajuste al tiempo disponible", "Available-time fit") }),
});

const SOURCE_LABELS = Object.freeze({
  public_filings: b("Filings y reportes públicos", "Public filings and reports"),
  government_records: b("Registros gubernamentales abiertos", "Open government records"),
  public_prices: b("Precios y catálogos públicos", "Public prices and catalogs"),
  product_docs: b("Documentación pública de producto", "Public product documentation"),
  public_observation: b("Observación pública agregada", "Aggregated public observation"),
});

const ARCHETYPE_PRIORITY = Object.freeze({
  professional_workflow: 80,
  technical_product: 78,
  procurement: 76,
  regulated_economics: 75,
  local_geographic: 74,
  public_supply_chain: 73,
  public_records: 70,
  consumer_behavior: 68,
});

const ARCHETYPES = Object.freeze({
  professional_workflow: Object.freeze({
    title: b("Flujo profesional observable", "Observable professional workflow"),
    summary: b(
      "Posible canal: tu experiencia repetida puede ayudar a distinguir adopción real de ruido antes de que el KPI sea fácil de interpretar. No es una ventaja validada.",
      "Possible channel: repeated experience may help separate real adoption from noise before a KPI is easy to interpret. This is not a validated edge.",
    ),
    protection: b(
      "La posible barrera es interpretar correctamente fricciones de flujo usando material público, no acceder a información reservada.",
      "The possible barrier is correctly interpreting workflow friction from public material, not accessing restricted information.",
    ),
    observable: b(
      "Cambios agregados en adopción, frecuencia de uso, integración, sustitución o carga operativa.",
      "Aggregated changes in adoption, usage frequency, integration, replacement, or operating burden.",
    ),
    publicProof: b(
      "Triangula documentación, notas de versión, vacantes, reportes del emisor y estadísticas abiertas.",
      "Triangulate documentation, release notes, job postings, issuer reports, and open statistics.",
    ),
    economicLink: b(
      "Adopción o fricción → volumen, retención o productividad → ingresos, margen o intensidad de capital.",
      "Adoption or friction → volume, retention, or productivity → revenue, margin, or capital intensity.",
    ),
    falsifier: b(
      "Rechaza el canal si la observación no anticipa de forma repetible ningún KPI público o si explicaciones alternativas dominan.",
      "Reject the channel if the observation does not repeatedly lead any public KPI or alternative explanations dominate.",
    ),
    firstProbe45m: b(
      "Elige un emisor y un KPI, registra una predicción fechada y busca dos fuentes públicas independientes que puedan confirmarla o refutarla.",
      "Choose one issuer and KPI, log a dated prediction, and find two independent public sources that could confirm or refute it.",
    ),
    radarSeed: b(
      "Empresas donde la adopción del flujo, la integración o el costo de cambio sean económicamente materiales.",
      "Companies where workflow adoption, integration, or switching costs are economically material.",
    ),
    sourceKeys: Object.freeze(["product_docs", "public_filings", "public_observation"]),
  }),
  local_geographic: Object.freeze({
    title: b("Contexto local verificable", "Verifiable local context"),
    summary: b(
      "Posible canal: el contexto local puede revelar cambios agregados en actividad, disponibilidad o adopción. No es una ventaja validada.",
      "Possible channel: local context may reveal aggregated changes in activity, availability, or adoption. This is not a validated edge.",
    ),
    protection: b(
      "La posible barrera es combinar señales públicas locales dispersas que inversionistas remotos siguen con menos atención.",
      "The possible barrier is combining dispersed public local signals that remote investors monitor less closely.",
    ),
    observable: b(
      "Precios visibles, aperturas, disponibilidad, tráfico agregado, permisos o cambios de oferta en una geografía definida.",
      "Visible prices, openings, availability, aggregated traffic, permits, or supply changes in a defined geography.",
    ),
    publicProof: b(
      "Contrasta observación agregada con registros locales, estadísticas oficiales, catálogos y filings.",
      "Compare aggregated observation with local registries, official statistics, catalogs, and filings.",
    ),
    economicLink: b(
      "Cambio local → participación, volumen o precio → crecimiento, margen o capital de trabajo del emisor.",
      "Local change → share, volume, or price → issuer growth, margin, or working capital.",
    ),
    falsifier: b(
      "Rechaza si la muestra local no representa el mercado relevante o si no existe un puente estable hacia un KPI reportado.",
      "Reject if the local sample does not represent the relevant market or lacks a stable bridge to a reported KPI.",
    ),
    firstProbe45m: b(
      "Define una zona, una observación repetible y un KPI; compara hoy con una base pública y fija la próxima medición.",
      "Define one area, one repeatable observation, and one KPI; compare today with a public baseline and schedule the next measure.",
    ),
    radarSeed: b(
      "Emisores con exposición geográfica concentrada y datos públicos locales frecuentes.",
      "Issuers with concentrated geographic exposure and frequent public local data.",
    ),
    sourceKeys: Object.freeze(["government_records", "public_observation", "public_prices"]),
  }),
  public_records: Object.freeze({
    title: b("Registros públicos conectados", "Connected public records"),
    summary: b(
      "Posible canal: relacionar registros abiertos puede hacer visible una tendencia antes de que sea resumida por el mercado. No es una ventaja validada.",
      "Possible channel: connecting open records may reveal a trend before the market summarizes it. This is not a validated edge.",
    ),
    protection: b(
      "La posible barrera es el trabajo de limpiar, normalizar y conectar fuentes abiertas fragmentadas.",
      "The possible barrier is the work required to clean, normalize, and connect fragmented open sources.",
    ),
    observable: b(
      "Permisos, registros, actividad regulatoria, estadísticas, presupuestos o series administrativas abiertas.",
      "Permits, registries, regulatory activity, statistics, budgets, or open administrative series.",
    ),
    publicProof: b(
      "Conserva enlaces, fechas, definiciones y revisiones de cada registro, y contrástalos con filings.",
      "Keep links, dates, definitions, and revisions for each record, and compare them with filings.",
    ),
    economicLink: b(
      "Cambio administrativo → demanda, capacidad o costo → volumen, margen o inversión del emisor.",
      "Administrative change → demand, capacity, or cost → issuer volume, margin, or investment.",
    ),
    falsifier: b(
      "Rechaza si la cobertura, revisiones o rezagos del registro impiden una relación temporal estable con el KPI.",
      "Reject if coverage, revisions, or reporting lags prevent a stable temporal relationship with the KPI.",
    ),
    firstProbe45m: b(
      "Escoge una serie abierta, documenta su definición y rezago, y comprueba tres periodos contra un KPI del emisor.",
      "Choose one open series, document its definition and lag, and compare three periods with an issuer KPI.",
    ),
    radarSeed: b(
      "Sectores donde permisos, registros o presupuestos precedan de forma plausible la actividad económica reportada.",
      "Sectors where permits, registries, or budgets plausibly precede reported economic activity.",
    ),
    sourceKeys: Object.freeze(["government_records", "public_filings"]),
  }),
  procurement: Object.freeze({
    title: b("Compras públicas trazables", "Traceable public procurement"),
    summary: b(
      "Posible canal: presupuestos, licitaciones y adjudicaciones abiertas pueden anticipar demanda reconocida más tarde. No es una ventaja validada.",
      "Possible channel: open budgets, tenders, and awards may precede demand recognized later. This is not a validated edge.",
    ),
    protection: b(
      "La posible barrera es interpretar ciclos, lotes, adjudicatarios y calendarios públicos sin confundir anuncio con ingreso.",
      "The possible barrier is interpreting public cycles, lots, awardees, and calendars without confusing announcements with revenue.",
    ),
    observable: b(
      "Presupuestos, llamados, adjudicaciones, montos, plazos y ejecución contractual publicados.",
      "Published budgets, calls, awards, amounts, timelines, and contract execution.",
    ),
    publicProof: b(
      "Usa portales oficiales, resoluciones de adjudicación y reportes del emisor; evita rumores de ventas.",
      "Use official portals, award resolutions, and issuer reports; avoid sales rumors.",
    ),
    economicLink: b(
      "Adjudicación ejecutable → backlog o volumen → ingresos, margen y capital de trabajo.",
      "Executable award → backlog or volume → revenue, margin, and working capital.",
    ),
    falsifier: b(
      "Rechaza si adjudicaciones se cancelan, no se ejecutan o no se traducen en el calendario y KPI previstos.",
      "Reject if awards are canceled, not executed, or fail to translate into the expected timing and KPI.",
    ),
    firstProbe45m: b(
      "Toma una adjudicación cerrada, estima cuándo podría reconocerse y contrasta el supuesto con historial y filings.",
      "Take one completed award, estimate when it could be recognized, and compare the assumption with history and filings.",
    ),
    radarSeed: b(
      "Proveedores listados con contratos públicos materiales y portales de compra suficientemente estructurados.",
      "Listed suppliers with material public contracts and sufficiently structured procurement portals.",
    ),
    sourceKeys: Object.freeze(["government_records", "public_filings", "public_prices"]),
  }),
  technical_product: Object.freeze({
    title: b("Producto técnico evaluable", "Testable technical product"),
    summary: b(
      "Posible canal: una lectura técnica repetible puede detectar cambios de utilidad, rendimiento o integración. No es una ventaja validada.",
      "Possible channel: repeatable technical reading may detect changes in utility, performance, or integration. This is not a validated edge.",
    ),
    protection: b(
      "La posible barrera es convertir documentación pública compleja en pruebas comparables con conocimiento especializado.",
      "The possible barrier is turning complex public documentation into comparable tests using specialized knowledge.",
    ),
    observable: b(
      "Rendimiento, confiabilidad, compatibilidad, frecuencia de lanzamiento, fricción de integración o costo total.",
      "Performance, reliability, compatibility, release cadence, integration friction, or total cost.",
    ),
    publicProof: b(
      "Usa especificaciones, repositorios abiertos, benchmarks reproducibles, notas de versión y filings.",
      "Use specifications, open repositories, reproducible benchmarks, release notes, and filings.",
    ),
    economicLink: b(
      "Mejora técnica material → adopción o costo de cambio → crecimiento, retención o margen.",
      "Material technical improvement → adoption or switching cost → growth, retention, or margin.",
    ),
    falsifier: b(
      "Rechaza si el cambio técnico no altera conducta observable, disposición a pagar ni un KPI económico.",
      "Reject if the technical change does not alter observable behavior, willingness to pay, or an economic KPI.",
    ),
    firstProbe45m: b(
      "Define una prueba reproducible, compárala con una alternativa y escribe qué resultado cambiaría tu hipótesis.",
      "Define a reproducible test, compare it with an alternative, and write which result would change your hypothesis.",
    ),
    radarSeed: b(
      "Productos listados cuya calidad técnica influya de forma medible en adopción, retención o precio.",
      "Listed products whose technical quality measurably affects adoption, retention, or pricing.",
    ),
    sourceKeys: Object.freeze(["product_docs", "public_filings", "public_prices"]),
  }),
  regulated_economics: Object.freeze({
    title: b("Economía regulada traducible", "Translatable regulated economics"),
    summary: b(
      "Posible canal: comprender reglas públicas puede aclarar cambios de precio, reembolso, capacidad o incentivos. No es una ventaja validada.",
      "Possible channel: understanding public rules may clarify changes in price, reimbursement, capacity, or incentives. This is not a validated edge.",
    ),
    protection: b(
      "La posible barrera es traducir textos regulatorios públicos a mecanismos económicos y ventanas de implementación.",
      "The possible barrier is translating public regulatory texts into economic mechanisms and implementation windows.",
    ),
    observable: b(
      "Tarifas, cobertura, reembolso, requisitos de capital, capacidad autorizada o calendarios regulatorios.",
      "Tariffs, coverage, reimbursement, capital requirements, authorized capacity, or regulatory calendars.",
    ),
    publicProof: b(
      "Vincula norma, resolución, consulta o dato oficial con disclosures y KPIs del emisor.",
      "Link the rule, resolution, consultation, or official data with issuer disclosures and KPIs.",
    ),
    economicLink: b(
      "Regla implementada → precio, volumen, costo o capital → margen, retorno o crecimiento.",
      "Implemented rule → price, volume, cost, or capital → margin, returns, or growth.",
    ),
    falsifier: b(
      "Rechaza si la norma no entra en vigor, admite compensaciones dominantes o el emisor no tiene exposición material.",
      "Reject if the rule does not take effect, permits dominant offsets, or the issuer lacks material exposure.",
    ),
    firstProbe45m: b(
      "Resume una regla en una cadena causal de tres pasos, fija fecha y KPI, y busca una exposición cuantificada en filings.",
      "Summarize one rule in a three-step causal chain, set a date and KPI, and find quantified exposure in filings.",
    ),
    radarSeed: b(
      "Emisores con exposición cuantificable a reglas publicadas y KPIs sensibles a precio, volumen o capital.",
      "Issuers with quantifiable exposure to published rules and KPIs sensitive to price, volume, or capital.",
    ),
    sourceKeys: Object.freeze(["government_records", "public_filings"]),
  }),
  public_supply_chain: Object.freeze({
    title: b("Cadena de suministro pública", "Public supply-chain signals"),
    summary: b(
      "Posible canal: series públicas de precios, inventarios y plazos pueden revelar tensión o normalización. No es una ventaja validada.",
      "Possible channel: public price, inventory, and lead-time series may reveal stress or normalization. This is not a validated edge.",
    ),
    protection: b(
      "La posible barrera es mantener una serie comparable y mapear exposiciones, sustitutos y rezagos con disciplina.",
      "The possible barrier is maintaining a comparable series and mapping exposures, substitutes, and lags with discipline.",
    ),
    observable: b(
      "Precios, inventarios publicados, tarifas, entregas, capacidad y plazos visibles en fuentes abiertas.",
      "Prices, published inventories, rates, deliveries, capacity, and lead times visible in open sources.",
    ),
    publicProof: b(
      "Triangula índices, catálogos, estadísticas oficiales y disclosures de proveedores y compradores.",
      "Triangulate indices, catalogs, official statistics, and supplier and buyer disclosures.",
    ),
    economicLink: b(
      "Tensión de suministro → precio, volumen o inventario → margen, crecimiento o capital de trabajo.",
      "Supply stress → price, volume, or inventory → margin, growth, or working capital.",
    ),
    falsifier: b(
      "Rechaza si sustitución, cobertura o mezcla rompen de forma persistente la relación con el KPI elegido.",
      "Reject if substitution, hedging, or mix persistently breaks the relationship with the chosen KPI.",
    ),
    firstProbe45m: b(
      "Elige un insumo, dos fuentes públicas y dos emisores opuestos; registra el efecto y rezago esperados.",
      "Choose one input, two public sources, and two opposing issuers; log the expected effect and lag.",
    ),
    radarSeed: b(
      "Emisores con exposición material y divulgada a un insumo, cuello de botella o ciclo de inventario observable.",
      "Issuers with material disclosed exposure to an observable input, bottleneck, or inventory cycle.",
    ),
    sourceKeys: Object.freeze(["public_prices", "government_records", "public_filings"]),
  }),
  consumer_behavior: Object.freeze({
    title: b("Comportamiento público del consumidor", "Public consumer behavior"),
    summary: b(
      "Posible canal: observaciones agregadas y repetibles pueden detectar cambios de preferencia, disponibilidad o precio. No es una ventaja validada.",
      "Possible channel: aggregated, repeatable observations may detect changes in preference, availability, or price. This is not a validated edge.",
    ),
    protection: b(
      "La posible barrera es diseñar una muestra estable y tediosa sobre información pública, no extrapolar anécdotas.",
      "The possible barrier is designing a stable, laborious sample from public information, not extrapolating anecdotes.",
    ),
    observable: b(
      "Precio, disponibilidad, surtido, frecuencia de reseñas o uso agregado sin datos personales.",
      "Price, availability, assortment, review frequency, or aggregated usage without personal data.",
    ),
    publicProof: b(
      "Usa catálogos, sitios públicos, estadísticas y reportes; fija la muestra antes de observar el resultado.",
      "Use catalogs, public sites, statistics, and reports; fix the sample before observing the outcome.",
    ),
    economicLink: b(
      "Cambio de conducta → tráfico, unidades o precio → ingresos, margen, retención o inventario.",
      "Behavior change → traffic, units, or price → revenue, margin, retention, or inventory.",
    ),
    falsifier: b(
      "Rechaza si la muestra cambia, está sesgada o no anticipa de manera estable ningún KPI público.",
      "Reject if the sample changes, is biased, or does not stably lead any public KPI.",
    ),
    firstProbe45m: b(
      "Congela una canasta pequeña, registra precio y disponibilidad, define KPI y fecha, y programa una segunda medición idéntica.",
      "Freeze a small basket, record price and availability, define a KPI and date, and schedule an identical second measurement.",
    ),
    radarSeed: b(
      "Emisores donde precio, disponibilidad o recurrencia pública se conecten claramente con un KPI reportado.",
      "Issuers where public price, availability, or recurrence clearly connects to a reported KPI.",
    ),
    sourceKeys: Object.freeze(["public_observation", "public_prices", "public_filings"]),
  }),
});

const STATUS_COPY = Object.freeze({
  blocked_sensitive: Object.freeze({
    label: b("Detenido por seguridad", "Stopped for safety"),
    nextStep: b(
      "No uses esa fuente. Reformula el canal usando exclusivamente información pública y permitida.",
      "Do not use that source. Reframe the channel using only public and permitted information.",
    ),
  }),
  insufficient: Object.freeze({
    label: b("Aún no hay canal comprobable", "No testable channel yet"),
    nextStep: b(
      "Busca una observación repetible, una fuente pública independiente y un KPI que pueda refutarla.",
      "Find a repeatable observation, an independent public source, and a KPI that could refute it.",
    ),
  }),
  channel_hypothesis: Object.freeze({
    label: b("Hipótesis de canal", "Channel hypothesis"),
    nextStep: b(
      "Ejecuta una prueba fechada y no aumentes convicción hasta observar resultados repetidos.",
      "Run a dated test and do not increase conviction until repeated outcomes are observed.",
    ),
  }),
  probe_ready: Object.freeze({
    label: b("Lista para una primera prueba", "Ready for a first probe"),
    nextStep: b(
      "Realiza la prueba de 45 minutos y registra el resultado como evidencia de investigación, no como señal de compra.",
      "Run the 45-minute probe and log the outcome as research evidence, not as a buy signal.",
    ),
  }),
});

const SENSITIVE_PATTERNS = Object.freeze([
  Object.freeze({ code: "patient", pattern: /(^|[_\s-])(patient|clinical|medical_record)([_\s-]|$)/i }),
  Object.freeze({ code: "client", pattern: /(^|[_\s-])(client|customer_data)([_\s-]|$)/i }),
  Object.freeze({ code: "internal_private", pattern: /(^|[_\s-])(internal|private|confidential|mnpi)([_\s-]|$)/i }),
]);

function sourceSafetyReasons(raw, answers) {
  const reasons = [];
  const seen = new Set();
  const add = (code, es, en) => {
    if (seen.has(code)) return;
    seen.add(code);
    reasons.push({ code, message: b(es, en) });
  };

  if (answers.source_safety !== "public_safe") {
    add(
      "public_safety_not_confirmed",
      "No se confirmó que el canal use exclusivamente información pública y permitida.",
      "The channel was not confirmed to use only public and permitted information.",
    );
  }

  const rawValues = [
    answers.source_safety,
    ...answers.public_sources,
    ...(Array.isArray(raw?.public_sources) ? raw.public_sources : []),
    ...(Array.isArray(raw?.sources) ? raw.sources : []),
  ];

  for (const rawValue of rawValues) {
    if (typeof rawValue !== "string") continue;
    const normalized = rawValue.trim().toLowerCase();
    let sensitive = CHANNEL_SENSITIVE_SOURCE_VALUES.includes(normalized) ? normalized : "";
    if (!sensitive) sensitive = SENSITIVE_PATTERNS.find((item) => item.pattern.test(normalized))?.code ?? "";
    if (!sensitive) continue;
    const labels = {
      patient: ["El canal incluye una fuente de pacientes o clínica restringida.", "The channel includes restricted patient or clinical information."],
      client: ["El canal incluye información confidencial de clientes.", "The channel includes confidential client information."],
      internal_private: ["El canal incluye información interna, privada o confidencial.", "The channel includes internal, private, or confidential information."],
    };
    add(`sensitive_source_${sensitive}`, labels[sensitive][0], labels[sensitive][1]);
  }
  return reasons;
}

function publicVerifiabilityScore(publicSources) {
  const count = publicSources.filter((source) => CHANNEL_PUBLIC_SOURCE_VALUES.includes(source)).length;
  if (count === 0) return 0;
  if (count === 1) return 10;
  if (count === 2) return 15;
  return 20;
}

function buildScores(answers, blocked) {
  const protection = SCORE_MAPS.protection_time_fit[answers.protection_time_fit] ?? {
    structuralProtection: 0,
    timeFit: 0,
  };
  const values = blocked
    ? {
        directExperience: 0,
        publicVerifiability: 0,
        repeatability: 0,
        issuerKpiMapping: 0,
        testability: 0,
        structuralProtection: 0,
        timeFit: 0,
      }
    : {
        directExperience: SCORE_MAPS.direct_experience[answers.direct_experience] ?? 0,
        publicVerifiability: publicVerifiabilityScore(answers.public_sources),
        repeatability: SCORE_MAPS.repeatability[answers.repeatability] ?? 0,
        issuerKpiMapping: SCORE_MAPS.issuer_kpi_mapping[answers.issuer_kpi_mapping] ?? 0,
        testability: SCORE_MAPS.testability[answers.testability] ?? 0,
        structuralProtection: protection.structuralProtection,
        timeFit: protection.timeFit,
      };

  return Object.fromEntries(
    Object.entries(CRITERIA).map(([key, criterion]) => [
      key,
      { score: values[key], max: criterion.max, label: criterion.label },
    ]),
  );
}

function statusFor(answers, score, scores, blocked) {
  if (blocked) return "blocked_sensitive";
  if (
    answers.archetypes.length === 0 ||
    score < 40 ||
    scores.directExperience.score === 0 ||
    scores.publicVerifiability.score === 0
  ) {
    return "insufficient";
  }
  if (
    score >= 70 &&
    scores.publicVerifiability.score >= 15 &&
    scores.repeatability.score >= 10 &&
    scores.issuerKpiMapping.score >= 10 &&
    scores.testability.score >= 10
  ) {
    return "probe_ready";
  }
  return "channel_hypothesis";
}

function rankedArchetypes(answers) {
  const selectedPublicSources = new Set(
    answers.public_sources.filter((source) => CHANNEL_PUBLIC_SOURCE_VALUES.includes(source)),
  );
  return answers.archetypes
    .map((key) => {
      const definition = ARCHETYPES[key];
      const sourceMatch = definition.sourceKeys.filter((source) => selectedPublicSources.has(source)).length;
      return { key, fit: (ARCHETYPE_PRIORITY[key] ?? 0) + sourceMatch * 2 };
    })
    .sort((left, right) => right.fit - left.fit || left.key.localeCompare(right.key))
    .slice(0, 3);
}

function buildHypotheses(answers, status) {
  if (!new Set(["channel_hypothesis", "probe_ready"]).has(status)) return [];

  return rankedArchetypes(answers).map(({ key }, index) => {
    const definition = ARCHETYPES[key];
    const sourceKeys = [...new Set([...definition.sourceKeys, ...answers.public_sources])]
      .filter((source) => CHANNEL_PUBLIC_SOURCE_VALUES.includes(source))
      .slice(0, 4);
    return {
      id: `${CHANNEL_PROFILE_VERSION}:${key}`,
      archetype: key,
      rank: index + 1,
      stage: "unvalidated_hypothesis",
      title: definition.title,
      summary: definition.summary,
      protection: definition.protection,
      observable: definition.observable,
      publicProof: definition.publicProof,
      economicLink: definition.economicLink,
      falsifier: definition.falsifier,
      firstProbe45m: definition.firstProbe45m,
      radarSeed: definition.radarSeed,
      sources: sourceKeys.map((source) => SOURCE_LABELS[source]),
    };
  });
}

export function evaluateChannelProfile(raw) {
  const answers = sanitizeChannelAnswers(raw);
  const reasons = sourceSafetyReasons(raw, answers);
  const blocked = reasons.length > 0;
  const scores = buildScores(answers, blocked);
  const score = Object.values(scores).reduce((total, criterion) => total + criterion.score, 0);
  const status = statusFor(answers, score, scores, blocked);
  const statusCopy = STATUS_COPY[status];

  return {
    version: CHANNEL_PROFILE_VERSION,
    status,
    statusLabel: statusCopy.label,
    nextStep: statusCopy.nextStep,
    score,
    maxScore: 100,
    scoreDefinition: b(
      "Este puntaje mide aptitud de investigación pública y falsable; no estima probabilidad de retorno ni valida una ventaja.",
      "This score measures public, falsifiable research aptitude; it does not estimate return probability or validate an edge.",
    ),
    scores,
    safety: { blocked, reasons },
    answers,
    hypotheses: buildHypotheses(answers, status),
  };
}
