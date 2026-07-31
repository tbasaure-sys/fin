# Validación del piloto de flujo compelido

Estado: **BLOCKED — no aceptado como motor validado**  
Fecha de corte: 2026-07-30  
Regla verificable: `tqqq_daily_rebalance_v1`

## Protocolo fijado

- Ground truth: cambio de exposición observado en holdings del día siguiente.
- Error firmado: `(observado - proyectado) / abs(proyectado)`.
- Mínimo: 30 sesiones hábiles únicas.
- Aprobación: mediana del error absoluto menor o igual a 10% y sesgo mediano absoluto menor o igual a 10%.
- Falla: mediana del error absoluto mayor a 25%.
- La fórmula no se calibra ni se ajusta al resultado.

## Evidencia disponible

La descarga primaria de ProShares expone holdings diarios **del corte vigente**, no un archivo histórico de holdings. El corte 2026-07-29 contiene 129 filas para TQQQ. La suma del campo reportado `Exposure Value (Notional + G/L)` es USD 74,681,514,611.07 y la suma del campo `Market Value` es USD 29,367,500,570.00. El sitio del fondo reporta net assets de USD 29,230,144,255 al mismo corte.

Estas magnitudes no se convierten en una exposición Nasdaq-100 total: el archivo mezcla derivados, acciones, efectivo y otros activos, y no entrega una clasificación histórica primaria suficiente para atribuir toda posición de contado al índice. La serie oficial de NAV/AUM sí es histórica, pero NAV no es ground truth de holdings y no se usa como sustituto.

## Resultado

| Control | Resultado |
|---|---:|
| Sesiones elegibles | 0 / 30 |
| Mediana error absoluto | no calculada |
| Sesgo mediano | no calculado |
| P90 error absoluto | no calculado |
| Decisión | BLOCKED |

Razón de bloqueo: `missing_30_historical_daily_holdings_snapshots_and_primary_exposure_classification`.

El colector `scripts/capture_proshares_holdings.py` conserva desde ahora cada archivo primario sin sobrescribir un corte distinto y genera un resumen fail-closed. La validación se habilita sólo cuando existan 30 sesiones completas y una clasificación primaria reproducible de la exposición observada.
