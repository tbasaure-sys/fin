# BLS Prime — State Contract v1 + Logic Review

## 1) Objetivo de este documento

Traducir la propuesta estratégica de BLS Prime a un contrato operativo y matemático que sirva para tres cosas a la vez:

1. definir con precisión qué mide el sistema,
2. separar claramente medición, inferencia y prescripción,
3. permitir que UI y API consuman exactamente la misma verdad.

La tesis sigue siendo la misma:

**BLS Prime debe ser un sistema de decisiones de recuperabilidad para portafolios bajo estrés.**

Pero esta versión corrige varios problemas lógicos de la formulación anterior.

---

## 2) Revisión lógica de la propuesta anterior

### Corrección 1 — Recoverability no debe ser una mezcla vaga de proxies

La propuesta anterior corría el riesgo de mezclar en un solo score:

- compresión estructural,
- probabilidad de rebote,
- concentración del portafolio,
- liquidez,
- calidad del rebote.

Eso es intuitivo, pero conceptualmente débil.

**Corrección:**

`recoverability` debe ser el objeto principal y debe vivir en una escala probabilística propia.

Las métricas estructurales (`D_eff`, compresión, breadth, spectral dominance, etc.) deben tratarse como **bridge variables** o biomarcadores estructurales, no como recoverability en sí.

### Corrección 2 — Hay que separar “visible improvement” de “true recoverability”

El producto quiere distinguir entre:

- rebote visible de precio,
- mejora estructural real,
- capacidad del libro para sobrevivir otra perturbación.

Eso exige tres objetos distintos.

**Corrección:**

- `VisibleCorrectionProb`
- `StructuralRestorationProb`
- `RecoverabilityProb`

Así se evita llamar “recoverable” a un estado que solo está haciendo price relief.

### Corrección 3 — `G` y `R` no deben fingir una causalidad más fuerte que la evidencia

`G` y `R` son potentes como lenguaje y como compresión productiva.

Pero v1 no debe presentarlos como “las dos causas verdaderas” de la volatilidad. Deben definirse como:

- probabilidad de dominancia estructural de la inestabilidad,
- probabilidad de dominancia de shock/régimen transitorio.

Es decir: **clasificación calibrada**, no ontología dura.

### Corrección 4 — La frontera de acción debe depender del mandato y de la incertidumbre

Mi formulación anterior ponía demasiado peso en la idea de “action rights” sin explicitar que:

- los rights dependen del mandato del usuario,
- dependen de la autoridad del modelo hoy,
- y deben tener hysteresis para no flippear todos los días.

**Corrección:**

La frontera legítima de acción se define sobre:

- estado actual,
- portafolio actual,
- restricciones del mandato,
- nivel de autoridad,
- límites del modo operativo.

### Corrección 5 — El optimizer continuo completo es demasiado ambicioso para v1

Un optimizer continuo elegante puede terminar siendo frágil, opaco y difícil de validar.

**Corrección:**

v1 debe usar **candidate-set search + sparse bundles**:

- generar ideas de add / trim / switch / hedge,
- evaluar bundles de 1–3 movimientos,
- rankear por mejora de recuperabilidad neta de turnover y complejidad.

Eso es mucho más interpretable y comercializable.

### Corrección 6 — Trust / Authority debe tener evidencia explícita

No basta con mostrar “confidence”.

Hay que mostrar por qué el sistema merece o no merece hablar fuerte:

- calibración histórica relevante,
- soporte muestral efectivo,
- estabilidad del estado reciente,
- completitud de datos.

Por eso `Authority` no será una opinión narrativa, sino un output formal.

---

## 3) Arquitectura lógica final

La arquitectura correcta queda así:

```text
Raw data
  -> Measured State
  -> Probabilistic State
  -> Policy State
  -> Repair Search
  -> UI / API / exportable brief
```

Y el orden epistemológico es este:

1. **medir** lo que sí es medible,
2. **inferir** probabilidades calibradas,
3. **aplicar policy** sobre esas probabilidades,
4. **buscar reparaciones** solo dentro del espacio permitido.

---

## 4) Taxonomía de outputs

### A. Measured State
Son variables descriptivas. No deben sonar como predicción.

- `market_effective_dimension`
- `market_dominance_share`
- `market_compression`
- `breadth`
- `median_pairwise_corr`
- `portfolio_hhi`
- `portfolio_factor_dimension`
- `portfolio_fragility_exposure`
- `portfolio_liquidity_buffer`
- `portfolio_drawdown`
- `benchmark_drawdown`

### B. Probabilistic State
Son inferencias calibradas con incertidumbre.

- `p_structural_dominance`  (`G`)
- `p_regime_shock_dominance` (`R`)
- `p_visible_correction_h`
- `p_structural_restoration_h`
- `p_phantom_rebound_h`
- `p_portfolio_recoverability_h`
- `p_extreme_drawdown_h`
- `authority_score`

### C. Policy State
Son decisiones normativas del sistema. No son “verdades”; son reglas de gobierno.

- `mode`
- `max_gross_add`
- `max_single_name_add`
- `hedge_floor`
- `allowed_sleeves`
- `forbidden_sleeves`
- `review_cadence`
- `rebalance_delay`
- `required_confirmation`
- `invalidation_rules`

### D. Repair Objects
Son propuestas concretas, evaluadas bajo la policy vigente.

- `repair_candidates`
- `trim_priority`
- `add_priority`
- `switch_priority`
- `repair_efficiency`
- `binding_constraints`

---

## 5) Definiciones matemáticas centrales

## 5.1 Estado estructural del mercado

Sea `Σ_t` una matriz de covarianza o correlación robusta del universo elegible en una ventana móvil.

### 5.1.1 Effective dimension

Usar la participación efectiva estándar:

\[
D^{M}_{eff,t} = \frac{(\operatorname{tr}\Sigma_t)^2}{\operatorname{tr}(\Sigma_t^2)}
\]

Esto evita depender de la cantidad bruta de nombres. Si el mercado empieza a moverse como pocos modos, `D_eff` cae.

### 5.1.2 Dominance share

Sea `λ_1` el mayor autovalor.

\[
Dom_t = \frac{\lambda_{1,t}}{\operatorname{tr}(\Sigma_t)}
\]

Mientras mayor `Dom_t`, más domina el modo principal.

### 5.1.3 Compression score

Definir un score monotónico:

\[
Comp_t = \sigma\left(
 a_0
 + a_1 z(Dom_t)
 - a_2 z(D^{M}_{eff,t})
 + a_3 z(\bar\rho_t)
 - a_4 z(Breadth_t)
 + a_5 z(LiqStress_t)
\right)
\]

con `σ` logística y `z(.)` estandarización rolling.

Interpretación:

- sube si domina un modo,
- sube si cae la dimensión efectiva,
- sube si sube correlación,
- sube si cae breadth,
- sube si empeora liquidez.

---

## 5.2 `G` y `R`

No se modelan como cantidades que suman 1 por definición.

### 5.2.1 Structural dominance probability

\[
G_t = P(\text{structural fragility-dominated state} \mid X_t)
\]

### 5.2.2 Regime-shock dominance probability

\[
R_t = P(\text{shock/transient-dominated state} \mid X_t)
\]

Con features típicos:

- para `G`: compresión, `D_eff`, dominance share, breadth, crowding, persistencia de correlación, falsa diversificación,
- para `R`: jump intensity, downside vol corta, drawdown speed, liquidation signatures, gap frequency, vol-of-vol.

### 5.2.3 Cluster type

\[
ClusterType_t=
\begin{cases}
\text{compound} & G_t>\tau_G \land R_t>\tau_R \\
\text{G-dominated} & G_t-R_t>\delta \land G_t>\tau_G \\
\text{R-dominated} & R_t-G_t>\delta \land R_t>\tau_R \\
\text{mixed} & \text{otherwise}
\end{cases}
\]

---

## 5.3 Visible correction, structural restoration y phantom rebound

Aquí está la separación más importante.

### 5.3.1 Visible correction probability

Definir un evento visible a horizonte `h`:

\[
Y^C_{t,h}=1\{R^{bench}_{t\to t+h} > c_0 \ \text{o}\ DD_{t+h} < DD_t-c_1\}
\]

Entonces:

\[
VC_t(h)=P(Y^C_{t,h}=1\mid s_t)
\]

Esto es “probabilidad de alivio visible”.

### 5.3.2 Structural restoration event

Definir:

\[
Y^S_{t,h}=1\{\Delta D^{M}_{eff}>d_0,\ \Delta Dom< -u_0,\ \Delta Breadth>b_0\}
\]

Entonces:

\[
SR_t(h)=P(Y^S_{t,h}=1 \mid Y^C_{t,h}=1, s_t)
\]

Esto es “probabilidad de que el rebote sea estructuralmente reparador”.

### 5.3.3 Phantom rebound probability

\[
PR_t(h)=P(Y^C_{t,h}=1,\ Y^S_{t,h}=0 \mid s_t)
\]

Interpretación:

- el precio mejora,
- pero la arquitectura no se reabre.

En UI puede llamarse `Legitimacy Risk`, pero matemáticamente es mejor tratarlo como `phantom rebound probability`.

---

## 5.4 Recoverability como probabilidad primaria

Esta es la corrección mayor respecto de la propuesta anterior.

`Recoverability` no será una mezcla opaca de compresión + liquidez + confianza.

Será una **probabilidad de supervivencia del portafolio bajo un set de desafíos estandarizados**.

### 5.4.1 Challenge set

Sea `𝒞_t` un conjunto finito de shocks / desafíos relevantes al estado actual, con pesos `π_c(s_t)`.

Ejemplos de desafíos:

- compresión adicional de factor dominante,
- shock de rates / USD,
- widening de spreads / liquidez,
- gap idiosincrático en top holdings,
- replay de análogos estructuralmente cercanos.

### 5.4.2 Survival under challenge

Sea `w` el vector de pesos del portafolio.

Definir un evento de supervivencia:

\[
Y^{R,P}_{t,h}(w,c)=1\{DD^P_{t\to t+h}(w,c)\le d_{max},\ 
Loss^P_{t\to t+h}(w,c)\le l_{max},\ 
LiqBreach(w,c)=0\}
\]

Entonces la recuperabilidad primaria del portafolio es:

\[
RP_t(h,w)=\sum_{c\in \mathcal{C}_t} \pi_c(s_t)\, P(Y^{R,P}_{t,h}(w,c)=1 \mid s_t)
\]

y el score visible puede ser simplemente:

\[
RecoverabilityScore_t = 100\cdot RP_t(h,w)
\]

**Esto sí respeta la jerarquía correcta:**

- recoverability = objeto primario,
- estructura = biomarcador puente,
- policy = capa normativa posterior.

---

## 5.5 Crash probability

Aparte de `RP`, conviene mantener una probabilidad de drawdown extremo más clásica:

\[
XD_t(h,w)=P(DD^P_{t\to t+h}(w) \ge d^* \mid s_t)
\]

Esto no reemplaza `RP`, pero sirve como guardrail adicional.

---

## 5.6 Portfolio structure

### 5.6.1 Concentration

\[
HHI(w)=\sum_i w_i^2
\]

### 5.6.2 Effective factor dimension of the book

Sea `b=B^T w` la exposición del libro a una base de factores.

\[
q_j=\frac{b_j^2}{\sum_k b_k^2}, \qquad
D^{P}_{eff}(w)=\frac{1}{\sum_j q_j^2}
\]

### 5.6.3 Fragility exposure

\[
FragExp_t(w)=\sum_i w_i\,\phi_{i,t}
\]

con `φ_{i,t}` construido desde crowding, liquidez, correlación al modo dominante, convexidad de downside, gap risk e idiosyncratic fragility.

### 5.6.4 Liquidity buffer

\[
LiqBuf_t(w)=w_{cash}+\sum_i w_i\ell_{i,t}
\]

con `ℓ_{i,t}\in[0,1]` representando facilidad de salida / resiliencia de ejecución.

---

## 5.7 Authority

`Authority` no debe ser una narrativa. Debe ser un agregado explícito de cuatro piezas:

- `Cal_t`: calidad de calibración en estados cercanos,
- `Cov_t`: soporte muestral efectivo / analog coverage,
- `Stab_t`: estabilidad del estado reciente,
- `Data_t`: completitud y calidad de datos.

Definir cada componente en `[0,1]` y agregarlos con media armónica ponderada:

\[
Authority_t = 100\cdot \left(\sum_{j=1}^{4}\frac{\omega_j}{q_{j,t}}\right)^{-1}
\quad \text{con } q_{j,t}\in(0,1]
\]

Esto penaliza mucho el eslabón débil sin ser tan brutal como `min(.)`.

Regla adicional:

\[
Authority_t \le 100\cdot Cov_t
\]

para evitar que el sistema suene fuerte con poco soporte histórico.

---

## 6) Modo operativo con hysteresis

Los modos no deben cambiar por un tick.

### 6.1 Variables de entrada

- `RP_t`
- `PR_t`
- `XD_t`
- `Authority_t`

### 6.2 Reglas de entrada sugeridas

- `Protect`: entrar si `RP < 0.45` o `PR > 0.50` o `Authority < 40`
- `Observe`: entrar si `RP ∈ [0.45, 0.60)` o señales mezcladas
- `Stage`: entrar si `RP ≥ 0.60`, `PR ≤ 0.35`, `Authority ≥ 50`
- `Act`: entrar si `RP ≥ 0.72`, `PR ≤ 0.20`, `Authority ≥ 65`, `XD` bajo

### 6.3 Hysteresis de salida sugerida

Un modo solo sale si cruza umbrales más amplios que los de entrada.

Ejemplo:

- `Act` sale si `RP < 0.62` o `PR > 0.30` o `Authority < 50`

Así se evita flip rate diario.

---

## 7) Action Legitimacy Frontier

Sea `M` el mandato del usuario y `𝔽(M)` el conjunto factible por mandato, liquidez, sleeves permitidos y restricciones regulatorias/operativas.

La frontera legítima de acción es:

\[
\mathcal{L}_t(w;M)=\left\{\Delta w \in \mathcal{F}(M):
\begin{array}{l}
RP_t(h,w+\Delta w) \ge r_{min}(mode),\\
PR_t(h,w+\Delta w) \le p_{max}(mode),\\
XD_t(h,w+\Delta w) \le x_{max}(mode),\\
\|\Delta w\|_1 \le T_{max}(mode),\\
Authority_t \ge a_{min}(mode)
\end{array}
\right\}
\]

Interpretación:

un movimiento solo es “legítimo” si, después de hacerlo,

- el libro sigue siendo suficientemente recuperable,
- el riesgo de phantom rebound no se dispara,
- el drawdown extremo esperado queda dentro de límites,
- el turnover no viola el modo,
- y el sistema tiene suficiente autoridad para hablar fuerte.

### 7.1 Recoverability budget

\[
RB_t(w)=\max_{\Delta w\in\mathcal{L}_t(w;M)} \mathbf{1}^\top(\Delta w)^+
\]

Eso define cuánto gross add total es defendible hoy.

### 7.2 Single-name cap

\[
RB_{i,t}^{name}=\max\{(\Delta w_i)^+ : \Delta w\in\mathcal{L}_t(w;M)\}
\]

---

## 8) Repair Engine v1

## 8.1 Decisión de diseño

No usar un optimizer continuo pleno en v1.

Usar este pipeline:

1. generar candidatos:
   - trims,
   - adds,
   - add-funded-by-trim,
   - switches,
   - hedge overlays,
2. construir bundles escasos de 1–3 movimientos,
3. filtrar bundles fuera de `𝓛_t`,
4. rankear por mejora de recuperabilidad neta.

## 8.2 Score de repair

Para un bundle `Δw`:

\[
RepairScore_t(\Delta w)=
\Delta RP_t(\Delta w)
- \lambda_T TC(\Delta w)
- \lambda_C Complexity(\Delta w)
- \lambda_P \Delta PR_t(\Delta w)
\]

con

\[
\Delta RP_t(\Delta w)=RP_t(h,w+\Delta w)-RP_t(h,w)
\]

### 8.2.1 Repair efficiency

\[
RE_t(\Delta w)=\frac{\Delta RP_t(\Delta w)}{TC(\Delta w)+\lambda_C Complexity(\Delta w)+\varepsilon}
\]

### 8.2.2 Clasificación de repairs

**Real repair**

\[
\Delta RP>0,\quad \Delta PR\le0,\quad \Delta FragExp<0
\]

**Cosmetic de-risking**

\[
Risk\downarrow\ \text{pero}\ \Delta RP\le0
\]

**Optionality-preserving defense**

\[
\Delta PR<0,\quad \Delta RP\approx 0,\quad LiqBuf\uparrow
\]

---

## 9) Contribución por holding

Para explicar por qué una posición empeora o mejora el libro, usar perturbaciones pequeñas.

### 9.1 Trim priority

\[
TrimGain_{i,t}=RP_t(h,w-\epsilon e_i+\epsilon c)-RP_t(h,w)
\]

donde `c` es caja o sleeve financiador.

### 9.2 Add priority

\[
AddGain_{i,t}=RP_t(h,w+\epsilon e_i-\epsilon c)-RP_t(h,w)
\]

Esto basta para v1.

Shapley values pueden venir después, pero no hacen falta para lanzar un producto interpretable.

---

## 10) Canonical state object

```json
{
  "as_of": "2026-03-17",
  "portfolio_id": "demo",
  "horizon_days": 20,
  "measured_state": {
    "market_effective_dimension": 6.4,
    "market_dominance_share": 0.34,
    "market_compression": 0.71,
    "breadth": 0.42,
    "median_pairwise_corr": 0.58,
    "portfolio_hhi": 0.11,
    "portfolio_factor_dimension": 3.2,
    "portfolio_fragility_exposure": 0.63,
    "portfolio_liquidity_buffer": 0.18,
    "portfolio_drawdown": -0.12,
    "benchmark_drawdown": -0.09
  },
  "probabilistic_state": {
    "p_structural_dominance": 0.78,
    "p_regime_shock_dominance": 0.31,
    "cluster_type": "G-dominated",
    "p_visible_correction": 0.57,
    "p_structural_restoration": 0.29,
    "p_phantom_rebound": 0.40,
    "p_portfolio_recoverability": 0.46,
    "p_extreme_drawdown": 0.18,
    "authority_score": 52
  },
  "policy_state": {
    "mode": "observe",
    "max_gross_add": 0.04,
    "max_single_name_add": 0.01,
    "hedge_floor": 0.06,
    "allowed_sleeves": ["defensive_compounders", "index_hedge"],
    "forbidden_sleeves": ["crowded_optional_high_beta"],
    "review_cadence": "48h",
    "rebalance_delay": "1d",
    "required_confirmation": "breadth_up_and_dom_down",
    "invalidation_rules": [
      "p_portfolio_recoverability_below_0_42",
      "p_phantom_rebound_above_0_48"
    ]
  },
  "repair_candidates": [
    {
      "id": "repair_01",
      "trade_set": [
        "trim NAME_A 1.5%",
        "add NAME_B 1.0%",
        "add hedge 0.5%"
      ],
      "delta_recoverability": 0.07,
      "delta_phantom": -0.05,
      "delta_extreme_drawdown": -0.03,
      "repair_efficiency": 1.42,
      "classification": "real_repair",
      "binding_constraints": ["single_name_cap"]
    }
  ],
  "uncertainty": {
    "calibration_component": 0.63,
    "coverage_component": 0.52,
    "stability_component": 0.68,
    "data_component": 0.91,
    "evidence_tier": "beta",
    "model_version": "state_contract_v1"
  }
}
```

---

## 11) Qué va en UI y qué va en API

## 11.1 UI principal: Stress Mode

La primera pantalla debe responder en este orden:

1. `cluster_type`
2. `p_portfolio_recoverability`
3. `p_phantom_rebound`
4. `mode`
5. `top 3 repair candidates`

Todo lo demás baja de nivel.

## 11.2 API mínima

- `GET /state`
- `GET /policy`
- `GET /repairs`
- `GET /analogs`

No exponer señales crudas sin contrato.

---

## 12) Acceptance tests de v1

### Test 1 — Jerarquía epistemológica

Ningún output prescriptivo se emite si falta el probabilistic state relevante.

### Test 2 — No naked scores

Todo score debe incluir:

- definición,
- rango,
- horizonte,
- evidencia tier,
- incertidumbre.

### Test 3 — No orphan recommendations

Ningún repair candidate aparece sin:

- `delta_recoverability`,
- `delta_phantom`,
- funding source,
- invalidation.

### Test 4 — Monotonicidad

- más compresión no puede bajar `p_structural_dominance`,
- menor autoridad no puede expandir `max_gross_add`,
- mayor `p_phantom_rebound` no puede mejorar el modo operativo.

### Test 5 — Hysteresis

El modo no puede flippear si las señales se mueven dentro del buffer de salida.

---

## 13) Roadmap inmediato de build

## Sprint A — 5 a 7 días

- cerrar definiciones finales de outputs,
- fijar horizontes por defecto (`5d`, `20d`),
- escribir el JSON schema definitivo,
- etiquetar cada campo como `measured`, `estimated` o `policy`.

## Sprint B — 7 a 10 días

- implementar `Measured State`,
- implementar `VC`, `SR`, `PR`, `RP`, `Authority`,
- construir generator de candidate bundles,
- exponer endpoints internos.

## Sprint C — 7 a 10 días

- montar `Stress Mode`,
- mostrar modo + rights + repairs + evidence,
- correr tests de monotonicidad, calibración y flip-rate.

---

## 14) Conclusión ejecutiva

La versión corregida de la tesis es esta:

**BLS Prime no debe tratar recoverability como una metáfora compuesta. Debe tratarla como una probabilidad primaria de supervivencia del portafolio bajo desafíos estandarizados, usando compresión, dimensión efectiva, breadth y demás métricas como biomarcadores estructurales puente.**

Y a partir de ahí:

- `G` y `R` clasifican el tipo de inestabilidad,
- `VisibleCorrectionProb` detecta alivio visible,
- `StructuralRestorationProb` detecta si el rebote reabre estructura,
- `PhantomReboundProb` detecta rebote engañoso,
- `RecoverabilityProb` gobierna la policy,
- la `Action Legitimacy Frontier` restringe el espacio de acción,
- el `Repair Engine` busca el menor set de cambios que mejora recuperabilidad de verdad.

Eso ya es un stack coherente, auditable, interpretable y productizable.
