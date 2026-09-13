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
  resultado original; una nueva simulación usa v1.1.
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
