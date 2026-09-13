# BLS Prime — Company Narrative Contract v1

Complemento de `BLS_State_Contract_v1.md`. Aquel contrato gobierna el **portafolio**
(recoverability, phantom rebound, policy, repairs). Éste gobierna la **empresa**: qué
puede afirmarse sobre un ticker, con qué respaldo, y qué está prohibido decir.

Hereda la jerarquía epistemológica de v1 —medir, inferir, y sólo entonces hablar— y
añade una restricción que v1 no necesitaba: **este producto no emite asesoría de
inversión**, por lo que la capa prescriptiva de v1 (`mode`, `max_gross_add`,
`repair_candidates`) no tiene equivalente aquí. Se reemplaza por una capa de
**expectativas implícitas y falsificadores**.

---

## 1) El problema que resuelve

Un párrafo de análisis de calidad mezcla, sin señalarlo, cuatro cosas con estatus
epistemológico muy distinto:

| Afirmación | Estatus real |
|---|---|
| "OP de ¥1,447B en FY2025" | hecho reportado |
| "Bernstein espera que DRAM suba varias veces" | opinión de un tercero |
| "Sony dice que el impacto está contenido en ~¥30B" | aserción de la compañía, no verificada |
| "los ciclos de memoria revierten a la media" | supuesto del autor |
| "esto es una de las mejores entradas que puedo señalar" | **recomendación** |

Un lector humano experto distingue los cinco por tono. Un modelo de lenguaje los
aplana en un mismo registro de confianza, y el lector deja de poder auditarlos.

El contrato existe para que cada oración generada sea rastreable a una de las
primeras cuatro categorías, y para que la quinta sea estructuralmente inalcanzable.

---

## 2) Arquitectura

```text
Filings / market data     ->  A. Observed        (determinista, con as_of)
Noticias / eventos        ->  B. Events          (fechados y atribuidos)
Motor de valoración       ->  C. Price-implied   (aritmética condicional)
Modelo de lenguaje        ->  D. Thesis          (síntesis restringida)
Todo lo anterior          ->  E. Provenance      (cobertura y autoridad)
```

Regla dura: **el modelo de lenguaje sólo escribe la capa D**, y sólo puede usar
números que ya existan en A, B o C. Todo lo demás es código determinista.

---

## 3) Capa A — Observed

Hechos reportados. Nunca generados por un modelo.

Cada campo es un objeto `Fact`, no un escalar:

```json
{
  "id": "fact.fy2025.operating_income",
  "label": "Operating income FY2025",
  "value": 1447000000000,
  "unit": "JPY",
  "scale": "absolute",
  "period": { "type": "fiscal_year", "label": "FY2025", "ended": "2025-03-31" },
  "as_of": "2025-05-14",
  "source": {
    "type": "company_filing",
    "publisher": "Sony Group Corporation",
    "document": "FY2024 Consolidated Financial Results",
    "url": "https://...",
    "retrieved_at": "2026-07-27T00:00:00Z"
  },
  "confidence": "reported"
}
```

`source.type` ∈ `company_filing` · `company_presentation` · `regulator` ·
`market_data_vendor` · `computed`

`confidence` ∈ `reported` (viene tal cual del emisor) · `derived` (calculado por
nosotros) · `vendor_estimate` (el proveedor lo estimó)

Subgrupos obligatorios: `identity`, `market`, `fundamentals`, `segments[]`,
`guidance`, `capital_returns`, `multiples`.

**`multiples` se calcula en código, nunca por el modelo.** Cada múltiplo declara
`formula_id` y los `fact.id` que consumió, de modo que un número como
`EV/EBITDA 9.7x` sea reproducible y auditable:

```json
{
  "id": "fact.multiple.ev_ebitda",
  "value": 9.7,
  "unit": "x",
  "confidence": "derived",
  "formula_id": "ev_over_ebitda_ttm",
  "inputs": ["fact.market.enterprise_value", "fact.ttm.ebitda"],
  "as_of": "2026-07-25"
}
```

---

## 4) Capa B — Events

Lo que pasó, fechado y atribuido. Aquí vive la distinción que más se pierde en la
prosa generada: **quién lo dice**.

```json
{
  "id": "event.2026q4.memory_containment_claim",
  "date": "2026-05-14",
  "type": "guidance_commentary",
  "headline": "La compañía estima el impacto de precios de memoria en FY2026 en ~¥30B",
  "attribution": "company_assertion",
  "verified_by_us": false,
  "quantified_impact": { "value": -30000000000, "unit": "JPY", "basis": "company_stated" },
  "affects": ["segment.game_network_services"],
  "source": { "type": "company_presentation", "url": "https://..." }
}
```

`attribution` es obligatorio y determina el verbo que la capa D puede usar:

| `attribution` | Verbo permitido en prosa | Ejemplo |
|---|---|---|
| `reported_fact` | afirmar | "el impairment fue de $765M" |
| `company_assertion` | atribuir | "la compañía dice que…" |
| `third_party_opinion` | atribuir + nombrar | "Bernstein espera que…" |
| `press_report` | atribuir + marcar no confirmado | "según prensa, aún sin confirmar…" |
| `our_estimate` | marcar como propio | "nuestra estimación supone…" |

Un evento con `attribution: "third_party_opinion"` **no puede** aparecer en prosa
como hecho. Esto es verificable: ver §8.

---

## 5) Capa C — Price-implied expectations

El corazón descriptivo del producto: *qué tendría que ocurrir para justificar el
precio actual*. No es un pronóstico ni una valoración objetivo; es aritmética
condicional invertida desde el precio.

```json
{
  "hurdle_rate": 0.10,
  "horizon_years": 5,
  "implied": {
    "revenue_cagr": 0.061,
    "terminal_operating_margin": 0.128,
    "share_count_cagr": -0.03
  },
  "feasible_frontier": [{ "growth": 0.04, "margin": 0.15 }],
  "scenarios": [
    {
      "id": "scenario.base",
      "label": "Memoria normalizada, PS6 en 2027-28",
      "assumption_deltas": [
        { "driver": "memory_cost_per_unit", "change": "reverts to 2024 level by FY2028", "source": "our_estimate" }
      ],
      "implied_operating_income_range": { "low": 1900000000000, "high": 2000000000000, "unit": "JPY" },
      "arithmetic_only": true
    }
  ],
  "publishable": true,
  "withheld_reason": null
}
```

`arithmetic_only: true` obliga a la capa D a presentar el escenario como
consecuencia de supuestos declarados, no como expectativa del sistema.

Si la evidencia no alcanza, `publishable: false` y `withheld_reason` explica qué
falta — el mismo patrón de "En revisión" que ya usa AURORA.

---

## 6) Capa D — Thesis

Lo único que escribe el modelo. Campos obligatorios:

- **`decomposition`** — la observación estructural. En el caso Sony: "dos historias
  en un ticker", separar el negocio durable del componente cíclico que explica el
  movimiento. Es la parte de mayor valor y la más difícil de automatizar.
- **`dominant_assumption`** — el supuesto único del que más depende el resultado.
- **`risk_classification[]`** — cada riesgo clasificado como `cyclical` o
  `structural`, **con la justificación de por qué está en esa categoría**. Sin la
  justificación el campo se rechaza: es exactamente donde un modelo alucina con más
  fluidez.
- **`falsifiers[]`** — qué observación pública cambiaría la lectura:

```json
{
  "kpi": "Impacto de costo de memoria informado en GN&S",
  "public_test": "Desglose de márgenes de GN&S en resultados Q1 FY2026",
  "threshold": "impacto anualizado materialmente por encima de ¥30B",
  "next_observable_date": "2026-08-06",
  "where_it_appears": "Sony Q1 FY2026 consolidated results"
}
```

  Un falsificador sin `next_observable_date` es una opinión, no un falsificador.
- **`evidence_gaps[]`** — qué falta y qué decisión cambiaría si apareciera.
- **`claims[]`** — cada afirmación de la prosa con los `fact.id` / `event.id` que la
  sostienen.

---

## 7) La frontera de no-asesoría

Ningún objeto conforme puede contener estos campos:

`rating` · `recommendation` · `action` · `target_price` · `fair_value_point_estimate`
· `position_size` · `allocation` · `conviction_level` · `entry_price` · `stop_loss`

Y la prosa generada no puede contener léxico prescriptivo: comprar, vender,
mantener, acumular, sobreponderar, infraponderar, "posición inicial", "entrada",
"setup", buy, sell, hold, accumulate, overweight, underweight, "starter position".

**Por qué esto importa más de lo que parece.** El párrafo final del texto de Sony
—"For a starter position, this is one of the better setups I can point to right
now"— es indistinguible en tono del resto, pero es la única oración que cruza de
descripción a consejo. Si la frontera es una guía de estilo, el modelo la cruzará
en cuanto la prosa fluya. Si es un validador que rechaza el objeto, no puede.

Reformulación conforme del mismo contenido: *"Lo que se está descontando es la
transición de consola. El próximo dato observable sobre esa transición son los
resultados del 6 de agosto."* Misma información, sin acción implícita.

---

## 8) Tests de aceptación

Extienden los cinco tests de `BLS_State_Contract_v1.md` §12.

**Test 6 — Anclaje numérico.** Toda cifra que aparezca en la prosa debe existir en
la tabla de hechos, dentro de tolerancia de redondeo. Un número no anclado invalida
el objeto. Éste es el test de mayor rendimiento del contrato: captura la falla más
común y más costosa de un LLM sobre datos financieros.

**Test 7 — Atribución preservada.** Ningún evento `third_party_opinion`,
`company_assertion` o `press_report` aparece en prosa sin su atribución.

**Test 8 — Frontera de no-asesoría.** Ni campos prohibidos ni léxico prescriptivo.

**Test 9 — Falsificadores observables.** Cada falsificador tiene fecha futura y
fuente donde aparecerá.

**Test 10 — Riesgos justificados.** Cada riesgo clasificado como `cyclical` o
`structural` incluye justificación no vacía.

**Test 11 — Sin cifra sin fecha.** Todo `Fact` tiene `as_of` y `source`. Hereda el
P0 ya implementado en la UI.

---

## 9) Implicación para la elección de modelo

Con este contrato, el modelo de lenguaje deja de ser la pieza crítica. No aporta
cifras, no calcula múltiplos y no decide qué es material: recibe A, B y C ya
resueltos y sólo redacta D bajo validación automática. Un fallo de anclaje numérico
se detecta y se rechaza antes de llegar al usuario.

Eso convierte la elección entre GLM-5.2, DeepSeek V4 o Qwen3-235B en una decisión
de costo, latencia y calidad de prosa —reversible— en vez de una apuesta sobre
exactitud factual, que sería irreversible y no auditable.

La capa que sigue siendo difícil es `decomposition`: reconocer que el daño está
concentrado en la parte de menor calidad del P&L, y que el riesgo estructural real
está en otra parte. Eso no lo resuelve el tamaño del modelo. Se resuelve con la
rúbrica del prompt y con la calidad de las capas A–C.

## 10) Tesis privada versionada — `bls-living-thesis-v1`

La ruta `/research` incorpora un cuaderno de hipótesis, no una promoción del
contrato narrativo a recomendación. `lib/research/thesis-engine.mjs` define su
forma ejecutable; `tests-node/thesis-*.test.mjs` y `tests-e2e/living-thesis.spec.mjs`
verifican la frontera y su uso. El informe automático sigue siendo una lectura
selectiva independiente; sólo un gesto explícito incorpora un borrador al cuaderno.

- Una tesis liga emisor, ticker y corte documental. No certifica security master,
  listing epoch, clase ni continuidad histórica; `capital: not_assessed` permanece
  incluso si todas las notas están completas.
- La explicación principal y alternativa se desarrollan mediante seis eslabones:
  negocio, caja retenida, derechos/deuda, precio/expectativas, realización y pérdida.
  Sus dependencias son una secuencia explícita de revisión, no causalidad estimada.
- Cada eslabón conserva hipótesis, pregunta, fuente de comprobación, consecuencias
  opuestas, fecha opcional, materialidad y vínculos documentales. Soporte y
  contradicción simultáneos producen `conflicted`; una cita nunca produce `verified`.
- La prioridad de investigación sólo selecciona comprobaciones materiales con
  pregunta, procedimiento y consecuencias distintas. Ordena vencimiento, fecha y
  eslabón; no es un ranking de acciones ni un estimador de valor de información.
- El texto privado no se envía al modelo. Un borrador importado conserva versión y
  hash de respuesta; sus citas se vinculan como contexto, no como hechos validados.
- El servidor deriva el propietario de la sesión, autentica antes de acceder a
  datos y guarda revisiones inmutables con hash, padre, corte, fuentes y motivo.
  La comparación optimista de revisión rechaza escrituras concurrentes obsoletas.
  La producción exige almacenamiento persistente; nunca degrada a memoria volátil.
- Actualizar documentos exige volver a vincular evidencia. Las fuentes previas se
  conservan. Relojes de descarga y renumeración de extractos no son novedades.
  Interpretación, actualización documental, corrección técnica y observación de
  mercado son motivos declarados, no eventos económicos certificados.
- El historial visible se limita a las últimas 100 revisiones por ticker; las
  anteriores siguen almacenadas. La exportación contiene el borrador y ese historial.
  El borrador sin guardar vive en memoria del navegador, con advertencia al salir.
- `performance: null` y `predictiveClaim: false` son invariantes. No se altera V5,
  G820 ni ningún holdout. Una versión guardada es trazabilidad, no prueba de alpha.

## 11) Valoración condicional y exposición privada — `bls-thesis-fcff-v1.1`

`/research` → `Mi tesis` → `Valoración y cartera` conecta una revisión guardada
con inputs financieros, una política económica explícita y una captura de las
posiciones de su propietario. No modifica el contrato ni los hashes de tesis v1.
La semántica ejecutable reside en `lib/research/thesis-valuation.mjs`; los adaptadores,
persistencia y autenticación están en `lib/server/thesis-{financials,capital-*}.js`.

- Los hechos admitidos pertenecen a los accessions del expediente guardado y se
  fechan por su aceptación. Se preservan concepto, unidad, período, URL y hashes.
  La consulta Companyfacts y la metadata de identidad son capturas live; no
  certifican una reconstrucción histórica PIT ni autorizan el holdout sellado.
- FCFF = EBIT × (1 − impuesto supuesto) − reinversión neta. SBC permanece en EBIT.
  Cinco años explícitos; margen converge linealmente. Crecimiento exige inversión
  según ventas/capital incremental, incluso en el terminal. Contracción no libera
  capital automáticamente. Mantenimiento adicional es neto de depreciación.
- La referencia inicial usa crecimiento cero, margen anual observado, impuesto
  25%, descuento 10%, crecimiento terminal cero y ventas/capital 2x. Mantenimiento
  cero y caja utilizable 100% son hipótesis visibles, no ausencias verificadas.
  Las obligaciones restantes empiezan desconocidas, nunca en cero.
- Deuda identificada es una suma no solapada de componentes, no deuda total
  certificada. Sólo se convierte EV a equity cuando el usuario documenta y revisa
  caja utilizable, obligaciones no capturadas y no duplicación de ajustes. Datos
  materiales ausentes, incompatibles o antiguos bloquean la conversión pertinente.
  El residual equity negativo se conserva; el valor de la acción común se acota a cero.
- Escenarios de tensión/expansión aplican perturbaciones declaradas a la referencia,
  no calibradas a retornos. La sensibilidad pertenece a la misma familia DCF y no
  representa confirmación independiente. El modelo no aplica a financieros, REITs
  ni EBIT negativo. La valoración no cambia al cambiar exclusivamente el precio.
- La comparación exige cotización USD fechada ≤4 días, clase única provisional y
  contraste de acciones actuales contra el proxy diluido anual dentro de 25%.
  No certifica cap table. La inversa busca crecimiento entre −20% y +30%; si no hay
  solución única permanece nula. La asimetría sólo existe si los escenarios enmarcan
  pérdida y ganancia; no es probabilidad ni cota de pérdida permanente.
- v1.1 invalida también el valor por acción cuando una cantidad actual contrastada
  difiere materialmente del denominador anual; v1 sólo bloqueaba la comparación.
  El valor operativo no cambia. Los cálculos v1 guardados conservan su versión y
  resultado original.
- v1.3 exige que ingresos y EBIT del período base pertenezcan a la misma
  presentación; igual fecha económica no reconcilia un original con una enmienda.
  Caja y deuda también deben compartir presentación y fecha de balance para
  convertir valor operativo a equity. Una mezcla no reconciliada bloquea sólo
  el cálculo dependiente y no elimina los hechos originales. Un balance más
  reciente y coherente puede acompañar la base operativa anual; no se exige que
  ambos períodos provengan del mismo filing. Las simulaciones nuevas usan v1.3;
  registros anteriores se conservan sin recalcular ni reescribir sus hashes.
- La cartera se consulta con SELECT, unión de propietario y workspace de la sesión;
  no reutiliza overlays que escriben historial ni fallbacks compartidos. Pesos usan
  valores registrados, no NAV live. Falta de valores/fechas o antigüedad >14 días
  bloquean pesos completos. El impacto es estrés USD de una posición larga, no
  retorno de cartera, recomendación de tamaño, orden ni transacción real.
- Inputs y cálculos se guardan inmutables en `bls_thesis_capital_v1`, ligados al hash
  de tesis, con aislamiento por propietario y exportación autocontenida. Se muestran
  los últimos 30 registros por revisión; los anteriores siguen almacenados. Reabrir
  un cálculo conserva su resultado original; editar supuestos crea otra simulación.
  Refrescar no sobreescribe la evidencia anterior. Nada se envía a un modelo de lenguaje.
- Pruebas: `node --conditions=react-server --test tests-node/thesis-*.test.mjs`;
  flujo visual `tests-e2e/thesis-capital.spec.mjs`. Licencia máxima: investigación
  condicional reproducible; `performance: null`, `predictiveClaim: false`. V5, G820,
  posiciones reales y rangos de holdout no cambian por usar esta interfaz.

## 12. Entrada y medición de utilidad

- El ejemplo público `/example` es un caso histórico fechado, no el último estado
  de Microsoft ni una valoración admisible. Las cifras tienen fuente/localizador;
  el estrés de peso y caída es aritmética hipotética independiente.
- Documentos es la primera vista privada. Preparar cifras permite guardar, por
  acción explícita, un expediente inicial con hipótesis vacías. No se inventa una
  tesis resuelta ni se cuenta esta preparación como una tesis redactada.
- Medición requiere opt-in; sólo siete nombres de evento y UUID aleatorio. No
  se aceptan tickers, correos, posiciones o texto. Se almacena un hash con clave,
  fecha UTC y tipo de evento; se deduplica por navegador/día/evento. La retención
  lógica es 30 días y la limpieza física ocurre en la siguiente escritura.
  DNT/GPC y revocación bloquean nuevos envíos. Los conteos no son usuarios
  verificados ni un embudo causal; no sustituyen entrevistas o tráfico total.

## 13. Rendimientos registrados v2

- Cero es un valor terminal válido; no se recortan ganancias ni pérdidas. Un
  valor ausente conserva su fila y bloquea el acumulado, sin reiniciarlo.
- Los flujos se asignan por `captured_at`, no por el bucket redondeado. Los flujos
  internos de compra/venta no constituyen aportes externos. Historial legacy sin
  financiación identificada permanece sin resolver.
- Flujos en límites conocidos permiten TWR; flujos interiores permiten sólo
  Modified Dietz aproximado. Sin tiempos o cobertura no se publica el acumulado.
  La UI nunca sustituye un TWR nulo por crecimiento de valor o retorno desde costo.
- El importe externo neto no reemplaza movimientos individuales compensados.
  XIRR usa las fechas de los movimientos disponibles, no las de las capturas.
- Prueba de regresión: `tests-node/recorded-performance.test.mjs`. Esta corrección
  contable no certifica benchmarks, datos PIT, integridad del ledger o alpha.

## 14. Lectura documental v8 — criterio de entrega, no certificación

- La generación admite varios hallazgos acotados por sección. Una hipótesis nueva
  del analista no puede presentarse como un mecanismo ya demostrado por la fuente.
  Las preguntas y tareas reciben revisión de pertinencia separada; una pregunta no
  necesita respuesta en el paquete, pero no puede inventar que un KPI se publica.
- La revisión recibe cada extracto una sola vez, referenciado por identidad. Cada
  afirmación sigue limitada a sus fuentes citadas. La coincidencia literal no prueba
  que el revisor haya juzgado correctamente su significado o dirección económica.
- Un rechazo admite una reconstrucción dentro del mismo paquete y plazo global.
  Requiere otra revisión; no elimina hallazgos aceptados. Un fallo opcional conserva
  el trabajo previo y declara la ampliación inconclusa. Las fuentes no se amplían
  silenciosamente, ni se reescribe el pasado de un informe guardado.
- `delivery` distingue `insufficient`, `partial` y `documentary_brief`. Es cobertura
  estructural: dos hallazgos más pregunta y tarea por sección no certifican calidad,
  utilidad, valoración integral ni superioridad competitiva. `investmentAnalysisComplete`
  y `qualityCertified` siguen falsos. La UI deja visibles los límites, con diagnósticos
  de formato/revisión desplegables después del contenido.
- El encabezado describe la sección visible, no hereda hallazgos de otra sección.
  Un borrador sin explicación aceptada es una insuficiencia del análisis, no prueba
  de falta de divulgación de la empresa. Las preguntas no se rotulan como ausencias
  demostradas. Los pasajes consultados se pueden abrir desde ese estado, usando
  texto, fuentes y corte del expediente original del informe guardado; no se
  sustituyen por un expediente más reciente ni cuentan como hallazgos o entrega.
- Desde v8, `report_generated` se emite sólo para `documentary_brief`; los eventos
  anteriores medían respuestas recibidas, no esta cobertura. No comparar ambos como
  una mejora demostrada de conversión ni inferir usuarios satisfechos.
- Pruebas locales: `tests-node/report-reconstruction.test.mjs`,
  `tests-node/filing-analysis.test.mjs`, `tests-e2e/filing-analysis.spec.mjs`.
  `node --conditions=react-server scripts/check-report-fidelity.mjs --live` evalúa
  controles positivos/negativos especificados por un humano sobre el paquete MSFT;
  permite una sola llamada externa de revisión. Sin `--live` no consume proveedor.
  Un PASS no certifica el generador, otras empresas, preguntas útiles o alpha.
- Protocolo experimental `reference-review-v1`: el revisor selecciona referencias;
  el servidor recupera texto y offsets exactos. Una referencia existente prueba
  procedencia, no que la afirmación se desprenda de ella. Conflictos de identidad,
  fuentes ajenas a la afirmación y cobertura incompleta no aprueban una lectura.
  No está conectado al generador publicado. `scripts/check-reference-review.mjs`
  permite una llamada explícita `--live` o reevaluación local `--replay` con hash
  compatible. Sus controles incluyen errores observados del generador; son desarrollo,
  no holdout. Clasificación, cobertura de las citas y utilidad del informe son pruebas
  distintas. Aprobar las primeras no autoriza promoción automática de un modelo.
- Benchmark de producto: la documentación de Fiscal.ai ya incluye análisis de
  segmentos/KPI, modelos financieros, reverse DCF y seguimiento de cambios
  (https://docs.fiscal.ai/docs/guides/mcp-skills, consultado 2026-09-13). No se reclama
  ventaja por ofrecer esas funciones. La superioridad buscada exige comparación de
  casos completos: comprensión económica, caja reconciliada, expectativas del precio,
  contraargumento, invalidación y efecto sobre la cartera. Permanece no demostrada;
  la verificación de formato y la cobertura de un informe no son sustitutos.

## 15. Lectura financiera v1 — aritmética documental, independiente de IA

- La consulta autenticada `POST /api/research/financial-reading` exige el expediente
  firmado y vigente, mismo origen y cuerpo acotado. Sólo lee fuentes públicas; no
  llama al modelo, no consulta precios ni modifica una tesis o posiciones. Comparte
  cargas concurrentes idénticas y limita tamaño, tiempo y concurrencia de descarga.
- Hasta tres ejercicios anuales comparativos proceden exclusivamente de accessions
  incluidos en el expediente. Cada cifra conserva concepto, unidad, inicio/fin,
  aceptación, documento y hashes. La fecha del ejercicio no es disponibilidad:
  estos comparativos no crean una serie histórica PIT ni incluyen TTM posterior.
- Caja después de inversión = CFO menos pagos por PPE. No es FCFF normalizado,
  no separa mantenimiento/crecimiento ni incluye adquisiciones. SBC, recompras,
  dividendos y acciones diluidas ponderadas permanecen separados. Ausentes nunca
  se vuelven cero; pérdidas y residuos negativos no se truncan.
- Aritmética exige igual período, unidad y accession. Variaciones exigen ejercicios
  adyacentes sobre igual concepto y presentación; no se comparan bases de acciones
  de diferentes filings sin reconciliar splits. Base no positiva bloquea porcentajes.
- Las alertas son desigualdades reproducibles, no causas demostradas, solvencia,
  calidad, valoración, diagnóstico de precio ni alpha. Sin alerta no significa sin
  riesgo. Sectores financieros quedan fuera de esas alertas, no de la tabla factual.
- La tabla aparece sin depender de la generación de IA; cada cifra abre fuentes y
  fórmula. Una respuesta de otra empresa, corte o paquete se rechaza. Cambiar de
  vista no repite la consulta. Errores mantienen documentos disponibles y permiten
  reintentar; expiración exige renovar el expediente, no relajar su firma.
- Regresiones: `tests-node/financial-reading*.test.mjs`,
  `tests-node/thesis-financials.test.mjs`, `tests-e2e/financial-reading.spec.mjs`.

## 16. Condiciones de precio — FCFF v1.2

- La valoración, sus escenarios y los hechos no mejoran porque suba la cotización.
  Con puente revisado y comparación válida, dos inversiones del modelo explicitan
  margen al año cinco y mantenimiento neto/ventas que igualarían valor a precio.
  Cada inversión fija TODOS los demás supuestos: no estima consenso ni probabilidad.
- Estos parámetros son afines en el residual de equity sin truncar del modelo
  actual. La raíz se calcula antes del piso de responsabilidad limitada y se
  reconcilia contra el precio positivo. No se extrapola fuera del dominio; cero
  dentro del dominio es un resultado, no ausencia. Una fórmula futura no afín
  requiere otro procedimiento, versión y pruebas, no reutilizar esta interpolación.
- Un paso adverso de hasta un punto porcentual muestra efecto por acción y, sólo
  con posición utilizable, su efecto monetario. No es P&L, estrés conjunto, límite
  de pérdida o prioridad de investigación aprendida. No suma riesgos correlacionados.
- Pulsar simular cambia el borrador, no las fuentes, la cartera o la revisión
  guardada. Guardar conserva umbrales, supuestos e inputs en el registro existente.
  No se añaden retroactivamente condiciones a cálculos antiguos sin recalcular.
- Pruebas: `tests-node/thesis-valuation.test.mjs` y
  `tests-e2e/thesis-capital.spec.mjs`. La superioridad frente al benchmark sigue
  requiriendo comparar casos completos y utilidad, no contar funcionalidades.

## 17. Expediente v2 — estructura antes de interpretación

- El lector conserva cada tabla HTML física junto con sus filas y el contexto
  corto inmediatamente anterior (título/unidad cuando está ahí). No divide una
  tabla para encajarla en un fragmento ni toma contexto desde otra tabla. Los
  localizadores separan el inicio de tabla del inicio del contexto adjunto.
- `table.complete` significa cierre estructural sin tablas anidadas; NO certifica
  alineación contable, unidades, períodos, causas ni cálculos. Tablas anidadas o
  interrumpidas quedan fuera de la selección. Una tabla demasiado grande se
  conserva íntegra en los chunks y su exclusión presupuestaria queda explícita.
- La selección v2 reserva funciones documentales: descripción del negocio,
  cambios recientes, segmentos, estado de flujos, explicación de caja,
  obligaciones y riesgos. Usa encabezados y reglas textuales reproducibles;
  `selected` significa candidato seleccionado, no evidencia económica suficiente.
  Las ausencias permanecen `not_identified` o `budget_limited`; un relleno por
  coincidencias temáticas no cambia ese estado. Se mantienen tres extractos y
  seis mil caracteres máximos por sección. Un título aislado no ocupa una plaza.
- La política `economic-roles-v2` admite tablas completas de ingresos desagregados
  por productos/categorías en la función de composición del negocio. Una nota
  antigua de segmentos no desplaza esa evidencia más reciente sólo porque la
  tabla use «net sales by category» en vez de «segment revenue». Se conservan
  tabla, encabezados y localizador originales; la selección textual no certifica
  conciliación ni permite inferir recurrencia, márgenes de producto o causalidad.
- `economic-roles-v3` prioriza, dentro de la presentación más reciente con
  evidencia de desempeño, explicaciones de cambios en beneficio operativo o
  margen bruto frente a resúmenes de ventas. Complementa así la tabla de ingresos
  con evidencia sobre rentabilidad. Si no encuentra esa explicación conserva la
  selección de ventas; una mejora antigua no desplaza evidencia más reciente.
  Es recuperación textual, no una clasificación automática de beneficio recurrente:
  una mezcla favorable, devolución, cargo o mayor costo conserva la atribución y
  el período de la fuente. No se calcula beneficio normalizado desde esas palabras.
  Se conservan el máximo de tres extractos y seis mil caracteres por sección.
- La fuente pertinente prevalece sobre una coincidencia incidental más reciente:
  una nota de medición de valor razonable no desplaza automáticamente la sección
  de riesgos o una nota de vencimientos. Cada extracto conserva su fuente y fecha;
  los riesgos anuales no se presentan como novedades trimestrales.
- `compileDossier` mantiene lectura de paquetes v1 sin inventar estructura. El
  servicio live y el exportador reconstruyen v2 desde bytes originales; exportar
  verifica hashes y conserva el corte original. Los informes guardados no se
  reescriben y sus referencias no se reinterpretan con chunks nuevos.
- Regresiones: `tests-node/filing-structure.test.mjs`,
  `tests-node/filing-service.test.mjs` y `tests-node/filing-dossier.test.mjs`.
  Una extracción mejor no certifica al generador ni a su revisor semántico.

## 18. Cambio de caja — conciliación parcial reproducible

- `cash-change-bridge-v1` compara los dos últimos ejercicios adyacentes sobre
  la misma presentación. Cada componente exige período, unidad y accession
  compatibles con la caja operativa. No usa el modelo de lenguaje.
- Se muestran cambios de resultado neto, depreciación agregada, compensación
  en acciones y movimientos reportados de cuentas por cobrar, inventarios y
  cuentas por pagar. Sólo se admiten conceptos explícitos del estado de flujos;
  diferencias de saldos de balance no sustituyen movimientos de caja.
- El aumento reportado de activos operativos resta caja y el de pasivos suma;
  los valores negativos conservan su signo. Un ajuste no monetario no es una
  entrada de efectivo ni prueba de generación sostenible. El resultado neto
  atribuible al emisor tampoco certifica el perímetro consolidado de caja.
- El resto es exactamente cambio de caja operativa menos los aportes mostrados.
  No se etiqueta automáticamente como impuestos, capital de trabajo o causa
  económica. Puede incluir diferencias de perímetro y ajustes no extraídos.
  Un resto cero no eleva `explanationComplete`, que permanece falso.
- Los componentes ausentes se enumeran y no valen cero. Sin inversión física
  comparable no se publica el cambio de caja después de inversión. Las entidades
  financieras siguen fuera del diagnóstico. No hay valoración ni claim de alpha.
- La interfaz permite abrir los dos hechos detrás de cada aporte. El despliegue
  de esta conciliación no certifica la calidad de la narrativa automática.
- Regresiones: `tests-node/financial-reading.test.mjs`,
  `tests-node/thesis-financials.test.mjs`, `tests-e2e/financial-reading.spec.mjs`.

## 19. Actualidad financiera — acumulados y doce meses

- `interim-financials-v1` busca el 10-Q/10-Q-A más reciente del expediente,
  posterior al cierre anual. Período económico y aceptación son relojes distintos:
  una presentación posterior al corte no puede entrar aunque reporte un período
  anterior. Una enmienda incompleta no se sustituye silenciosamente por el original.
- El acumulado empieza al día siguiente del cierre anual. Su comparativo empieza
  al inicio del ejercicio anterior y cubre un tramo equivalente, con tolerancia
  explícita de ocho días para calendarios semanales. No usa el trimestre aislado
  con igual fecha de término ni suma frames trimestrales de caja.
- Las variaciones usan el mismo concepto y el mismo informe intermedio. Valores
  incompatibles permanecen pendientes; un conflicto no se rescata con otro tag.
  Los ausentes no se vuelven cero, las pérdidas se conservan y una base no positiva
  no produce un porcentaje de crecimiento.
- Doce meses = año cerrado + acumulado actual − acumulado anterior, con las tres
  fuentes, signos y fechas disponibles en la interfaz. Exige concepto, unidad y
  calendario compatibles. No es anualización, forecast ni historia PIT. Combinar
  filings no certifica que no hubo reclasificaciones: esa limitación queda visible
  y la reconstrucción no reemplaza automáticamente inputs de valoración guardados.
- La caja después de inversión resta sólo pagos por activos físicos. Un resultado
  negativo reconstruido de pagos de capex bloquea el agregado, no lo transforma
  en ingreso de caja. Sin capex compatible no se muestra un residual calculable.
- El acumulado aparece antes del contexto anual; las alertas del cierre anual
  se fechan como tales y no se presentan como diagnóstico del último trimestre.
- Lectores simultáneos de una misma empresa comparten la descarga documental en
  curso dentro de la instancia; no compiten entre sí por el gate BUSY. Los límites
  de I/O para emisores distintos se conservan. Esto no es una caché distribuida.
- Regresiones: `tests-node/interim-financials.test.mjs`,
  `tests-node/filing-service.test.mjs`, `tests-e2e/financial-reading.spec.mjs`.

## 20. Desglose de ingresos — contribución sin inferencia causal

- `revenue-breakdown-v1` reconstruye tablas del documento más reciente fijado en
  el expediente. Usa un subconjunto explícito de inline XBRL; no es un procesador
  general ni certifica cumplimiento XBRL. Una fuente más antigua no rescata la
  ausencia de desglose en la más reciente.
- Cada partición es una tabla física completa de productos, segmentos o geografía,
  con el mismo concepto, emisor, moneda y períodos. Se reconcilia contra ingresos
  consolidados en ambos años. No se buscan subconjuntos de filas para forzar una
  suma ni se suman dimensiones distintas. Tablas anidadas, hechos incompatibles y
  miembros incompletos quedan excluidos explícitamente.
- Los importes usan unidad, transformación, signo y escala declarados. La
  tolerancia procede de la precisión reportada y se calcula por período; nunca
  se presta tolerancia entre años. Una diferencia dentro de redondeo permanece
  visible y no se convierte en conciliación exacta.
- Aporte al crecimiento = cambio de ingresos de la actividad / ingresos
  consolidados anteriores. Se presenta en puntos porcentuales, conserva aportes
  negativos y no divide por el cambio total. Una base no positiva produce null.
- Cada fila conserva localizadores de ambos hechos, sus períodos y la fuente
  hasheada del expediente. Nombres derivados del identificador contable se
  distinguen de etiquetas extraídas de una fila. No se inventan traducciones
  semánticas de las actividades.
- Esta descomposición no demuestra precio, volumen, retención, recurrencia,
  rentabilidad o ventaja competitiva. `economicCauseVerified` permanece false.
  No modifica valoración ni prompts narrativos y no requiere llamadas al modelo.
- Regresiones: `tests-node/revenue-breakdown.test.mjs`,
  `tests-node/filing-service.test.mjs`, `tests-node/filing-dossier.test.mjs`,
  `tests-e2e/revenue-breakdown.spec.mjs`.

## 21. Reparación de formato — conservación antes de revisión

- La reparación no es una segunda redacción editorial. `preserveValidatedFields`
  conserva los campos originales que superan individualmente el contrato de forma,
  incluyendo preguntas, tareas y referencias válidas. No certifica su contenido.
- Un texto con cantidades no habilita a cambiar su fuente original válida. Un
  campo inválido necesita sustitución válida; la reparación no puede omitirlo
  silenciosamente ni añadir hallazgos a una lista original de forma válida.
- La revisión de evidencia y pertinencia se ejecuta DESPUÉS de esta conservación.
  Puede retirar preguntas válidas en formato pero irrelevantes o ya respondidas.
  No se publica la salida del helper como si fuese un informe revisado.
- La versión de generación cambia a v9 para no reutilizar informes cacheados
  producidos bajo la reparación editorial anterior. Las respuestas históricas
  guardadas no se reescriben.
- En v9 el protocolo experimental de revisión por referencias no estaba integrado.
  La integración local v10 se describe en la sección 23; no implica promoción a
  producción ni una mejora de fidelidad demostrada.
- Regresiones: `tests-node/report-reconstruction.test.mjs` y
  `tests-node/filing-analysis.test.mjs`.

## 22. Calibración del revisor — errores y evidencia por separado

- `check-review-controls.mjs` fija casos, etiquetas, respaldo requerido, fuentes
  y solicitud por hash antes de una llamada opt-in. Una ejecución hace como
  máximo una llamada; no reintenta ni sustituye resultados desfavorables.
- El modelo recibe identificadores opacos, afirmaciones y pasajes: nunca las
  etiquetas esperadas, los nombres diagnósticos de los casos ni las frases que
  el evaluador exigirá como respaldo. Empresas distintas no comparten identidades
  de extractos aunque los números locales de fuente coincidan.
- La evaluación distingue aprobaciones incorrectas, rechazos incorrectos y
  cobertura insuficiente en las citas de afirmaciones aprobadas. Rechazar todo
  o aprobar todo no supera un conjunto mixto. Una cita real pero irrelevante
  tampoco supera la comprobación de cobertura.
- `review-calibration-v2` mide por separado el veredicto semántico del modelo y
  la aceptación final del pipeline. Si el modelo aprueba una inferencia falsa
  pero una referencia inválida impide publicarla, sigue siendo un falso positivo
  del modelo, no una calibración exitosa. La abstención también se registra.
- Los casos pueden conservar múltiples fuentes citadas. Ninguna se elimina para
  simplificar una reproducción; el respaldo requerido debe pertenecer a esas
  fuentes. IDs duplicados, fuentes ausentes o selección singular/plural ambigua
  invalidan la entrada. Los controles antiguos de una fuente mantienen su hash.
- Las etiquetas de los controles actuales son adjudicaciones del agente sobre
  extractos reales; no son revisión humana independiente, muestra representativa
  ni estimación de exactitud en informes generados. `qualityCertified` sigue false.
- La reproducción exige los mismos hashes de casos y solicitud, sin otra llamada
  al proveedor. El modo de preparación no llama a la API y los archivos de resultado
  se crean sin sobrescribir una observación previa.
- Esta calibración no cambia automáticamente el modelo ni el protocolo publicado.
  El informe completo, las preguntas y la latencia necesitan verificación propia.
- Regresiones: `tests-node/review-calibration.test.mjs`; controles documentales:
  `tests-node/fixtures/reviewer-controls.mjs`.
- La reproducción de fallos reales vive en
  `tests-node/fixtures/review-aapl-observed-failure.json`: conserva las tres
  afirmaciones, ambas fuentes, IDs de pasajes y respuestas observadas de los
  ensayos low/medium. `tests-node/review-observed-failure.test.mjs` verifica que
  el evaluador los siga calificando como fallidos, incluso cuando la inferencia
  falsa tiene referencias válidas. Que esta regresión pase no significa que
  el generador esté corregido; certifica la detección de esos fallos históricos.

## 23. Integración v10 — procedencia comprobable, promoción pendiente

- `scripts/probe-filing-report.mjs` ejecuta el generador completo sin publicar en
  la base de datos ni reutilizar respuestas prefabricadas. `--prepare --input`
  crea un directorio nuevo con expediente, hashes de los archivos JS/JSON de
  `lib/`, lockfile, versión de Node y script de prueba. `--directory` inspecciona
  sin red; las llamadas exigen `--live` explícito. El hash amplio puede invalidar
  una prueba por cambios no relacionados; se prefiere eso a ignorar dependencias.
- Cada solicitud y respuesta tiene un registro inmutable; el estado reanudable
  está ligado al manifiesto y se escribe atómicamente. Una espera indicada por
  el proveedor no repite etapas completadas. Un fallo terminal no se reinicia
  silenciosamente. Los locks no se eliminan por considerarlos antiguos: si una
  ejecución muere, primero se debe verificar que su proceso terminó. Una petición
  sin respuesta registrada requiere resolver la interrupción antes de reintentar.
- El registro no guarda cabeceras de autorización ni mensajes con identificadores
  de cuenta. Conserva resultados de generación y límites numéricos del proveedor.
  Terminar técnicamente sigue dejando `qualityCertified: false`; la cobertura
  estructural del informe no certifica fidelidad, utilidad ni superioridad.
  Regresiones del probe: `tests-node/report-probe.test.mjs`.
- El generador local utiliza `reference-review-v1`: el revisor selecciona IDs de
  pasajes; el servidor reconstruye texto y posiciones desde el expediente original.
  Al proveedor se envían IDs y texto íntegro de cada pasaje, no las posiciones
  internas. No se truncan las fuentes para encajar una petición.
- v11.2 permite contrastar un revisor de otra familia mediante una opción interna
  del generador, no un parámetro del navegador. La política predeterminada no se
  cambia por una prueba favorable aislada. Modelo efectivo, solicitud y versión
  quedan ligados al recibo y al checkpoint; cambiar de revisor invalida la
  reanudación. No existe fallback silencioso hacia un modelo distinto.
- El adaptador de revisión Qwen solicita JSON Schema sin decodificación estricta;
  conserva todas las validaciones locales, el contraste de referencias y la
  reparación acotada. Un esquema solicitado no certifica la respuesta. El perfil
  es experimental: ni una discrepancia favorable ni su presencia en el código
  prueban que el informe completo sea entregable o mejor.
- La redacción recibe los textos íntegros, IDs, formularios y fechas de fuente.
  Hashes, URLs y offsets se conservan en el expediente y se resuelven en servidor,
  sin consumir presupuesto de lectura del modelo. No se quitan pasajes ni fechas.
- `tests-node/fixtures/review-aapl-scope-disagreement.json` conserva un error real:
  atribuir los mismos tres motores de crecimiento a todas las regiones cuando el
  pasaje distingue China y Japón. El replay verifica lo observado, incluido el
  falso positivo de la política predeterminada; NO certifica su calidad ni convierte
  un rechazo más estricto en un informe más útil. Las etiquetas no son revisión
  humana independiente. Regresión: `tests-node/filing-analysis.test.mjs`.
- Una referencia ajena, cobertura incompleta o una cláusula sin respaldo no permite
  aprobar una afirmación. Un conjunto mal formado no se repara descartando filas
  silenciosamente. Las preguntas necesitan su propia revisión de pertinencia.
- Una fecha o un localizador documental no se trata como un importe financiero.
  Esta distinción de formato no valida la fecha, su período ni su correspondencia
  con la afirmación; eso requiere contraste documental separado.
- v11.3 reconoce años de informes, trimestres explícitos y meses con año en español
  e inglés sin confundirlos con importes. Cantidades financieras posteriores a un
  localizador siguen rechazadas; una fecha sintácticamente válida no gana respaldo.
- `namedQuarterScope` añade una comprobación acotada sobre la afirmación y sus
  citas: si nombran trimestres incompatibles, la afirmación se retira aun cuando
  el revisor la apruebe y entra en el mismo ciclo acotado de reconstrucción.
  Se conserva el veredicto anterior al control y el motivo documental.
- No se deduce un trimestre fiscal desde una fecha, un pie de página ni la expresión
  «tres meses». Referencias implícitas o una posible diferencia calendario/fiscal
  quedan `unresolved`. Coincidencia de números de trimestre sólo significa
  `not_contradicted`: NO verifica años, atribución causal, magnitudes ni contenido.
  La aprobación de la IA sigue sin equivaler a verificación semántica.
  Regresiones: `tests-node/filing-analysis.test.mjs`, incluidos el rechazo y la
  reconstrucción de una afirmación de primer trimestre con fuente del tercero.
- HTTP 413 se tipa como `PROVIDER_REQUEST_TOO_LARGE`, sin espera ni reintento
  automático del mismo envío. Desde v10.1, si el proveedor declara un límite de
  tokens que coincide con su cabecera y una reserva solicitada superior, se permite
  UNA petición distinta reduciendo sólo la reserva de salida: exceso declarado
  más 128 tokens de margen, conservando al menos 2.048 tokens de salida. No se
  recortan fuentes, mensajes ni esquema. El techo reducido se mantiene durante
  reparaciones y etapas posteriores; límites incompletos, incompatibles o que no
  dejan esa reserva mínima no se adaptan. Una respuesta truncada sigue inválida.
  El ajuste comparte el plazo de 45 segundos por invocación y no reinicia su
  permiso al reanudar. El recibo registra `maxCompletionTokens` realmente usados.
  No se confunde con saturación temporal HTTP 429.
  Nunca se publica el mensaje crudo del proveedor ni sus datos de cuenta.
- Desde v11, la ruta autenticada guarda etapas en el almacén existente, con
  exclusión por lease. Un checkpoint liga motor, idioma, hash del expediente y
  fingerprint de cada solicitud; las etapas completadas se revalidan sin volver
  a generarlas. Una reparación interrumpida conserva el candidato original.
- Un 429 con espera explícita devuelve 202 pendiente y guarda `notBefore`, sin
  publicar el borrador. Consultar antes de esa fecha no llama al proveedor. La
  reanudación no consume otra admisión interna; el contador persistido limita
  el trabajo a 16 intentos externos en total, incluidas respuestas fallidas.
- Los checkpoints tienen checksum, caducan tras una hora sin guardado y no son
  informes. Un cambio sólo de fecha de descarga puede reutilizar trabajo, pero
  conserva el expediente y corte ORIGINAL. Un fallo de persistencia impide la
  siguiente llamada. No se promete exactamente-una-vez si el proceso muere entre
  recibir una respuesta externa y guardarla; tampoco se promete revisión humana.
- La página consulta sólo un pendiente confirmado, respeta la espera indicada
  (máximo 60 segundos por consulta, con `notBefore` aplicado en servidor) y limita
  la interacción a 115 segundos. Interrumpir esa espera no borra el avance.
  No se activa trabajo desatendido: avanzar requiere una consulta autenticada.
- Regresiones de reanudación: `tests-node/filing-analysis.test.mjs`,
  `tests-node/filing-report-cache.test.mjs`, `tests-node/analysis-client.test.mjs`.
- Desde v11.1, las referencias de preguntas que nombren un pasaje conocido del
  mismo paquete se resuelven a su documento conservando `originalSourceIds`.
  No se descartan referencias desconocidas para aceptar el resto; el conjunto
  sigue pendiente si contiene alguna. Esta corrección de identidad no certifica
  pertinencia económica ni transforma la revisión automática en prueba semántica.
- La clasificación sintáctica de v11.4 admite fechas documentales con mes escrito,
  con o sin año, y conserva el rechazo de importes adyacentes. No valida que la
  fecha sea correcta ni que corresponda al período de la afirmación. El fixture
  `aapl-recorded-date-repair.json` reproduce borrador y reparación reales con
  igualdad de hashes de solicitudes; termina antes de la revisión externa y no
  constituye un informe aprobado. Las cláusulas originales sintácticamente
  válidas siguen intactas para su revisión, incluso si parecen incorrectas.
  Regresión: `tests-node/filing-analysis.test.mjs`.
- Los controles curados de citas no bastan para promover esta integración. La
  prueba completa debe incluir el borrador real, reparaciones, preguntas, revisión
  de todas las cláusulas y presupuesto de ejecución. Una referencia válida no
  verifica causalidad, fuente de financiación, estabilidad ni interpretación.
- La integración sigue sin licencia de promoción: se observaron aprobaciones
  semánticamente indebidas y errores de contrato en la prueba de informe completo.
  Pasar pruebas de software no elimina este bloqueo de calidad; no se afirma
  mejora frente al sistema desplegado ni superioridad sobre otro producto.
- Una vista previa alojada es una entrega de prueba, no promoción del motor a
  producción ni certificación semántica. Sus enlaces de cuenta usan el hostname
  `VERCEL_URL` de ese despliegue y sus cookies son host-only; no heredan el dominio
  público de producción. Un hostname de preview ausente o inválido impide fabricar
  enlaces de cuenta. La regresión vive en `tests-node/preview-origin.test.mjs`.
- Regresiones: `tests-node/reference-analysis-integration.test.mjs`,
  `tests-node/reference-review.test.mjs`, `tests-node/filing-analysis.test.mjs`.

## 24. Caja y retornos al accionista — acumulado trazable

- El acumulado del informe fijado incorpora pagos por recompra de acciones comunes,
  dividendos totales y cambio de efectivo incluyendo efectivo restringido y efecto
  de cambio. Se reutiliza la carga financiera autenticada; no hay llamada al modelo.
- Saldo tras partidas seleccionadas = CFO − pagos por activos físicos − recompras
  comunes − dividendos totales. Todas las partidas deben compartir moneda, inicio,
  fin y accession. El saldo no es FCFF normalizado, saldo de efectivo disponible,
  ni demuestra la fuente que financió un pago concreto.
- `PaymentsOfDividendsCommonStock` no sustituye a dividendos totales. Datos ausentes,
  pagos negativos, conflictos o períodos incompatibles impiden el residual; un cero
  reportado sí es un dato. No se completan huecos desde un informe antiguo.
- Otros movimientos = cambio de efectivo reportado − saldo de partidas seleccionadas.
  Es una diferencia sin clasificación, no una reconciliación exhaustiva ni prueba
  independiente de exactitud. Conserva signo, fuentes y todos los términos.
- El desglose por actividad calcula inversión restante = flujo neto de inversión +
  pagos de activos físicos; financiación restante = flujo neto de financiación +
  recompras comunes + dividendos totales. Se retiran así los pagos ya contados en
  el puente principal: no se vuelve a restar el total de la actividad.
- Diferencia pendiente = cambio de efectivo − CFO − flujo neto de inversión − flujo
  neto de financiación. No se fuerza a cero ni se clasifica como divisas. Un subtotal
  faltante o conflictivo deja esa conciliación pendiente sin borrar otros datos.
- El desglose de actividades no es una atribución causal ni identificación del uso
  de una entrada particular. Cero diferencia tampoco certifica calidad económica,
  cobertura de todas las subpartidas o independencia de las fuentes.
- La vista muestra cifras y permite abrir el cálculo y documento de cada término.
  No modifica inputs guardados de valoración, cartera ni afirmaciones predictivas.
- Regresiones: `tests-node/interim-financials.test.mjs`,
  `tests-e2e/financial-reading.spec.mjs`.

## 25. Lectura económica y sensibilidad de ingresos y margen

- La lectura principal conecta contribuciones a ingresos, variación de caja tras
  pagos por activos físicos y asignación de caja. Es aritmética reproducible sobre
  documentos fijados; no usa otra llamada al modelo ni establece valor intrínseco.
- El desglose usa una partición completa, priorizando productos/servicios, luego
  segmentos y después geografía. No suma ejes alternativos. Se recalculan aportes
  desde los importes, verificando períodos, fuente y conciliación; una tolerancia
  de redondeo superior al 0,1% de su total no admite la síntesis.
- La principal contribución se elige por cambio firmado en la dirección del total
  (la mayor positiva si el total no cambia). No es el negocio de mayor tamaño ni
  prueba de causa. Con compensaciones, su aporte puede superar el 100% del cambio
  neto; con cambio neto cero, esa proporción queda indefinida.
- La sensibilidad conserva una fracción de la variación de esa partida y mantiene
  constantes las demás. Al 0% vuelve al nivel comparable anterior; al 100% conserva
  el observado. No anualiza, no pronostica y no convierte esa variación en precio.
- El puente de resultado operativo usa ingresos y EBIT de idénticos períodos,
  conceptos comparables, unidad y accession. Reconcilia `ΔEBIT = ΔIngresos ×
  margen_anterior + ingresos_actuales × Δmargen`. El orden asigna la interacción
  al margen: no es atribución causal, variación de volumen ni normalización.
  Márgenes negativos y deterioros no se descartan; ingresos no positivos o datos
  incompatibles dejan el puente pendiente. La falta de segmentos no bloquea la
  identidad consolidada cuando sus propias cifras son compatibles.
- La sensibilidad de margen mantiene los ingresos actuales y conserva entre 0%
  y 100% de su cambio observado. Volver a un margen anterior más alto es un
  escenario de mejora, no de pérdida. Nunca se presenta como límite del riesgo.
  La pregunta enviada a la tesis conserva el período, los márgenes, la fracción
  elegida y la fuente; no modifica ni guarda supuestos de valoración por sí sola.
- Caja y capex requieren períodos y accession compatibles; los años duran entre
  330 y 380 días y los acumulados entre 60 y 300 días. Un acumulado incompleto no
  se sustituye silenciosamente por un año anterior. Una conclusión conjunta sobre
  ingresos y caja requiere además la misma fuente, períodos y totales conciliados.
- La asignación retira de los subtotales de inversión/financiación los pagos ya
  incluidos. Un dato faltante queda pendiente, no en cero. No atribuye financiación
  causal ni clasifica automáticamente la diferencia restante como efecto cambiario.
- “Contrastar en mi tesis” ofrece una pregunta y una comprobación. Importarlas
  exige una acción explícita y sólo llena campos vacíos del mismo expediente y
  corte; no reemplaza hipótesis, evidencia ni revisiones guardadas. No confiere
  respaldo documental a la hipótesis: el usuario debe contrastarla y guardar aparte.
- La síntesis precede al detalle expandible; los fallos de carga y reintentos
  permanecen visibles. Los informes de IA conservan sus límites de revisión.
- Regresiones: `tests-node/economic-brief.test.mjs`,
  `tests-node/research-question.test.mjs`, `tests-e2e/economic-brief.spec.mjs`.

## 26. Inversión observada y supuestos de valoración

- `reinvestment-diagnostic-v1` vincula pagos por activos físicos, depreciación
  física (`Depreciation`, no D&A total) e ingresos del mismo ejercicio, accession,
  fecha de disponibilidad y hashes. Ausencias, conflictos y períodos incompatibles
  impiden la prueba; no se rescatan desde otro ejercicio o concepto.
- La diferencia pagos menos depreciación NO identifica mantenimiento ni expansión.
  No incluye inversión sin desembolso, intangibles ni capital de trabajo. Su signo
  se conserva; un saldo no positivo no se proyecta como liberación perpetua de caja.
- La comparación mantiene ventas constantes a perpetuidad en AMBOS casos y conserva
  trayectoria de margen, tasa, impuestos y puente al accionista del usuario. Compara
  carga neta adicional cero contra repetición de la diferencia observada. No es una
  comparación con el escenario de crecimiento activo ni una estimación de valor justo.
- La carga no se recorta si supera el dominio de 30% de ingresos. El valor por
  acción respeta los mismos bloqueos del motor existente. El precio no cambia
  el valor operativo y la prueba no modifica el control FCFF ni introduce retornos.
- Aplicar la segunda explicación exige un clic y cambia juntos crecimiento,
  crecimiento terminal y mantenimiento neto. No suma a la vez reinversión por
  crecimiento, no guarda automáticamente ni marca como revisado el puente de capital.
- Los datos antiguos sin depreciación física requieren actualización explícita de
  inputs; no se modifican snapshots guardados. Regresiones: `tests-node/reinvestment-diagnostic.test.mjs`,
  `tests-node/thesis-financials.test.mjs`, `tests-e2e/thesis-capital.spec.mjs`.
