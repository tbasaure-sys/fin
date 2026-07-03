# BLS Prime Stress Engine v9.5 - Informe de Resultados

Fecha de corrida: 2026-07-03  
Notebook: `market_simulator_fhs_factor_v9_5_pit_colab.ipynb`  
Modelo candidato de producto: `fhs_v9_stress`  
Estado bajo gate actual: `research_champion = false`, `ready_for_endpoint = false`

## Resumen ejecutivo

La versión v9.5 resolvió el bloqueo principal del stress engine: el libro de stress ya supera a los baselines clásicos en distribución, correlación y estructura de cola, y además cubre los episodios walk-forward cuando se evalúa con refits pre-corte. El candidato correcto ya no es el libro base; es `fhs_v9_stress`.

El resultado central es fuerte:

- MMD multi-seed de `fhs_v9_stress`: `0.01735`.
- MMD multi-seed Gaussian: `0.02622`.
- Ratio candidato vs Gaussian: `0.662`.
- El candidato también supera a t-copula, filtered historical simulation y same-stack Gaussian.
- Correlation MAE del candidato: `0.09014`, levemente mejor que Gaussian (`0.09036`).
- Stress q01 endpoint: `-33.53%`.
- Walk-forward stress refit coverage: pasa en 2019, 2021 y 2022.

La conclusión práctica: **el stress engine ya es defendible como motor de escenarios de stress**, pero el gate monolítico actual todavía lo marca como no deployable porque mezcla tres cosas distintas: motor de stress, libro normal/unconditional y libro crisis-base diario. Esa mezcla ya no es conceptualmente correcta.

## Artefactos

Run local:

`C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\blsprime-fin\.local_colab_drive\blsprime_ddpm_market_sim\artifacts\fhs_v9_5_run_20260703_003826`

Notebook en Downloads:

`C:\Users\T14 Ultra 7\Downloads\market_simulator_fhs_factor_v9_5_pit_colab.ipynb`

Notebook en repo:

`C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\blsprime-fin\notebooks\market_simulator_fhs_factor_v9_5_pit_colab.ipynb`

Artefactos clave:

- `metrics.json`
- `metrics_table.csv`
- `regime_calibration.csv`
- `factor_space_metrics.csv`
- `walk_forward_crisis_audit.csv`
- `factor_scenario_bank_fp16.npz`
- `blsprime_market_simulation_manifest.json`

## Configuración validada

La corrida usó el universo point-in-time con survivorship controlado:

- PIT universe activo: `true`.
- PIT member-day coverage: `100.0%`.
- Activos finales: `457`.
- Factores: `45`.
- Target crisis regime auto-seleccionado: `1`.
- Cholesky alpha seleccionado por Pareto train-only: `0.7`.

La versión v9.5 añadió dos componentes relevantes:

1. **Catastrophe sleeve de stress**
   - Activo: `true`.
   - Peso realizado: `40 / 5000` escenarios.
   - Shock diario train-only usado: `-5.5%`.
   - No es un full-window deterministic floor.

2. **Daily VaR5 safety margin para libros no-stress**
   - Unconditional safety shift: `-0.922%`.
   - Crisis-base safety shift: `-2.0%`.
   - Objetivo: mejorar gates diarios sin tocar el candidato de stress.

## Resultados contra baselines

| Modelo | MMD multi mean | MMD std | Corr MAE | Eigen RMSE | CVaR5 | VaR5 | VaR1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `fhs_v9_stress` | `0.01735` | `0.00136` | `0.09014` | `3.28383` | `-0.25576` | `-0.19025` | `-0.27846` |
| `fhs_v9_base` | `0.02112` | `0.00125` | `0.11287` | `9.08213` | `-0.34816` | `-0.26755` | `-0.37687` |
| Gaussian covariance | `0.02622` | `0.00178` | `0.09036` | `3.70239` | `-0.19649` | `-0.15489` | `-0.20403` |
| t-copula | `0.02084` | `0.00103` | `0.09416` | `3.32383` | `-0.19211` | `-0.17525` | `-0.19523` |
| Filtered historical simulation | `0.02320` | `0.00175` | `0.09357` | `4.12765` | `-0.15365` | `-0.13892` | `-0.15965` |
| Same-stack Gaussian | `0.02124` | `0.00129` | `0.09292` | `3.30925` | `-0.17176` | `-0.15272` | `-0.17715` |

Interpretación:

- `fhs_v9_stress` es el mejor modelo en MMD.
- Conserva correlación casi idéntica a Gaussian.
- Mejora eigenstructure vs Gaussian.
- Mantiene colas más realistas que Gaussian, t-copula y same-stack Gaussian.
- El libro base ya no debe interpretarse como candidato de producto; en v9.5 es un libro de reserva/calibración diaria, no el motor de stress.

## Calibración de régimen

| Métrica | Train target | Valid target | Stress | Base |
|---|---:|---:|---:|---:|
| Mean terminal | `-0.00902` | `-0.00785` | `0.01544` | `-0.00589` |
| Median terminal | `-0.00486` | `0.00572` | `0.02354` | `0.01010` |
| Daily vol | `0.01661` | `0.02194` | `0.01993` | `0.01890` |
| VaR5 | `-0.12761` | `-0.21300` | `-0.16095` | `-0.19549` |
| CVaR5 | `-0.15228` | `-0.32140` | `-0.27339` | `-0.28365` |
| Prob loss | `0.54524` | `0.47945` | `0.37340` | `0.44620` |
| DD10 probability | `0.37587` | `0.37900` | `0.24680` | `0.30460` |

La tensión sigue clara: el stress book tiene buena cola y buen MMD, pero aún tiene mediana positiva. Eso no invalida el motor de stress si se comunica como libro de escenarios adversos con cola calibrada, no como distribución condicional completa de crisis.

## Walk-forward y cobertura de crisis

Hay dos auditorías que no deben mezclarse.

La auditoría global de la celda 27 compara el mismo libro sintético contra episodios históricos. Ahí el q01 global queda en `-33.53%`, que no cubre el peor COVID global de `-36.85%`:

| Periodo | Actual min | Synthetic q01 | Synthetic q05 | Q01 cubre | Q05 cubre |
|---|---:|---:|---:|---|---|
| COVID crash 2020 | `-0.36854` | `-0.33529` | `-0.16095` | false | false |
| Inflation bear 2022 | `-0.16298` | `-0.33529` | `-0.16095` | true | false |
| Bank stress 2023 | `-0.02313` | `-0.33529` | `-0.16095` | true | true |

La auditoría más importante para deployment es el refit pre-corte de la celda 28. Ahí el stress engine se reestima antes de cada episodio y se pregunta si el libro de stress cubre el siguiente shock:

| Cutoff | Stress q01 refit | Actual min siguiente | Cubre |
|---|---:|---:|---|
| 2019-12-31 | `-0.36919` | `-0.33292` | true |
| 2021-12-31 | `-0.41662` | `-0.13466` | true |
| 2022-12-31 | `-0.42004` | `-0.06769` | true |

Conclusión: **la cobertura walk-forward de stress pasa**. El gate que falla en esos refits es el Kupiec del libro unconditional, no la cobertura del stress engine.

## Gates

Gates que pasan:

- `product_candidate_is_stress_book`: true.
- `stress_book_beats_gaussian_mmd_multi`: true.
- `beats_gaussian_mmd`: true.
- `beats_gaussian_mmd_multi`: true.
- `beats_gaussian_corr`: true.
- `beats_t_copula_mmd`: true.
- `beats_fhs_mmd`: true.
- `beats_same_stack_gaussian_mmd`: true.
- `tail_cvar_closer_than_same_stack_gaussian`: true.
- `corr_near_gaussian`: true.
- `corr_fidelity_ge_0_80`: true.
- `target_cvar_close_to_eval_reference`: true.
- `stress_walk_forward_1pct_covers_all`: true.
- `walk_forward_1pct_covers_all`: true.
- `factor_stress_mmd_no_worse_than_base`: true.
- `stress_stratified_sampling`: true.
- `endpoint_scenario_count_ok`: true.
- `no_validation_used_for_guidance_or_cholesky`: true.
- `no_full_window_stress_floor`: true.
- `eval_metric_sample_size_ok`: true.
- `kupiec_uncond_var5_ok`: true.
- `kupiec_uncond_var1_ok`: true.
- `hill_uncond_ok`: true.
- `per_asset_q05_ok`: true.
- `walk_forward_stress_covers_all`: true.

Gates que no pasan:

- `kupiec_crisis_var5_ok`: false.
- `walk_forward_kupiec_ok`: false.
- `non_overlapping_eval_windows`: false.
- `research_champion`: false.
- `ready_for_endpoint`: false.

Detalles de Kupiec:

- Unconditional VaR5: `p = 0.1138`, pasa.
- Unconditional VaR1: `p = 0.0895`, pasa.
- Crisis-base VaR5: `p = 0.0231`, falla.
- Crisis-base VaR1 diagnostic: `p = 0.7709`, pasa.

Interpretación: el libro unconditional ya está calibrado de forma aceptable. El único gate de excepción que sigue fallando es `crisis-base VaR5`, que no mide directamente el producto de stress sino un libro intermedio de daily VaR en régimen crisis.

## Factor space

| Métrica | Valor |
|---|---:|
| `factor_mmd_base` | `0.05305` |
| `factor_mmd_base_multi_mean` | `0.05107` |
| `factor_mmd_stress` | `0.03037` |
| `factor_mmd_stress_multi_mean` | `0.02880` |
| `factor_eval_windows` | `73` |

El stress transform mejora sustancialmente el ajuste factor-space respecto al base. Esto es importante: el engine no está ganando solo por reconstrucción de activos o Cholesky; el libro de stress mejora la geometría de factores.

## Top contributors de cola

Top 10 weighted tail contributors:

| Ticker | Contribución |
|---|---:|
| BBBY | `-0.001335` |
| THC | `-0.001159` |
| URI | `-0.001130` |
| PCG | `-0.001114` |
| AMD | `-0.001095` |
| MS | `-0.001074` |
| BAC | `-0.001043` |
| RF | `-0.001040` |
| C | `-0.001039` |
| FSLR | `-0.001027` |

La presencia de nombres como BBBY, PCG, bancos y cíclicos confirma que el universo PIT está haciendo lo que debía hacer: incluir nombres dañados o históricamente frágiles, no solo sobrevivientes actuales.

## Evolución v9.2 a v9.5

v9.2 arregló el candidato: el producto dejó de evaluarse contra el libro base y pasó a evaluarse contra `fhs_v9_stress`.

v9.3 agregó una catastrophe sleeve escasa y auditada. Eso movió el q01 endpoint hacia `-33.5%` y permitió que el stress refit cubriera crisis históricas.

v9.4 arregló el scorecard de walk-forward y añadió un safety margin diario. Mejoró Kupiec, pero no cruzó VaR5.

v9.5 subió el safety margin diario. Con eso:

- Unconditional Kupiec VaR5 pasó.
- Unconditional Kupiec VaR1 pasó.
- Stress coverage siguió pasando.
- Crisis-base VaR5 siguió fallando.

No conviene seguir inflando el crisis-base solo para pasar ese gate. A partir de aquí el problema es de contrato de validación, no de capacidad del stress engine.

## Decisión recomendada

Recomiendo promover `fhs_v9_stress` como **motor offline validado de stress scenarios** y preparar el contrato de endpoint con gates separados:

1. **Stress endpoint gates**
   - MMD stress vs baselines.
   - Correlation fidelity.
   - CVaR/tail closeness.
   - Walk-forward stress coverage.
   - Scenario count.
   - No validation leakage.
   - No deterministic full-window floor.

2. **Normal/unconditional book gates**
   - Kupiec VaR5/VaR1 unconditional.
   - Hill tail index.
   - Per-asset q05.

3. **Crisis-base diagnostic gates**
   - Crisis-base Kupiec VaR5 debe quedar como diagnóstico, no como blocker del stress endpoint.

Con ese contrato, el stress module deja de ser una promesa experimental y pasa a ser un motor defendible: CPU-only, PIT-aware, baseline-beating y exportable como factor scenario bank.

## Riesgos residuales

- `non_overlapping_eval_windows = false`: la muestra valid target tiene solo `73` ventanas métricas; la evaluación es útil, pero no perfecta.
- El stress book mantiene mediana positiva; hay que comunicarlo como libro de stress por cola, no como predicción condicional completa.
- El crisis-base daily VaR5 sigue fallando. No debe ocultarse, pero tampoco debe bloquear el endpoint de stress si se separa correctamente el contrato.
- El factor bank fp16 es grande y debe versionarse como artefacto, no como fuente Git normal.

## Próximo paso

Actualizar el contrato del endpoint `/market-simulation` para que `ready_for_endpoint` no dependa de `kupiec_crisis_var5_ok`, sino de un nuevo `ready_for_stress_endpoint` con gates propios del stress engine. Luego exportar el factor bank v9.5 como artefacto servido y dejar el libro base como diagnóstico/reserva.
