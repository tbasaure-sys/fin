# Validación del piloto de flujo compelido

Estado: **BLOCKED — no aceptado como motor validado**  
Fecha de corte: 2026-07-30  
Regla verificable: `tqqq_daily_rebalance_v1`

## Protocolo fijado

- Ground truth requerido: el cambio de exposición se deriva entre dos snapshots primarios archivados; el valor escrito en la fila debe coincidir con esa diferencia y nunca la sustituye.
- Calendario: al menos 31 sesiones ISO únicas y contiguas, sin fines de semana para XNYS/XNAS, más fuente oficial, clausulado, fecha de recuperación y hash SHA-256 de la secuencia completa.
- Archivo externo: cada ID debe resolver dentro del `archive_root` a un resumen y a su archivo crudo; ambos hashes se verifican antes de calcular errores. El resumen debe declarar identidad, sesión, hora de captura con zona, URL primaria, clausulado y exposición observada.
- Linaje temporal: `prediction_generated_at` debe ocurrir después de capturar el snapshot de predicción y antes de capturar el snapshot de observación. El snapshot observado debe ser el snapshot inicial de la predicción siguiente.
- Error firmado: `(observado - proyectado) / abs(proyectado)`.
- Mínimo: 30 pares predicción-observación ordenados y enlazados, cada predicción con una sesión sucesora disponible.
- Aprobación: mediana del error absoluto menor o igual a 10% y sesgo mediano absoluto menor o igual a 10%.
- Falla: mediana del error absoluto mayor a 25%.
- La fórmula no se calibra ni se ajusta al resultado.

## Evidencia disponible

La descarga primaria de ProShares expone holdings diarios **del corte vigente**, no un archivo histórico de holdings. El corte 2026-07-29 contiene 129 filas para TQQQ.

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

El colector `scripts/capture_proshares_holdings.py` conserva el archivo primario sin sobrescribir evidencia distinta, agrega URL, hora de captura y hashes, y actualiza un manifiesto del archivo. `scripts/validate_compelled_flow.py` ejecuta el paquete operativo de predicciones, calendario y manifiesto. La validación se habilita sólo cuando existan 30 enlaces contiguos, todos los hashes y tiempos sean verificables y haya una clasificación primaria reproducible de la exposición observada.
