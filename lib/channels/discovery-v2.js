const text = (es, en) => ({ es, en });

export const CHANNEL_ARENAS = Object.freeze([
  { value: "clinical_workflow", label: text("Flujos de salud", "Healthcare workflows"), detail: text("Herramientas, tiempos y decisiones visibles en la práctica clínica.", "Tools, timing, and decisions visible in clinical practice.") },
  { value: "latam_consumers", label: text("Consumo y finanzas LatAm", "LatAm consumer and finance"), detail: text("Pagos, crédito, comercio y adopción digital local.", "Payments, credit, commerce, and local digital adoption.") },
  { value: "software_workflow", label: text("Software e infraestructura digital", "Software and digital infrastructure"), detail: text("Cambios en uso, costos, seguridad y herramientas de equipos técnicos.", "Changes in usage, costs, security, and technical-team tooling.") },
  { value: "power_infrastructure", label: text("Energía e infraestructura", "Power and infrastructure"), detail: text("Capacidad, plazos, licitaciones y cuellos de botella físicos.", "Capacity, lead times, tenders, and physical bottlenecks.") },
  { value: "consumer_products", label: text("Productos de consumo", "Consumer products"), detail: text("Precio, disponibilidad, reposición, preferencia y distribución.", "Price, availability, restocking, preference, and distribution.") },
  { value: "industrial_supply", label: text("Industria y cadena de suministro", "Industry and supply chain"), detail: text("Inventarios, pedidos, utilización y sustitución de proveedores.", "Inventories, orders, utilization, and supplier substitution.") },
]);

export const CHANNEL_CHANGES = Object.freeze([
  { value: "workflow_adoption", label: text("Una herramienta está entrando al flujo real", "A tool is entering the real workflow") },
  { value: "pricing_power", label: text("El precio sube sin destruir demanda", "Price rises without destroying demand") },
  { value: "capacity_bottleneck", label: text("Plazos, colas o backlog están empeorando", "Lead times, queues, or backlog are worsening") },
  { value: "customer_switching", label: text("Usuarios están cambiando de proveedor", "Users are switching providers") },
  { value: "retention_change", label: text("Uso repetido o abandono está cambiando", "Repeat use or abandonment is changing") },
  { value: "regulatory_pass_through", label: text("Una regla está cambiando incentivos o reembolso", "A rule is changing incentives or reimbursement") },
]);

export const CHANNEL_EVIDENCE = Object.freeze([
  { value: "product_footprints", label: text("Uso público: catálogos, apps, documentación o sitios", "Public usage: catalogs, apps, documentation, or sites") },
  { value: "public_backlogs", label: text("Backlogs, licitaciones, permisos o tiempos publicados", "Published backlogs, tenders, permits, or timing") },
  { value: "filings_kpis", label: text("Filings y KPIs reportados por las empresas", "Company filings and reported KPIs") },
  { value: "public_prices", label: text("Precios, disponibilidad e inventario públicos", "Public prices, availability, and inventory") },
]);

export const CHANNEL_CADENCES = Object.freeze([
  { value: "weekly", label: text("Puedo medirlo semanalmente", "I can measure it weekly") },
  { value: "monthly", label: text("Puedo medirlo mensualmente", "I can measure it monthly") },
  { value: "one_off", label: text("Fue una observación aislada", "It was a one-off observation") },
]);

const CANDIDATES = Object.freeze({
  clinical_workflow: [
    { ticker: "ISRG", name: "Intuitive Surgical", changes: ["workflow_adoption", "retention_change"], kpi: "procedimientos da Vinci y base instalada", source: "10-Q, presentaciones trimestrales y reportes de utilización hospitalaria", test: "Compara crecimiento de procedimientos contra nuevas instalaciones durante cuatro trimestres.", falsifier: "La base instalada crece, pero los procedimientos por sistema caen de forma sostenida." },
    { ticker: "DXCM", name: "DexCom", changes: ["workflow_adoption", "customer_switching", "regulatory_pass_through"], kpi: "nuevos pacientes, volumen de sensores y margen bruto", source: "10-Q, cobertura de pagadores y disponibilidad pública de sensores", test: "Registra cobertura pública y disponibilidad en tres canales; contrástalo con nuevos clientes y margen.", falsifier: "La cobertura mejora sin acelerar nuevos pacientes o exige descuentos que deterioran margen." },
    { ticker: "TMDX", name: "TransMedics", changes: ["workflow_adoption", "capacity_bottleneck"], kpi: "casos NOP, utilización de flota e ingresos por servicio", source: "10-Q, presentaciones y datos públicos de trasplantes", test: "Compara crecimiento de trasplantes y centros con casos NOP e ingresos por caso.", falsifier: "Los trasplantes crecen, pero la penetración NOP o el ingreso por caso no acompaña." },
    { ticker: "HIMS", name: "Hims & Hers", changes: ["workflow_adoption", "retention_change", "pricing_power"], kpi: "suscriptores, ingreso por suscriptor y margen", source: "10-Q, precios públicos y catálogo de tratamientos", test: "Archiva semanalmente precio y amplitud del catálogo; contrástalo con ingreso por suscriptor.", falsifier: "La oferta se amplía, pero retención o ingreso por suscriptor se debilitan." },
    { ticker: "PODD", name: "Insulet", changes: ["workflow_adoption", "customer_switching"], kpi: "inicios Omnipod y crecimiento de suministros", source: "10-Q, cobertura pública y materiales de onboarding", test: "Sigue cobertura y fricción de inicio; busca confirmación en nuevos usuarios y ventas recurrentes.", falsifier: "Mejora el acceso, pero los inicios o el consumo recurrente no aceleran." },
    { ticker: "BFLY", name: "Butterfly Network", changes: ["workflow_adoption", "pricing_power"], kpi: "ingreso recurrente, dispositivos y margen", source: "10-Q, catálogo y anuncios públicos de despliegue", test: "Cuenta despliegues públicos nuevos y compáralos con crecimiento de software recurrente.", falsifier: "Los despliegues no se convierten en ingreso recurrente o exigen descuentos crecientes." },
  ],
  latam_consumers: [
    { ticker: "NU", name: "Nu Holdings", changes: ["workflow_adoption", "retention_change", "pricing_power"], kpi: "clientes activos, ingreso por cliente y costo de riesgo", source: "resultados trimestrales, tarifas públicas y estadísticas regulatorias", test: "Compara cambios públicos de producto y tarifas con actividad por cliente y mora.", falsifier: "La adopción sube, pero el ingreso por cliente no mejora o el costo de riesgo absorbe el crecimiento." },
    { ticker: "MELI", name: "MercadoLibre", changes: ["workflow_adoption", "retention_change", "capacity_bottleneck"], kpi: "GMV, TPV, usuarios activos y margen logístico", source: "10-Q, precios de envío, tiempos de entrega y datos de la app", test: "Muestrea semanalmente precio y promesa de entrega en tres ciudades; contrástalo con GMV y margen.", falsifier: "La experiencia mejora, pero frecuencia de compra o margen logístico no acompaña." },
    { ticker: "DLO", name: "dLocal", changes: ["customer_switching", "pricing_power"], kpi: "TPV, take rate y retención neta", source: "resultados, documentación pública de países y métodos de pago", test: "Cuenta nuevas rutas y métodos relevantes; contrástalos con TPV y take rate por semestre.", falsifier: "La cobertura se amplía sin crecimiento incremental de TPV o con compresión persistente de take rate." },
    { ticker: "PAGS", name: "PagSeguro", changes: ["customer_switching", "pricing_power", "retention_change"], kpi: "TPV, clientes activos y margen financiero", source: "resultados, tasas públicas y ofertas comerciales", test: "Compara tasas y equipos ofrecidos con TPV por comercio y clientes activos.", falsifier: "La oferta gana visibilidad, pero no cambia TPV por cliente o empeora el margen." },
    { ticker: "STNE", name: "StoneCo", changes: ["customer_switching", "retention_change"], kpi: "MSM TPV, clientes activos y monetización", source: "resultados, precios públicos y reseñas agregadas", test: "Sigue cambios de precio y producto para pymes; exige confirmación en TPV y monetización por cliente.", falsifier: "El producto mejora sin mayor TPV, retención o monetización." },
  ],
  software_workflow: [
    { ticker: "DDOG", name: "Datadog", changes: ["workflow_adoption", "retention_change", "pricing_power"], kpi: "clientes con múltiples productos y ARR", source: "10-Q, documentación, integraciones y vacantes públicas", test: "Cuenta integraciones y adopción multiproducto visible; contrástalo con clientes de 4+ productos.", falsifier: "La superficie de producto crece, pero la adopción multiproducto o retención neta se estanca." },
    { ticker: "NET", name: "Cloudflare", changes: ["workflow_adoption", "customer_switching", "pricing_power"], kpi: "clientes grandes, gasto por cliente y margen", source: "10-Q, documentación, precios y mediciones públicas de tráfico", test: "Sigue despliegues públicos y cambios de precio; contrástalos con clientes de más de USD 100k.", falsifier: "El tráfico o uso crece sin conversión a clientes grandes o con deterioro de margen." },
    { ticker: "CRWD", name: "CrowdStrike", changes: ["customer_switching", "workflow_adoption"], kpi: "ARR, módulos por cliente y retención", source: "10-Q, partners públicos y documentación de migración", test: "Cuenta señales públicas de consolidación de herramientas; exige aumento de clientes con más módulos.", falsifier: "Hay narrativa de consolidación, pero módulos por cliente o retención no mejoran." },
    { ticker: "MDB", name: "MongoDB", changes: ["workflow_adoption", "retention_change"], kpi: "Atlas revenue y clientes grandes", source: "10-Q, documentación, comunidad y vacantes públicas", test: "Mide actividad pública asociada a Atlas y migraciones; contrástala con crecimiento de Atlas y clientes grandes.", falsifier: "La actividad de desarrolladores no se convierte en consumo Atlas o clientes grandes." },
    { ticker: "SNOW", name: "Snowflake", changes: ["workflow_adoption", "pricing_power", "retention_change"], kpi: "product revenue, consumo y NRR", source: "10-Q, precios, marketplace y anuncios de clientes", test: "Sigue nuevas cargas y productos visibles en marketplace; contrástalos con consumo y NRR.", falsifier: "La amplitud de producto crece, pero el consumo por cliente sigue desacelerando." },
  ],
  power_infrastructure: [
    { ticker: "VRT", name: "Vertiv", changes: ["capacity_bottleneck", "pricing_power"], kpi: "organic orders, backlog y margen", source: "10-Q, backlog, plazos de distribuidores y proyectos de data centers", test: "Registra plazos públicos y proyectos nuevos; compáralos con pedidos, backlog y margen.", falsifier: "Los plazos siguen altos, pero pedidos o backlog caen, señalando inventario y no demanda final." },
    { ticker: "ETN", name: "Eaton", changes: ["capacity_bottleneck", "pricing_power"], kpi: "backlog eléctrico, crecimiento orgánico y margen", source: "10-Q, presentaciones y licitaciones eléctricas", test: "Muestrea adjudicaciones y plazos; exige confirmación en backlog y crecimiento orgánico.", falsifier: "Las adjudicaciones aumentan sin conversión a backlog o con compresión de margen." },
    { ticker: "PWR", name: "Quanta Services", changes: ["capacity_bottleneck", "workflow_adoption"], kpi: "backlog, book-to-bill e ingresos de infraestructura", source: "10-Q, permisos, adjudicaciones y planes de utilities", test: "Cuenta proyectos públicos nuevos por región; compáralos con backlog y book-to-bill.", falsifier: "Los proyectos anunciados se postergan y no entran a backlog dentro de dos trimestres." },
    { ticker: "HUBB", name: "Hubbell", changes: ["capacity_bottleneck", "pricing_power"], kpi: "ventas utility, precio/costo y margen", source: "10-Q, catálogos de distribuidores y presupuestos de utilities", test: "Sigue disponibilidad y precio de componentes; contrástalos con ventas utility y margen.", falsifier: "El precio sube por escasez, pero el volumen cae lo suficiente para deteriorar ventas o margen." },
    { ticker: "NVT", name: "nVent", changes: ["capacity_bottleneck", "workflow_adoption"], kpi: "crecimiento de data solutions y margen", source: "10-Q, catálogo y proyectos públicos de centros de datos", test: "Cuenta expansión de soluciones y proyectos asociados; exige confirmación en ventas de data solutions.", falsifier: "La exposición temática crece en presentaciones, pero no en ventas reportadas." },
  ],
  consumer_products: [
    { ticker: "ONON", name: "On Holding", changes: ["pricing_power", "retention_change", "workflow_adoption"], kpi: "ventas DTC, precio medio y margen bruto", source: "10-Q, precios, disponibilidad y tráfico de tiendas", test: "Archiva precios y quiebres de stock en una canasta fija; contrástalo con DTC y margen.", falsifier: "El precio se sostiene solo mediante menor disponibilidad o promociones posteriores." },
    { ticker: "CAVA", name: "CAVA Group", changes: ["pricing_power", "retention_change", "capacity_bottleneck"], kpi: "same-store sales, tráfico y margen restaurante", source: "10-Q, menús públicos y tiempos de espera", test: "Registra precio y tiempo de espera en locales comparables; separa tráfico de ticket promedio.", falsifier: "Las ventas comparables dependen de precio mientras tráfico y margen se deterioran." },
    { ticker: "DUOL", name: "Duolingo", changes: ["retention_change", "pricing_power", "workflow_adoption"], kpi: "DAU, conversión a pago e ingreso por usuario", source: "10-Q, rankings de app y precios públicos", test: "Sigue ranking, cambios de producto y precio; exige confirmación en DAU y suscriptores pagos.", falsifier: "El engagement visible no mejora conversión o ingreso por usuario." },
    { ticker: "ELF", name: "e.l.f. Beauty", changes: ["customer_switching", "pricing_power", "retention_change"], kpi: "sell-through, cuota y margen bruto", source: "10-Q, precios y disponibilidad en retailers", test: "Muestrea una canasta fija por retailer y semana; contrástala con crecimiento y margen.", falsifier: "La disponibilidad aumenta por acumulación de inventario, no por sell-through." },
    { ticker: "CELH", name: "Celsius", changes: ["customer_switching", "retention_change"], kpi: "ventas retail, distribución y rotación", source: "10-Q, estantes y datos públicos de canales", test: "Cuenta facings, disponibilidad y reposición en puntos comparables; exige confirmación en ventas.", falsifier: "La distribución crece pero la rotación por punto cae." },
  ],
  industrial_supply: [
    { ticker: "URI", name: "United Rentals", changes: ["capacity_bottleneck", "pricing_power", "retention_change"], kpi: "rental rate, utilización y volumen", source: "10-Q, tarifas públicas y actividad de construcción", test: "Muestrea tarifas y disponibilidad por equipo; contrástalo con utilización y rental rate.", falsifier: "Las tarifas suben mientras utilización y volumen caen de forma persistente." },
    { ticker: "CARR", name: "Carrier", changes: ["workflow_adoption", "regulatory_pass_through", "pricing_power"], kpi: "volumen HVAC, precio/costo y aftermarket", source: "10-Q, normas públicas y catálogos de distribuidores", test: "Sigue transición regulatoria y mix de productos; contrástalo con precio/costo y aftermarket.", falsifier: "La regulación adelanta demanda solo temporalmente y deja una caída posterior no compensada." },
    { ticker: "TT", name: "Trane Technologies", changes: ["capacity_bottleneck", "pricing_power", "workflow_adoption"], kpi: "bookings, backlog y margen", source: "10-Q, plazos públicos y proyectos comerciales", test: "Compara plazos y proyectos con bookings, backlog y margen por trimestre.", falsifier: "Los plazos largos reflejan fricción de oferta sin crecimiento de bookings." },
    { ticker: "FAST", name: "Fastenal", changes: ["retention_change", "customer_switching", "pricing_power"], kpi: "ventas diarias, sitios Onsite y margen", source: "reportes mensuales, precios y aperturas Onsite", test: "Sigue aperturas y venta diaria pública; busca aceleración antes del trimestre.", falsifier: "Crecen los sitios, pero ventas por sitio o margen se debilitan." },
    { ticker: "GWW", name: "W.W. Grainger", changes: ["pricing_power", "customer_switching"], kpi: "ventas diarias, volumen y margen bruto", source: "10-Q, catálogos y disponibilidad pública", test: "Muestrea precio y disponibilidad en una canasta fija; separa crecimiento de precio y volumen.", falsifier: "El crecimiento depende de precio mientras volumen y retención ceden." },
  ],
});

const DRIVER_GROUPS = Object.freeze([
  ["ISRG", "BFLY", "PODD", "DXCM"],
  ["HIMS", "OSCR", "UNH", "CVS", "CI"],
  ["TMDX"],
  ["NU", "PAGS", "STNE", "SOFI", "AFRM"],
  ["MELI", "DLO"],
  ["DDOG", "SNOW", "MDB"],
  ["NET", "CRWD"],
  ["VRT", "ETN", "HUBB", "NVT"],
  ["PWR", "URI"],
  ["ONON", "ELF", "CELH"],
  ["CAVA"],
  ["DUOL"],
  ["CARR", "TT"],
  ["FAST", "GWW"],
]);

const DRIVER_BY_TICKER = new Map(
  DRIVER_GROUPS.flatMap((tickers, groupIndex) => tickers.map((ticker) => [ticker, `driver-${groupIndex}`])),
);

function localize(value, language) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value[language] || value.es || value.en || "";
  return String(value || "");
}

function portfolioFit(ticker, held, cluster) {
  if (held.has(ticker)) return "already_held";
  const driver = DRIVER_BY_TICKER.get(ticker);
  if (cluster.has(ticker) || (driver && [...cluster].some((member) => DRIVER_BY_TICKER.get(member) === driver))) return "same_cluster";
  return "new_driver";
}

export function discoverResearchCandidates(input = {}) {
  const language = input.language === "en" ? "en" : "es";
  const arena = CHANNEL_ARENAS.some((item) => item.value === input.arena) ? input.arena : "";
  const change = CHANNEL_CHANGES.some((item) => item.value === input.change) ? input.change : "";
  const evidence = CHANNEL_EVIDENCE.some((item) => item.value === input.evidence) ? input.evidence : "";
  const cadence = CHANNEL_CADENCES.some((item) => item.value === input.cadence) ? input.cadence : "";
  const held = new Set((input.heldTickers || []).map((ticker) => String(ticker).toUpperCase()));
  const cluster = new Set((input.clusterTickers || []).map((ticker) => String(ticker).toUpperCase()));

  if (!arena || !change || !evidence || !cadence || cadence === "one_off") {
    return {
      status: "needs_repeatable_observation",
      candidates: [],
      observationContract: language === "en"
        ? "Choose a repeatable arena, a concrete change, and a public confirmation source."
        : "Elige un entorno repetible, un cambio concreto y una fuente pública de confirmación.",
    };
  }

  const arenaLabel = localize(CHANNEL_ARENAS.find((item) => item.value === arena)?.label, language);
  const changeLabel = localize(CHANNEL_CHANGES.find((item) => item.value === change)?.label, language);
  const cadenceLabel = localize(CHANNEL_CADENCES.find((item) => item.value === cadence)?.label, language);
  const pool = [...(CANDIDATES[arena] || [])]
    .map((candidate) => ({
      ...candidate,
      fit: portfolioFit(candidate.ticker, held, cluster),
      changeMatch: candidate.changes.includes(change) ? 1 : 0,
    }))
    .filter((candidate) => candidate.fit !== "already_held")
    .sort((left, right) =>
      right.changeMatch - left.changeMatch
      || (left.fit === "new_driver" ? 0 : 1) - (right.fit === "new_driver" ? 0 : 1)
      || left.ticker.localeCompare(right.ticker))
    .slice(0, 4);

  return {
    status: pool.length ? "research_queue" : "no_candidates",
    observationContract: language === "en"
      ? `${cadenceLabel}: test whether “${changeLabel}” is visible in ${arenaLabel} before the next reported KPI.`
      : `${cadenceLabel}: comprobar si “${changeLabel}” aparece en ${arenaLabel} antes del próximo KPI reportado.`,
    candidates: pool.map((candidate, index) => ({
      rank: index + 1,
      ticker: candidate.ticker,
      name: candidate.name,
      kpi: candidate.kpi,
      portfolioFit: candidate.fit,
      whyThisName: language === "en"
        ? `${candidate.name} reports ${candidate.kpi}; that makes the observation measurable rather than thematic.`
        : `${candidate.name} reporta ${candidate.kpi}; eso vuelve la observación medible y no solo temática.`,
      causalChain: language === "en"
        ? `${changeLabel} → ${candidate.kpi} → revenue or margin confirmation.`
        : `${changeLabel} → ${candidate.kpi} → confirmación en ingresos o margen.`,
      publicTest: {
        source: candidate.source,
        steps: language === "en"
          ? [candidate.test, `Write the expected direction and expiry before the next filing.`, `Reject the idea if: ${candidate.falsifier}`]
          : [candidate.test, "Escribe dirección esperada y fecha de vencimiento antes del próximo reporte.", `Descarta la idea si: ${candidate.falsifier}`],
      },
      falsifier: candidate.falsifier,
      evidenceMode: evidence,
    })),
  };
}
