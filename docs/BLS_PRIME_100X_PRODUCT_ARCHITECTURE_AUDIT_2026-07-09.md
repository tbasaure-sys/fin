# BLS Prime 100x — auditoría de producto, sistema visual y arquitectura objetivo

Fecha: 9 de julio de 2026
Alcance verificado: landing pública, selector ES/EN, CTA a autenticación, compuerta de Stress, rutas públicas de AURORA, FactorLab y Stress, código de i18n, recuperación de caché, metadatos, autenticación, persistencia, jobs, rutas API y diseño responsive.
Entorno: localhost, 1440 × 900 y 390 × 844, navegador in-app, sin errores ni warnings de consola en las rutas públicas recorridas.
Pruebas de dominio: npm run test:web, 238/238 en verde.

## Veredicto ejecutivo

BLS Prime ya tiene tres activos difíciles de copiar: una dirección visual sobria, motores con profundidad metodológica real y una obsesión visible por auditabilidad. El problema no es falta de features. El problema es que esos activos todavía se presentan como productos vecinos.

La landing promete “tres módulos, una decisión”, pero la experiencia posterior entrega tres mundos:

- AURORA abre una Valuation OS densa, en otro lenguaje visual y con copy ES/EN mezclado.
- FactorLab se siente como una herramienta editorial autónoma.
- Stress se siente como una microsite y luego como una compuerta hacia un workspace centrado casi exclusivamente en cartera.

La renovación 100x no debe añadir una cuarta portada. Debe crear un objeto persistente de decisión que conecte descubrimiento, valoración, escenarios, sizing, memo, ejecución diferida y revisión futura. La unidad de producto deja de ser “la página” y pasa a ser “la decisión con evidencia”.

La frase operativa propuesta es:

> Descubre qué merece atención. Estima qué vale. Define qué rompe la tesis. Mide qué pasa si te equivocas. Decide cuánto riesgo merece. Guarda por qué.

## 1. Evidencia visual y salud por paso

Las capturas aceptadas están en tmp/product-audit-2026-07-09.

| Paso | Superficie | Salud | Evidencia |
|---|---|---:|---|
| 1 | Landing desktop | Buena | Hero claro, jerarquía premium y terminal mock comprensible. |
| 2 | Login / alta | Mixta | Formulario sólido; el discurso se estrecha a Stress y el enlace “Sign in” abre signup por defecto. |
| 3 | Gate de Stress | Buena con deuda a11y | Explica por qué necesita holdings y ofrece tres salidas; falta foco inicial, trampa de foco y restauración. |
| 4 | AURORA | Potente pero fragmentada | Profundidad institucional real; exceso de densidad, Spanglish y marca visual distinta. |
| 5 | FactorLab | Buena pero autónoma | Propuesta clara y auditable; parece otra aplicación y su contenido técnico está mayormente en inglés. |
| 6 | Stress público | Buena | Copy simple para usuario no cuant; visual y navegación no coinciden con AURORA. |
| 7 | Landing móvil | Buena | Sin overflow horizontal; CTA y terminal se apilan correctamente. |
| 8 | Cards móvil | Buena | Lectura clara y tap targets amplios; el recorrido hasta módulos es largo por el mock apilado. |

Límite de evidencia: no se auditó el workspace autenticado con una cuenta real en esta corrida. La accesibilidad observada combina captura, DOM y código; no equivale a una certificación WCAG completa ni a pruebas con lector de pantalla.

## 2. Diagnóstico brutal pero útil

### Qué ya funciona

1. **La landing tiene una tesis.** “La tesis se prueba antes de mover el capital” es una promesa concreta, no copy SaaS genérico.
2. **La primera pantalla explica el sistema sin jerga excesiva.** Valoración, selección y estrés responden preguntas financieras reconocibles.
3. **El mock terminal es la mejor pieza de conversión actual.** Hace visible que los tres módulos pertenecen a una misma decisión.
4. **Stress traduce el modelo a una pregunta humana.** “Antes de agregar riesgo, mira qué se rompe primero” funciona mejor que vender CVaR como feature.
5. **AURORA muestra evidencia y falsificación, no solo fair value.** “Qué está asumiendo el precio”, “qué tendría que ser cierto” y “qué rompería la tesis” son patrones institucionales correctos.
6. **FactorLab explicita gates y null tests.** “Hard gates first” y “null test pending” aumentan confianza porque no esconden límites.
7. **Existe infraestructura real de runs.** Equity research ya tiene tablas de jobs y runs; Stress conserva seed, versión y run ID.
8. **La autenticación tiene fundamentos razonables.** Sesiones server-side con token hasheado, cookies httpOnly, SameSite=Lax, Secure en producción y passwords con scrypt.

### Qué se ve premium

- Fondo carbón, hairlines, serif editorial y mono para datos.
- Uso contenido de dorado como decisión, no como decoración masiva.
- Baja densidad cromática y ausencia de gradientes “fintech” chillones.
- Copy que habla de evidencia, escenarios y límites.
- Tablas y paneles con tono de informe de inversión, no de consumer banking.

### Qué todavía se ve pequeño, estático o incompleto

- La landing vende un sistema; el login vende casi solo Stress.
- El usuario no ve una cola de research, una decisión activa, un memo o un historial en el flujo público.
- El mock terminal es sintético pero no está rotulado “ejemplo ilustrativo / no datos en vivo”.
- La marca alterna BL'S, BLS Prime, AURORA Valuation OS y FactorLab sin una arquitectura de marca explícita.
- Cada módulo tiene su propia navegación, idioma, tipografía operativa y densidad.
- No existe una pantalla pública de metodología, seguridad, privacidad de datos o estándares de auditabilidad.
- El producto tiene “decision memory” en backend, pero no es visible como promesa central ni como rastro continuo entre módulos.

### Qué puede confundir

- El header dice **Iniciar sesión / Sign in**, pero enlaza a /login?lang=…; la pantalla interpreta la ausencia de intent como signup. El usuario ve “Create your account”.
- “Entrar a la terminal” también lleva a signup. Es válido para adquisición, pero no distingue usuario nuevo de usuario existente.
- /aurora redirige a /valuation-os-lab. El nombre visible y la URL canónica no coinciden.
- AURORA muestra español con “Auditable valuation verdict”, “Why” y “Next step”.
- La landing llama FactorLab “selección”; la página lo define más precisamente como research triage, no como ranking de compra. La promesa debe decir “priorización de research”.
- El gate de Stress es correcto, pero el card parece enlace y en realidad es button. La diferencia de comportamiento no se anticipa con un candado o label “requiere cartera”.
- El login promete abrir el “risk panel”, aunque BLS Prime afirma ser un sistema completo.

### Qué reduce confianza

- **Mismatch de idioma:** la landing móvil mostró español mientras document.documentElement.lang seguía en “en”. AURORA también mostró español con html lang “en”.
- **i18n por reescritura DOM:** un MutationObserver recorre textos y atributos después del render. Esto produce flash, Spanglish y riesgo de performance.
- **Recuperación de caché destructiva:** la primera carga de cada nueva versión de recovery ejecuta localStorage.clear() y sessionStorage.clear(). Borra idioma, preferencias, borradores y cualquier estado local no enumerado.
- **SEO desalineado:** el metadata global describe “private personal finance and investing workspace”, no una terminal institucional de equity research.
- No hay robots, sitemap, canonical, Open Graph, Twitter cards ni hreflang visibles en el repo.
- No hay rate limiting general de auth ni headers CSP/HSTS/X-Frame-Options/Permissions-Policy definidos en la aplicación.
- El mock muestra números que parecen vivos sin marca de datos ilustrativos.
- AURORA mezcla “calidad de tesis”, “factibilidad” y “brecha de valor” sin una leyenda uniforme de confianza.

### Qué limita escalabilidad técnica

- components/terminal-app.jsx tiene 5.842 líneas.
- lib/server/normalizers.js tiene 3.960 líneas.
- app/valuation-os-lab/page.jsx tiene 2.073 líneas.
- Hay 48 route handlers API. Muchos son fachadas finas alrededor de un mismo workspace service.
- La “cola” de refresh es un void Promise dentro del proceso web. No es durable: puede perderse al terminar una función serverless.
- Existen runs durables para equity research, pero no hay un contrato base compartido para ValuationRun, FactorRun y StressRun.
- Las entidades centrales están repartidas entre tablas normalizadas y payload JSONB sin un esquema común de provenance.
- La observabilidad se reduce esencialmente a console.error / console.warn; no hay tracing distribuido ni correlación obligatoria por run ID.
- El permiso de API se centra en “workspace actual de la sesión”. Falta un modelo explícito de organización, roles por recurso y permisos de lectura/exportación.

## 3. Problemas actuales vs solución verificable

| Prioridad | Problema actual | Dónde | Solución exacta | Cómo verificar |
|---:|---|---|---|---|
| P0 | “Sign in” abre signup | components/public-home-experience.jsx:405; app/login/page.js:97-99 | Header a /login?intent=signin; CTA principal a /login?intent=signup. Nombrar “Crear cuenta” y “Iniciar sesión” por separado. | Ambos links renderizan el título y campos correctos; E2E comprueba intent y next. |
| P0 | html lang no coincide con idioma visible | app/layout.js:37; LanguageLayer client-side | Resolver locale en servidor desde cookie; renderizar html lang correcto en SSR; eliminar mutación global del DOM. | View Source y DOM tienen el mismo lang antes de hidratar; test ES y EN sin flash. |
| P0 | Recovery borra todo el storage | app/layout.js:61-85 | Automático: solo desregistrar SW y limpiar CacheStorage. Recovery destructivo: solo en /recover, con confirmación y allowlist/export de preferencias. | Sembrar idioma y draft, desplegar nueva recovery version, comprobar que sobreviven. |
| P0 | Marca inconsistente | Landing BL'S, FactorLab BLS Prime, AURORA propia | Marca maestra “BLS Prime”; AURORA, FactorLab y Stress como módulos. BL'S solo si se formaliza como logomark, nunca como nombre alterno. | Header, metadata, auth, manifest y exports muestran la misma marca. |
| P0 | Datos mock parecen vivos | TerminalSim | Añadir “Illustrative workspace · sample data · not live” y un data-no-translate equivalente por locale. | Visible en desktop/móvil y anunciado por lector de pantalla o acompañado por texto accesible. |
| P0 | Modal sin gestión de foco | StressAccountGate | Auto-focus al heading/close, trap de Tab, Escape, restore al trigger, background inert. | Test teclado: foco entra, no escapa, Escape cierra y vuelve al card. |
| P1 | Tres productos visuales | home, valuation-os-lab, factorlab, stress | Shared AppShell, PageHeader, TrustBar, MetricPanel, DataTable y RunReceipt. | Comparación de tokens y componentes; cero headers alternativos. |
| P1 | Login solo vende Stress | app/login/page.js | Login institucional neutral: “Tu research, cartera y decisiones, en un workspace privado.” El destino depende de next/onboarding. | Entrada desde AURORA, FactorLab y Stress conserva contexto y destino. |
| P1 | /aurora no es canónica | app/aurora/page.js | Mover UI a /aurora o aplicar rewrite interno; canonical /aurora. Mantener redirect 301 desde /valuation-os-lab. | URL final, metadata canonical y links usan /aurora. |
| P1 | i18n fragmentada | COPY locales + DOM dictionary + hardcodes | ICU-style message catalog por claves: es.json / en.json, locale server-side, formateadores Intl. | Test de paridad de claves y cero MutationObserver de traducción. |
| P1 | SEO insuficiente | app/layout.js, ausencia de archivos | Metadata por ruta, metadataBase, canonical, OG image, robots, sitemap, hreflang; noindex para /app y auth. | Inspección de HTML SSR y Rich Results / Lighthouse SEO. |
| P1 | Sin trust strip común | Cada motor | RunReceipt fijo: as-of, data cut, fuente, cobertura, assumptions, versión, run ID, seed, warnings. | Todo resultado exportable contiene el mismo receipt. |
| P1 | Refresh no durable | lib/server/refresh-dispatch.js | Job en Postgres con worker Railway, retry/backoff, idempotency key, heartbeat y dead-letter state. | Matar worker durante corrida; job reanuda o reintenta sin duplicar. |
| P2 | Monolitos frontend/backend | terminal-app, normalizers, valuation page | Extraer por dominio y por feature, con contratos JSON versionados y tests contractuales. | Ningún archivo de feature supera ~500-700 líneas sin justificación. |
| P2 | Observabilidad mínima | app/error.js y logs puntuales | OpenTelemetry + structured logs, traceId/runId/workspaceId, error tracking y métricas de cola. | Un run se sigue web → job → worker → DB → export. |
| P2 | Seguridad de borde incompleta | middleware/next.config/auth | CSP nonce/hash, HSTS, frame-ancestors, Referrer/Permissions Policy, rate limit login/reset y CSRF/origin checks en mutaciones. | Suite automatizada de headers y abuso; pentest básico de auth. |

## 4. Nueva visión: BLS Prime como sistema de decisión

### Tres enfoques posibles

1. **Facelift de la landing.** Rápido, pero perpetúa páginas separadas y no mejora retención ni auditabilidad. No recomendado.
2. **Shell común + objeto de decisión + trust layer.** Reutiliza motores actuales, cambia el centro de gravedad del producto y permite migración incremental. Recomendado.
3. **Rewrite completo en microservicios.** Puede producir límites limpios, pero introduce meses de riesgo antes de mejorar la experiencia. No recomendado ahora.

### Definición propuesta

**BLS Prime es un research cockpit auditable para convertir una oportunidad de renta variable en una decisión de cartera reproducible.**

Cada capacidad tiene una pregunta:

| Capacidad | Pregunta | Salida |
|---|---|---|
| Factor discovery engine | ¿Por qué merece atención? | ResearchCandidate con score, gates, evidence gaps e invalidation. |
| Valuation engine | ¿Qué vale y qué descuenta el precio? | ValuationRun bear/base/bull + supuestos + sensibilidad. |
| Scenario lab | ¿Qué estados del mundo importan? | ScenarioSet versionado y compartible entre compañía y cartera. |
| Portfolio stress engine | ¿Qué pasa si me equivoco? | StressRun con CVaR, loss probability, drawdown y tail contributors. |
| Position sizing | ¿Cuánto tamaño merece? | SizingRange condicionado por convicción, downside, liquidez y budget de riesgo. |
| Research memo | ¿Cuál es la tesis completa? | Memo versionado con evidencia, supuestos, riesgos y decisión. |
| Decision memory | ¿Qué decidimos y por qué? | DecisionRecord con autor, fecha, alternativa rechazada e invalidation trigger. |
| Audit trail | ¿Se puede reconstruir? | RunReceipt + AuditEvent + artefactos exportables. |
| Watchlist / research queue | ¿Qué se revisa después? | Cola priorizada por catalyst, freshness, gap y cartera. |

### Flujo único

~~~mermaid
flowchart LR
  A["Watchlist / Research queue"] --> B["FactorLab: merece atención"]
  B --> C["AURORA: qué vale"]
  C --> D["Scenario Lab: qué debe ser cierto"]
  D --> E["Portfolio Workspace: dónde encaja"]
  E --> F["Stress Engine: qué pasa si falla"]
  F --> G["Sizing: cuánto riesgo merece"]
  G --> H["Research Memo + Decision Record"]
  H --> I["Decision Memory + Audit Trail"]
  I --> A
~~~

La navegación debe preservar un **Decision Context**: security, portfolio, active scenario set, assumption set, latest run IDs y memo draft. Cambiar de módulo no debe reiniciar la investigación.

## 5. Sitemap objetivo

~~~text
/
├── /product
├── /methodology
│   ├── /methodology/valuation
│   ├── /methodology/factorlab
│   └── /methodology/stress
├── /security
├── /aurora
├── /factorlab
├── /stress
├── /legal/terms
├── /legal/privacy
├── /legal/disclaimer
├── /login
├── /onboarding
└── /app
    ├── /app/cockpit
    ├── /app/research-queue
    ├── /app/securities/[securityId]
    │   ├── /overview
    │   ├── /valuation
    │   ├── /factors
    │   ├── /scenarios
    │   ├── /memo
    │   └── /provenance
    ├── /app/portfolios/[portfolioId]
    │   ├── /overview
    │   ├── /holdings
    │   ├── /stress
    │   ├── /scenarios
    │   └── /decisions
    ├── /app/runs/[runId]
    ├── /app/memos/[memoId]
    ├── /app/data
    │   ├── /sources
    │   └── /snapshots
    └── /app/settings
        ├── /profile
        ├── /organization
        ├── /permissions
        ├── /preferences
        └── /exports
~~~

Las rutas públicas /aurora, /factorlab y /stress se mantienen como demos/metodología para adquisición. Dentro de /app son tabs de un mismo objeto de research, no destinos autónomos.

## 6. Arquitectura de información por pantalla

| Pantalla | Propósito y usuario | Datos | Acción principal | Vacío | Error | Conexión |
|---|---|---|---|---|---|---|
| Landing pública | Explicar valor a analista, PM o allocator en 30 s. | Ejemplo etiquetado del flujo completo; trust claims verificables. | Ver demo o crear workspace. | No aplica; contenido server-rendered. | Si falla demo, conservar copy y captura estática honesta. | Metodología, login y demos de módulos. |
| Login / onboarding | Crear o recuperar acceso y formar el primer contexto. | Cuenta, organización, idioma, portfolio opcional, watchlist inicial. | Crear workspace / iniciar sesión. | “Empieza con una watchlist” o “importa holdings”. | Error por código, recuperación y status page; nunca error crudo. | Regresa al recurso que originó el login. |
| Research cockpit | Responder qué requiere atención hoy. | Queue, stale theses, catalysts, portfolio breaches, jobs y memos abiertos. | Abrir la decisión de mayor prioridad. | Ejemplos guiados + “agregar ticker / importar cartera”. | Degradar por panel; mostrar last good snapshot y freshness. | Entrada a todas las demás superficies. |
| AURORA | Construir y revisar valor intrínseco. | Estados financieros, ROIC/WACC, FCF, price-implied expectations, bear/base/bull, sensitivities y sources. | Guardar ValuationRun en la decisión. | Pedir ticker; listar datos mínimos faltantes. | Separar provider unavailable, stale data, insufficient evidence y model failure. | Consume candidate; produce scenarios, memo y sizing inputs. |
| FactorLab | Priorizar investigación, no emitir buys. | Universe cut, gates, score components, freshness, factor-null status, evidence gaps. | Añadir candidate a research queue. | Explicar filtros y ofrecer universo de ejemplo. | Mostrar qué regla/dato impidió el ranking; no score falso. | Envía ticker + rationale a AURORA y memo. |
| Stress Engine | Medir downside del portfolio y contribución de cola. | Holdings, coverage, regime, horizon, scenarios, CVaR, loss probability, drawdown, contributors y seed. | Guardar StressRun y abrir sizing. | Importar holdings o usar cartera ejemplo claramente marcada. | Distinguir job timeout, coverage insuficiente, ticker no mapeado y engine fallback. | Consume portfolio + scenario set; produce sizing y risk notes. |
| Portfolio workspace | Mostrar exposición, concentración y budget de riesgo. | Holdings, weights, liquidity, sector/factor exposure, P&L, benchmark, limits y open decisions. | Abrir rebalance/sizing draft, sin ejecutar trades. | Import CSV/manual; ejemplo removible. | Mantener última foto válida, detallar posiciones sin precio. | Une AURORA, Stress, decisions y memo. |
| Scenario Lab | Reusar estados bear/base/bull entre empresa y cartera. | Shocks, correlations, horizons, probabilities, assumptions y affected runs. | Crear/clonar ScenarioSet. | Biblioteca de escenarios institucionales versionados. | Validación de shocks imposibles y dependencias faltantes. | Alimenta ValuationRun y StressRun. |
| Research memo | Sintetizar tesis, evidencia, riesgos y sizing. | Claims, sources, assumptions, runs, charts, open questions y decision status. | Publicar nueva versión del memo. | Plantilla por tipo de oportunidad. | Guardado local/autosave y conflicto de versión explícito. | Referencia todos los runs y genera DecisionRecord. |
| Data provenance | Responder de dónde salió cada número. | Source, observedAt, asOf, vintage, transform, checksum, license y lineage. | Inspeccionar/exportar lineage. | “Sin fuente suficiente” bloquea uso decisional. | Source outage visible con último snapshot. | Disponible desde cada métrica y RunReceipt. |
| Settings / account | Preferencias, seguridad, roles, retención y exports. | Perfil, locale, org, workspace memberships, sessions, API/data policies. | Guardar preferencia o gestionar acceso. | Defaults conservadores. | No perder cambios; mensajes por campo. | Aplica transversalmente sin DOM mutation. |
| Legal / disclaimer | Explicar uso y límites sin interrumpir cada decisión. | Términos, privacidad, data licenses, model limits, conflict statement. | Aceptar versión al onboarding; consultar después. | No aplica. | Versión anterior sigue accesible. | Disclaimer corto contextual + documento completo. |

## 7. Sistema visual premium

### Dirección

Mantener la base actual y unificarla. La mezcla correcta no es “Bloomberg clone”; es:

- densidad y velocidad de terminal;
- composición y jerarquía de un investment committee memo;
- lenguaje de escenarios de un risk cockpit;
- anotaciones y versiones de un research notebook.

### Tokens

| Rol | Token |
|---|---|
| Background / obsidian | #07090D |
| Surface 1 | #0D1117 |
| Surface 2 | #131923 |
| Border | #27303B |
| Text primary / parchment | #F4F1E8 |
| Text secondary | #AAB4C1 |
| Text muted | #748091 |
| Decision / brass | #D6A64A |
| Verified / teal | #41B8A1 |
| Information / steel | #7B9EB8 |
| Warning | #E3A444 |
| Risk | #D96868 |

Regla: verde no significa “comprar” y rojo no significa “vender”. Los colores describen evidencia, warning o risk; la decisión siempre lleva texto.

### Tipografía

- **DM Serif Display:** landing, títulos de memo y report mode.
- **DM Sans:** navegación, controles y narrativa de producto.
- **JetBrains Mono:** cifras, timestamps, IDs, supuestos y tablas.
- Números tabulares obligatorios; nunca mezclar serif con cifras operativas.

### Spacing y grid

- Base 4 px; escala 4, 8, 12, 16, 24, 32, 48, 64.
- Desktop: 12 columnas, gutter 20-24 px, max-width 1.600 px.
- App shell: sidebar 232 px + canvas flexible + inspector opcional 320 px.
- Dense mode: filas 36 px; standard mode: 44 px.
- Mobile: una columna, inspector como bottom sheet, tablas con primera columna sticky.

### Componentes

- AppShell, GlobalSearch, CommandPalette y ContextBreadcrumb.
- TrustBar y RunReceipt.
- MetricCell, MetricStrip, Delta, CoverageBadge, FreshnessStamp.
- ScenarioRange bear/base/bull, FanChart, SensitivityMatrix.
- TailHistogram, CVaRWaterfall, ContributorTable, BreachMatrix.
- AssumptionCell, AssumptionDiff, SourcePopover, LineageDrawer.
- ThesisStatus, InvalidationTrigger, DecisionStatus, SizingLadder.
- ResearchQueueRow y JobProgress.
- EmptyState con una acción real; ErrorState con last good snapshot y retry.

### Cards, panels y tablas

- Radios 4-8 px, no cápsulas grandes en superficies institucionales.
- Header de panel con título, as-of y acciones; body; footer de provenance.
- Bordes hairline y separación por densidad, no por sombras.
- Tablas con headers sticky, orden estable, unidades en header y export visible.
- No esconder gaps con “0”; usar —, “sin dato”, “no cubierto” o “stale”.

### Terminal mode vs report mode

| Terminal | Report |
|---|---|
| Dark, denso, teclado, multi-panel. | Fondo claro/print-safe, narrativa lineal, exhibits numerados. |
| Estados live, jobs y filtros visibles. | Fecha, autor, versiones y fuentes en cada exhibit. |
| Optimiza comparación y acción. | Optimiza lectura, comité y export. |
| Conserva context rail. | Conserva los mismos run IDs y assumptions. |

### Visualización de datos

- Ejes y unidades siempre visibles.
- Etiquetas directas; evitar leyendas lejanas.
- Bandas de incertidumbre antes que líneas falsas de precisión.
- Bear/base/bull como rango y distribución, no tres cards aisladas.
- Tail risk con histograma + CVaR + contributors; no solo un número rojo.
- Cada chart lleva as-of, cobertura, frecuencia, fuente y link al run.
- Color acompañado por forma, patrón o label para accesibilidad.

## 8. Arquitectura técnica objetivo

### Estrategia

**Modular monolith + workers durables.** Mantener Next.js como web/BFF, Neon como sistema de registro y los motores Python/Node existentes. Separar dominios en paquetes internos antes de pensar en microservicios independientes.

~~~mermaid
flowchart TB
  UI["Next.js Web: cockpit + report mode"] --> BFF["BFF / API contracts"]
  BFF --> AUTH["Identity + RBAC"]
  BFF --> DB["Neon Postgres"]
  BFF --> Q["Durable Job Queue"]
  Q --> VW["Valuation Worker"]
  Q --> FW["Factor Worker"]
  Q --> SW["Stress Worker"]
  VW --> OBJ["Object Storage: artifacts"]
  FW --> OBJ
  SW --> OBJ
  VW --> DB
  FW --> DB
  SW --> DB
  DB --> OUTBOX["Outbox / Audit Events"]
  OUTBOX --> OBS["Logs + traces + metrics"]
~~~

### Dominios

- valuation
- factor-ranking
- stress-testing
- portfolio
- scenario-lab
- research-memo
- decision-memory
- data-provenance
- user-session

Cada dominio contiene: entities, application services, repository interfaces, adapters, contracts y tests. Shared solo contiene IDs, money/percent/date types, RunReceipt, pagination, auth context y error taxonomy.

### Entidades compartidas

- Company
- Security
- Portfolio
- Holding
- WatchlistItem
- ResearchCandidate
- AssumptionSet
- ScenarioSet
- DataSource
- DataObservation
- DataSnapshot
- AnalysisRun
- ValuationRun
- FactorRun
- StressRun
- ResearchMemo
- DecisionRecord
- AuditEvent
- ExportArtifact

### Contrato base AnalysisRun

Campos obligatorios:

- id, type, status, workspaceId, initiatedBy
- subjectType y subjectId
- portfolioId opcional
- inputHash e idempotencyKey
- dataSnapshotId y assumptionSetId
- scenarioSetId opcional
- codeVersion, modelVersion y contractVersion
- seed opcional pero obligatorio para simulaciones
- queuedAt, startedAt, completedAt
- coverage, warnings y limitations
- outputArtifactIds
- parentRunId para comparación/re-run

ValuationRun, FactorRun y StressRun agregan campos propios, pero nunca redefinen provenance.

### Datos y lineage

Separar físicamente y en UI:

1. **Observed:** dato de fuente con observedAt, asOf, vintage y checksum.
2. **User input:** holdings y supuestos manuales, con autor y timestamp.
3. **Estimate:** cálculo/modelo derivado, con método y versión.
4. **Generated narrative:** texto de IA; siempre referencia outputs y se marca no autoritativo.
5. **Decision:** juicio humano; no se sobrescribe al re-ejecutar modelos.

### Job queue

Primera opción: cola durable en Postgres/Neon con worker dedicado en Railway, usando SKIP LOCKED o una librería madura compatible. Requisitos:

- at-least-once delivery;
- idempotency key por input hash;
- heartbeat y lease;
- retry exponencial por clase de error;
- cancel request;
- dead-letter state;
- progress events;
- timeout por dominio;
- prioridad interactiva vs batch;
- worker version guardada en el run.

No devolver “queued: true” hasta que el job exista en DB.

### Cache y versionado

- Cache key = domain + subject + dataSnapshot + assumptionSet + scenarioSet + modelVersion.
- Resultados inmutables; “latest” es un puntero, no un overwrite.
- Re-run idéntico devuelve cached run con etiqueta explícita.
- Invalidar por data snapshot o model version, nunca con clear global.
- Large artifacts en object storage con checksum y signed URL.

### Observabilidad

- OpenTelemetry en web, BFF y workers.
- Structured logs con traceId, runId, jobId, workspaceId y subjectId.
- Métricas: queue depth, time-to-start, run duration p50/p95, failure rate, fallback rate, stale data rate, export errors.
- Error tracking con redacción de PII.
- AuditEvent separado de log técnico; append-only y consultable por el usuario.

### Seguridad, permisos y privacidad

- Organización → workspace → portfolio/resource.
- Roles iniciales: Owner, PM/Editor, Analyst, Reviewer, Viewer.
- Permisos explícitos: view data, edit assumptions, run models, publish memo, export, manage members.
- Sesiones rotables, panel de sesiones activas y revocación.
- Rate limit en login, reset, jobs costosos y chat.
- CSRF/origin protection en mutaciones; CSP y security headers.
- PII cifrada en tránsito y reposo; secretos fuera de payloads/logs.
- Retención configurable de holdings, memos y artifacts.
- Exports auditados y opcionalmente watermarked por workspace.

### Exportación

- PDF: report mode server-side con exhibits y RunReceipt.
- CSV: tablas y inputs, con unidades y as-of.
- Markdown: memo legible y versionable.
- JSON/YAML: assumptions, sources, run receipt y machine-readable audit.

## 9. Modelo de confianza

Toda vista decisional debe tener una TrustBar visible:

| Campo | Presentación |
|---|---|
| Fecha de datos | “Data cut: 8 Jul 2026 21:00 UTC” + fresh/stale. |
| Fuente | Nombre, tipo primary/vendor/manual y link/ID. |
| Supuestos | Conteo manual/automático; abrir Assumption Drawer. |
| Bear/base/bull | Rango, probabilidad si existe y criterio, no solo labels. |
| Cambio desde última corrida | Diff de inputs, data, modelo y outputs. |
| Manual vs automático | Icono + texto; nunca solo color. |
| Confianza | Low / usable / high, con razones y coverage. |
| Limitaciones | Máximo tres visibles + “ver todas”. |
| Audit fingerprint | Run ID, model version, seed, input hash. |

### Regla de confianza

No mostrar un “confidence score” único si mezcla calidad de datos, estabilidad del modelo y convicción del analista. Mostrar tres ejes:

- Data quality
- Model fitness
- Thesis confidence

El disclaimer corto debe aparecer en el footer de la superficie y en el export:

> Herramienta de research. Los resultados dependen de datos y supuestos, no predicen el futuro ni constituyen una instrucción de inversión.

El detalle legal vive a un clic. No repetir un párrafo defensivo en cada card.

## 10. Roadmap 100x

### 1-2 días — confianza inmediata

| Cambio | Impacto | Prioridad |
|---|---|---:|
| Separar Sign in / Create account y preservar next | Conversión, claridad | P0 |
| Corregir html lang SSR y metadata global | Confianza, accesibilidad, SEO | P0 |
| Eliminar localStorage.clear/sessionStorage.clear automático | Retención, robustez | P0 |
| Unificar marca a BLS Prime + módulos | Confianza | P0 |
| Etiquetar mock como ilustrativo | Confianza | P0 |
| Focus trap/restoration en gate de Stress | Accesibilidad | P0 |
| Canonicalizar /aurora | SEO, claridad | P1 |
| Añadir robots, sitemap, canonical y OG | Conversión, SEO | P1 |

### 1 semana — una sola experiencia

- Shared public/app header y design tokens.
- Login neutral al sistema, con contexto del módulo de origen.
- TrustBar/RunReceipt reutilizable en AURORA, FactorLab y Stress.
- Catálogo i18n por claves para public/auth/modules; eliminar MutationObserver en esas rutas.
- Cockpit v1 con research queue, latest runs, stale decisions y portfolio alerts.
- Route/CTA contract tests desktop y móvil.
- Empty/error/loading states normalizados.

### 2-4 semanas — rediseño profundo

- Security workspace con tabs de valuation, factors, scenarios, memo y provenance.
- Portfolio workspace con tabs de holdings, stress, scenarios y decisions.
- Decision Context persistente entre módulos.
- Scenario Lab v1.
- AnalysisRun base + migración de runs actuales.
- Worker durable para refresh/research/stress.
- Report mode y export PDF/CSV/Markdown.
- Refactor de terminal-app, normalizers y valuation page por bounded contexts.

### 1-3 meses — arquitectura institucional

- RBAC y organizaciones multiusuario.
- AuditEvent append-only y provenance explorer.
- Object storage de artifacts y políticas de retención.
- OpenTelemetry, SLOs, error budgets y dashboards operativos.
- Golden datasets y regression packs por motor.
- Model/version registry y release gates.
- Seguridad de borde, abuse controls, backup/restore probado y disaster recovery.
- Data licensing registry y políticas por fuente.

### Impacto por fase

| Fase | Confianza | Claridad | Conversión | Retención | Robustez | Escalabilidad |
|---|---:|---:|---:|---:|---:|---:|
| 1-2 días | Muy alto | Muy alto | Alto | Alto | Alto | Medio |
| 1 semana | Alto | Muy alto | Alto | Muy alto | Alto | Medio |
| 2-4 semanas | Muy alto | Muy alto | Medio | Muy alto | Muy alto | Alto |
| 1-3 meses | Muy alto | Alto | Medio | Alto | Muy alto | Muy alto |

## 11. Lista priorizada de cambios

1. P0 — impedir que recuperación de caché destruya preferencias y drafts.
2. P0 — separar signin/signup y conservar destino.
3. P0 — locale SSR real; retirar traducción por MutationObserver.
4. P0 — marca única y mock explícitamente ilustrativo.
5. P0 — RunReceipt común en cada output.
6. P1 — app shell y Decision Context.
7. P1 — research cockpit / queue como home autenticada.
8. P1 — /aurora canónica y navegación común.
9. P1 — AnalysisRun común + job queue durable.
10. P1 — Scenario Lab y sizing bridge.
11. P2 — refactor de monolitos por dominios.
12. P2 — RBAC, observabilidad, artifacts y audit trail institucional.

## 12. Prompt de implementación para Codex

~~~text
Actúa como Staff Product Engineer y Design Systems Lead para BLS Prime.

Repositorio:
C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\blsprime-fin

Fuente de verdad:
docs/BLS_PRIME_100X_PRODUCT_ARCHITECTURE_AUDIT_2026-07-09.md

Objetivo de esta ejecución:
Implementar solo la fase P0 de 1-2 días. No iniciar todavía el refactor de dominios ni el nuevo cockpit.

Antes de editar:
1. Inspecciona git status y preserva todos los cambios ajenos.
2. Lee app/layout.js, components/language-layer.jsx, components/public-home-experience.jsx,
   app/login/page.js, components/stress-account-gate.jsx, app/aurora/page.js y metadata actuales.
3. Levanta la app y captura baseline desktop 1440x900 y mobile 390x844.

Cambios obligatorios:
1. Header público:
   - “Iniciar sesión / Sign in” debe enlazar a /login?intent=signin&lang=...
   - “Entrar a la terminal” debe llamarse “Crear workspace / Create workspace” y usar intent=signup.
   - next debe preservarse y pasar safeNext.
2. Cache recovery:
   - eliminar localStorage.clear() y sessionStorage.clear() del script automático global;
   - conservar solo unregister de service workers y CacheStorage;
   - /recover puede seguir siendo destructivo, pero debe advertir qué borra y ofrecer volver sin limpiar;
   - preservar explícitamente blsprime_language_preference si se ejecuta recovery.
3. i18n/lang:
   - establecer locale en SSR desde cookie o route-level locale contract;
   - html lang debe coincidir con copy visible antes de hidratar;
   - no agregar más traducciones por DOM mutation;
   - para esta fase, public home y login deben usar copy por claves y locale server-resolved.
4. Marca/copy:
   - usar “BLS Prime” como nombre textual;
   - BL'S solo puede quedar como logomark con aria-label “BLS Prime”;
   - rotular el mock “Ejemplo ilustrativo · datos no en vivo / Illustrative sample · not live data”.
5. Stress modal:
   - foco inicial dentro del diálogo;
   - Tab/Shift+Tab no escapan;
   - Escape cierra;
   - al cerrar, foco vuelve al trigger;
   - background inert mientras está abierto.
6. SEO:
   - metadata global alineada con institutional equity research;
   - metadataBase, canonical de /, /aurora, /factorlab y /stress;
   - app/robots.js y app/sitemap.js;
   - noindex para /app, /login y recovery;
   - /aurora debe ser la URL canónica, sin perder soporte de ticker.

Restricciones:
- No tocar lógica de valoración, ranking, stress, auth hashing, DB ni datos de usuario.
- No introducir una librería de UI.
- No hacer un rewrite visual.
- No borrar archivos ni cambios existentes.
- No afirmar accesibilidad completa sin pruebas.

Acceptance:
- npm run test:web pasa.
- npm run build pasa.
- Browser QA en 1440x900 y 390x844.
- Cero errores/warnings relevantes en consola.
- Tests nuevos:
  a) signin y signup aterrizan en intents correctos;
  b) html lang SSR coincide con ES y EN;
  c) preferencias sobreviven a cache recovery automático;
  d) modal de Stress cumple focus trap, Escape y restore;
  e) canonical/robots/sitemap existen;
  f) /aurora conserva ?ticker=.
- Entrega screenshots before/after y tabla pass/fail.

Si una decisión exige ampliar alcance, detente y documenta el trade-off. No conviertas P0 en el rediseño completo.
~~~

## 13. Checklist QA

### Visual

- [ ] 1440×900, 1280×800, 1024×768, 768×1024 y 390×844.
- [ ] Hero, mock, cards y footer sin overflow horizontal.
- [ ] Terminal sample legible y rotulado como no-live.
- [ ] Una marca textual: BLS Prime.
- [ ] Mismos tokens en landing, auth, AURORA, FactorLab y Stress.
- [ ] Tablas con números tabulares y unidades.
- [ ] Estados hover, focus, active, selected, loading, disabled y destructive.
- [ ] Report mode imprime sin fondos oscuros obligatorios ni cortes de charts.

### Funcional

- [ ] Sign in abre intent=signin; Create workspace abre intent=signup.
- [ ] next se conserva y no admite open redirect.
- [ ] AURORA, FactorLab y Stress tienen destino funcional.
- [ ] Stress gate explica requisito, crea cuenta, inicia sesión y permite volver.
- [ ] /aurora?ticker=TXN conserva ticker.
- [ ] Empty portfolio dirige a holdings/onboarding.
- [ ] Cada run largo muestra queued/running/failed/complete y permite retry seguro.
- [ ] Re-run idéntico no duplica resultados.
- [ ] Export PDF/CSV/Markdown incluye run receipt.

### Accesibilidad

- [ ] html lang correcto en SSR y después de navegar.
- [ ] Un h1 por pantalla; jerarquía sin saltos arbitrarios.
- [ ] Skip link y landmarks main/nav/aside/footer.
- [ ] Todo control accesible por teclado.
- [ ] Focus visible con contraste suficiente; ningún outline se elimina sin reemplazo.
- [ ] Modal: focus inicial, trap, Escape, restore e inert.
- [ ] Tooltips accesibles por foco y Escape, no solo hover.
- [ ] Charts tienen resumen textual y tabla equivalente.
- [ ] Color no es el único canal para riesgo/confianza.
- [ ] prefers-reduced-motion evita animaciones y no deja contenido en opacity 0.
- [ ] Zoom 200% y reflow 320 CSS px sin pérdida.
- [ ] Contraste medido WCAG AA; no inferido por captura.

### i18n

- [ ] Paridad exacta de claves ES/EN en CI.
- [ ] Cero MutationObserver para traducir copy.
- [ ] Cero Spanglish en UI ES salvo términos técnicos decididos y etiquetados.
- [ ] Contenido dinámico tiene locale en origen o etiqueta de idioma.
- [ ] Fechas, moneda, porcentajes y números usan Intl con locale/currency.
- [ ] Links preservan locale sin depender de efecto post-hydration.
- [ ] Metadata, OG, manifest, disclaimer y emails respetan locale.
- [ ] Captura ES y EN por cada ruta pública y estado de error.

### SEO

- [ ] Title y description únicos por ruta.
- [ ] Canonical correcto y sin cadena de redirects.
- [ ] robots y sitemap válidos.
- [ ] OG/Twitter image y copy coherentes.
- [ ] hreflang ES/EN si existen URLs localizadas.
- [ ] /app, auth, recovery y runs privados con noindex.
- [ ] Structured data solo para claims reales.

### Datos, confianza y seguridad

- [ ] As-of, source, coverage, assumptions, model version, run ID y seed visibles.
- [ ] Manual/automático distinguido por texto.
- [ ] Last good snapshot visible en degradación.
- [ ] Inputs, estimates, outputs y narrative separados.
- [ ] No secrets/PII en logs, traces ni exports.
- [ ] Rate limit de auth/jobs y security headers verificados.
- [ ] RBAC probado por rol y recurso.
- [ ] Audit trail append-only y exportable.
- [ ] Backup/restore y reanudación de job probados.

## 14. Decisión final

No rehacer la landing desde cero. Es la superficie más coherente del producto actual. Elevarla con trust, marca y navegación; luego llevar esa disciplina al resto.

La transformación 100x ocurre cuando AURORA, FactorLab y Stress dejan de terminar en sus propios resultados y empiezan a escribir sobre el mismo Decision Record. Ese objeto —con evidencia, supuestos, escenarios, sizing, memo y audit trail— es BLS Prime.
