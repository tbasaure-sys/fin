# Huecos de cobertura que bloquean emisión

## S&P 500 Equal Weight

- Falta una serie primaria y point-in-time del pool agregado de activos que replica el índice.
- Faltan los archivos oficiales de constituyentes/pesos del evento con su historia de publicación.
- Consecuencia: la regla temporal está extraída, pero cualquier flujo por acción queda suprimido como `rule_incomplete`.

## Russell 2000

- Falta el pool de activos específico de mandatos Russell 2000; el AUM familiar publicado por FTSE Russell no es un sustituto admisible.
- Faltan los archivos preliminares/finales del evento con altas, bajas, shares y free float point-in-time.
- Consecuencia: no se reconstruye membresía desde rankings ni se inventan pesos; la regla queda `partial`.

## TQQQ

- ProShares publica una descarga de holdings para el corte vigente, pero no ofrece en la página de descargas una serie histórica diaria de holdings.
- La descarga histórica de NAV/AUM no identifica la exposición observada por instrumento.
- El archivo de holdings combina derivados, valores de contado y otros activos sin una taxonomía histórica suficiente para sumar exposición Nasdaq-100 sin inferencia.
- Consecuencia: la fórmula diaria puede proyectarse cuando todos sus inputs están citados, pero el criterio de 30 sesiones permanece bloqueado.

## Fuera de alcance deliberadamente

- No hay predicción de precios ni de retornos.
- No se modelan flujos discrecionales o de sentimiento.
- No se proyecta exposición derivada a acciones individuales sin modelo de transmisión documentado.
- No se incluye Chile, previsión ni pensiones antes de superar el ground truth diario.
