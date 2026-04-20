# Portfolio Manager Hibrido

Este proyecto convierte el workbook `C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\02_Finance\Portafolio Stonks (1).xlsx` en una base operativa para un stack de portfolio management estilo Bloomberg-lite, pero con fuentes gratuitas y una capa reproducible fuera de Excel.

Excel conserva el rol de captura manual y revision rapida. Python hace la parte que el spreadsheet no deberia gobernar en produccion: ingesta estable, market data reproducible, analytics, valuation, screener, Monte Carlo, sizing, reporting y automatizacion diaria.

## Analisis del portfolio Igmar en `.xlsm`

El archivo generado para Igmar es:

```text
output/spreadsheet/igmar_portfolio_snapshot_analysis_2026-04-17.xlsm
```

El script reproducible que lo construye es:

```text
scripts/build_igmar_snapshot_analysis.py
```

La fecha base del reporte es `2026-04-17`. El workbook es una foto profesional del portfolio, no una reconstruccion contable completa. Usa las posiciones y precios observados en las capturas, los costos promedio en USD informados por el usuario, la nueva compra de `RDDT`, datos de mercado de Financial Modeling Prep y un fallback historico con Yahoo Finance cuando falta cobertura.

### Fuentes usadas

| Fuente | Uso |
| --- | --- |
| Capturas del portfolio | Tickers, nombres, precios, cantidades, P/L diario y valor CLP de las posiciones originales. |
| Costos promedio entregados por el usuario | `avg_cost_usd` para calcular costo base, P/L no realizado y retorno sobre costo. |
| Nueva compra `RDDT` | Cantidad `2.45819308` y costo `163.38 USD`; precio de mercado desde quote FMP. |
| FMP Profile API | Nombre formal, industria, pais y moneda cuando estan disponibles. |
| FMP Quote API | Precio y movimiento diario de `RDDT`. |
| FMP Historical Price EOD API | Historicos diarios para reconstruir el proxy de riesgo y el analisis Phantom Diversification. |
| Yahoo Finance via `yfinance` | Fallback cuando FMP no entrega historico suficiente. |
| `SPY` | Benchmark para beta y correlacion. |
| `Phantom_Diversification_Paper_JPM_R1.pdf` | Marco conceptual de raw breadth, tested breadth, phantom breadth, phantom share y overlay. |

### Como correrlo

No se guarda ninguna API key en el repo. Para regenerar el archivo, define la variable de entorno y ejecuta el script:

```powershell
$env:FMP_API_KEY = "<tu_api_key>"
python .\scripts\build_igmar_snapshot_analysis.py
```

El script guarda caches historicos bajo `tmp/spreadsheets/igmar_snapshot/` para no descargar todo de nuevo en cada corrida.

### 1. Foto base del portfolio

Cada posicion original se carga como:

```text
market_value_usd = price_usd * quantity
implied_fx = market_value_clp / market_value_usd
```

La tasa USD/CLP usada por el reporte no viene de un feed externo. Se estima como la mediana de los `implied_fx` de todas las posiciones de la captura:

```text
fx_rate = median(implied_fx)
```

La compra nueva de `RDDT` se agrega con cantidad y costo informados por el usuario. Su valor en CLP se estima con la misma tasa implicita:

```text
rddt_market_value_usd = rddt_live_price_usd * rddt_quantity
rddt_market_value_clp = rddt_market_value_usd * fx_rate
```

### 2. Hoja `Holdings`

La hoja `Holdings` es la tabla granular del portfolio. Para cada ticker calcula:

| Campo | Calculo |
| --- | --- |
| `market_value_usd` | `price_usd * quantity` |
| `market_value_clp` | Valor CLP de la captura, salvo compras nuevas, donde se usa `market_value_usd * fx_rate`. |
| `weight` | `market_value_clp / total_market_value_clp` |
| `cost_value_usd` | `avg_cost_usd * quantity` |
| `cost_value_clp` | `cost_value_usd * fx_rate` |
| `unrealized_pnl_usd` | `market_value_usd - cost_value_usd` |
| `unrealized_pnl_clp` | `market_value_clp - cost_value_clp` |
| `return_since_cost` | `unrealized_pnl_usd / cost_value_usd` |
| `daily_pnl_clp` | `daily_pnl_usd * fx_rate` |
| `daily_contribution_pct` | `daily_pnl_clp / total_market_value_clp` |

Si falta costo promedio para una posicion, el P/L no realizado de esa posicion queda incompleto. En esta version, `EWY` no tenia costo promedio informado. `HIMS` no se agrego como posicion porque se informo costo, pero no cantidad ni valor de mercado.

### 3. Resumen ejecutivo

La hoja `Resumen` usa los datos de `Holdings` y del proxy historico para mostrar KPIs agregados:

| KPI | Calculo |
| --- | --- |
| `Portfolio value (CLP)` | Suma de `market_value_clp`. |
| `Portfolio value (USD)` | Suma de `market_value_usd`. |
| `Cost basis` | Suma de `cost_value_usd` y `cost_value_clp`, ignorando valores faltantes. |
| `Unrealized P/L` | Suma de `unrealized_pnl_usd` y `unrealized_pnl_clp`, ignorando valores faltantes. |
| `Return since cost` | `sum(unrealized_pnl_usd) / sum(cost_value_usd)`. |
| `Positions` | Numero total de posiciones cargadas, incluyendo `RDDT`. |
| `Risk proxy coverage` | Peso del portfolio que tiene historico suficiente para entrar al analisis de riesgo. |
| `Top 5 concentration` | Suma de los pesos de las 5 posiciones mas grandes. |
| `Top 10 concentration` | Suma de los pesos de las 10 posiciones mas grandes. |
| `HHI` | `sum(weight^2) * 10000`. Mayor HHI implica mas concentracion. |
| `Daily P/L snapshot` | Suma del P/L diario en CLP. |
| `Daily return snapshot` | `sum(daily_pnl_usd) / sum(market_value_usd)`. |

Los comentarios ejecutivos se derivan de estas metricas. Por ejemplo, el bloque crecimiento/plataformas suma `Technology + Communication Services`, el bloque ciclico suma `Materials + Energy + Regional ETF`, y la exposicion fuera de EEUU se calcula como `1 - weight(United States)`.

### 4. Hoja `Exposicion`

La exposicion se calcula agrupando cada posicion por clasificacion manual de analisis:

```text
allocation_value = sum(market_value_clp por grupo)
allocation_weight = allocation_value / total_market_value_clp
```

Se generan tres vistas:

| Vista | Agrupador |
| --- | --- |
| Sector | `analysis_sector` |
| Region | `region_bucket` |
| Clase de activo | `asset_class` |

La clasificacion manual se usa porque los ETFs y ADRs no siempre quedan bien explicados por el sector legal del emisor. Por ejemplo, `EWZ`, `EWY`, `INDA` y `EEM` se tratan como `Regional ETF`, mientras que `COPX` y `REMX` se agrupan en `Materials`.

La hoja tambien muestra el top 10 por peso:

```text
top_holdings = posiciones ordenadas por market_value_clp descendente
```

### 5. Proxy historico de riesgo

El riesgo clasico se calcula como proxy con pesos actuales. No reconstruye compras, ventas ni pesos historicos reales. La serie historica del portfolio se arma asi:

```text
historical_position_value_ticker[t] = historical_price_ticker[t] * current_quantity_ticker
portfolio_value[t] = sum(historical_position_value_ticker[t])
portfolio_return[t] = pct_change(portfolio_value[t])
```

El panel historico usa precios ajustados cuando estan disponibles. Los tickers con menos de `126` observaciones se excluyen del proxy, salvo el benchmark `SPY`.

Las metricas se calculan sobre la ventana final de hasta `252` retornos diarios alineados con `SPY`:

| Metrica | Calculo |
| --- | --- |
| `Ann. return proxy` | Retorno trailing del portfolio anualizado con `252 / n`. |
| `Ann. volatility proxy` | `std(portfolio_daily_returns) * sqrt(252)`. |
| `Max drawdown proxy` | Minimo de `portfolio_value / cumulative_max(portfolio_value) - 1`. |
| `1d VaR 95% proxy` | Percentil 5% de los retornos diarios. |
| `1d CVaR 95% proxy` | Promedio de retornos diarios iguales o peores que el VaR 95%. |
| `Beta vs SPY` | `cov(portfolio_returns, spy_returns) / var(spy_returns)`. |
| `Correlation vs SPY` | Correlacion entre retornos diarios del portfolio y `SPY`. |

El objetivo de este bloque es responder: "si hoy mantuviera estas cantidades durante el historico reciente, que perfil de riesgo habria mostrado?". No responde: "cual fue el retorno realizado exacto de la cuenta?".

### 6. Hoja `Riesgo` con Phantom Diversification

La hoja `Riesgo` usa conceptos del paper `Phantom Diversification`. La idea central es separar la diversificacion que parece existir en calma de la diversificacion que ya fue probada bajo tension.

Primero se calculan retornos diarios por ticker y ventanas rolling de `63` dias:

```text
returns = pct_change(price_panel)
window_returns = ultimos 63 retornos diarios por ventana
```

Para cada ventana se estima una matriz de covarianza. El script usa `LedoitWolf` si esta disponible y cae a covarianza muestral si no:

```text
covariance = LedoitWolf(window_returns) o sample_covariance(window_returns)
```

Luego se calcula `raw breadth`, que es el numero efectivo de apuestas independientes. Se usa la entropia de los eigenvalues de la matriz de covarianza:

```text
eigenvalues = eig(covariance)
lambda_weight_i = eigenvalue_i / sum(eigenvalues)
raw_breadth = exp(-sum(lambda_weight_i * ln(lambda_weight_i)))
```

Despues se calcula cuanta diversificacion es "probada" y cuanta es "fantasma":

```text
variance_trace = trace(covariance)
phantom_share = exp(-100 * variance_trace)
quality_ratio = 1 - phantom_share
tested_breadth = raw_breadth * quality_ratio
phantom_breadth = raw_breadth * phantom_share
```

La intuicion es simple:

| Concepto | Lectura no tecnica |
| --- | --- |
| `raw_breadth` | Cuantas apuestas independientes parecen existir. |
| `tested_breadth` | Cuanta de esa diversificacion ya fue puesta a prueba. |
| `phantom_breadth` | Cuanta diversificacion podria ser solo apariencia de mercado tranquilo. |
| `phantom_share` | Porcentaje de la diversificacion visible que aun no fue probada. |
| `quality_ratio` | Porcentaje de la diversificacion visible que si fue validada por tension. |

El regimen actual se define con el decil historico de `variance_trace`:

```text
stress_decile = decil historico de variance_trace
current_regime = "Calmado" si stress_decile <= 7, si no "Estresado"
primary_signal = "Phantom share" en calma, "Tested breadth" en stress
```

El umbral visual de la hoja es `92%` de `phantom_share` en regimen calmado, tomado del paper como zona de advertencia. En esa zona, una cartera puede verse diversificada, pero el mercado todavia no puso esa diversificacion bajo suficiente stress.

La hoja muestra tres graficos:

| Grafico | Que muestra |
| --- | --- |
| `Decomposicion actual de la diversificacion` | `tested_breadth` vs `phantom_breadth` de la ultima ventana. |
| `Phantom share a traves del tiempo` | Evolucion de `phantom_share`, `quality_ratio`, `tested_breadth` y umbral `92%`. |
| `Curva de stress de la diversificacion` | Promedio de breadth por decil de stress, desde mercados calmados hasta estresados. |

Tambien se incluye una regla tipo overlay del paper usando el percentil historico de `tested_breadth`:

```text
si tested_percentile <= 80%: equity_weight = 100%
si 80% < tested_percentile <= 95%: equity_weight baja linealmente de 100% a 35%
si tested_percentile > 95%: equity_weight = 35%
```

Esta regla no es una recomendacion automatica de trading. Se incluye para traducir el paper a una lectura operativa y visual.

### 7. Hoja `AtribucionDia`

La atribucion diaria ordena las posiciones por P/L diario en CLP:

```text
gainers = top 8 por daily_pnl_clp descendente
losers = top 8 por daily_pnl_clp ascendente
```

Para cada posicion se muestra:

| Campo | Calculo |
| --- | --- |
| `daily_pnl_usd` | Dato de la captura o `quote_change * quantity` para compras nuevas. |
| `daily_pnl_clp` | `daily_pnl_usd * fx_rate`. |
| `daily_change_pct` | Variacion porcentual diaria observada. |
| `daily_contribution_pct` | `daily_pnl_clp / total_market_value_clp`. |

Esto permite distinguir entre acciones que subieron mucho en porcentaje y posiciones que realmente movieron el valor total de la cartera.

### 8. Hoja `Fuentes`

La hoja `Fuentes` documenta las URLs y dependencias usadas por el workbook:

| Fuente | URL o referencia |
| --- | --- |
| FMP Profile | `https://site.financialmodelingprep.com/developer/docs/stable/profile-symbol` |
| FMP Quote | `https://site.financialmodelingprep.com/developer/docs/stable/quote` |
| FMP Historical EOD | `https://site.financialmodelingprep.com/developer/docs/stable/historical-price-eod-full` |
| Yahoo Finance fallback | `yfinance` |
| Benchmark | `SPY` |
| Paper | `C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\02_Finance\JPM_RnR_Phantom_Diversification\manuscript\Phantom_Diversification_Paper_JPM_R1.pdf` |

### Supuestos importantes

- El workbook es un snapshot al `2026-04-17`, no un track record completo.
- Los pesos historicos del proxy de riesgo son pesos actuales aplicados hacia atras.
- Los retornos no incorporan aportes, retiros, rebalanceos, impuestos, comisiones ni dividendos salvo lo que venga en precios ajustados.
- La tasa USD/CLP es implicita desde la captura, no una cotizacion oficial externa.
- Los costos promedio dependen de los datos informados por el usuario.
- La clasificacion sectorial y regional es manual para mejorar interpretabilidad.
- El analisis Phantom Diversification es una adaptacion aplicada al portfolio, no una replica institucional completa del paper.
- El archivo es para research y decision asistida, no para ejecucion automatica ni recomendacion financiera personalizada.

## Que implementa

- Ingesta del workbook actual y normalizacion de holdings.
- Deteccion de formulas externas no reproducibles (`GOOGLEFINANCE`, `__xludf.DUMMYFUNCTION`).
- Descarga de historicos de precio con Yahoo chart y fallback a Stooq.
- Scraping de fundamentales y metadata desde Stock Analysis.
- Capa extra de valuacion con `SEC CompanyFacts`, `FRED` y `Damodaran`.
- Rebuild de analytics de portafolio: retorno, volatilidad, Sharpe, Sortino, drawdown, VaR, CVaR, beta, alpha y tracking error.
- Motor de valoracion hibrido: DCF simplificado + comparables.
- Screener compuesto para holdings y watchlist.
- Daily screener tecnico con filtros de tendencia, volumen, RSI y P/E.
- Monte Carlo de precio y de valor intrinseco.
- Sizing con Kelly fraccional y limites de riesgo.
- Export de `csv`, `json`, `xlsx` y guia `.docx`.

## Estructura

```text
portfolio_manager/
  config/
    daily_screener_universe.txt
    defaults.yaml
  docs/
    portfolio_management_guide.md
    portfolio_management_guide.docx
  output/
    latest/
  requirements.txt
  scripts/
    run_daily_screener.ps1
    run_daily_screener.sh
  src/portfolio_manager/
    analytics.py
    cli.py
    config.py
    daily_screen.py
    guide.py
    ingestion.py
    market_data.py
    models.py
    presentation.py
    reporting.py
    screener.py
    simulation.py
    utils.py
    valuation.py
  tests/
```

## Modelo de datos

### `Holding`

- `ticker`
- `asset_type`
- `quantity`
- `currency`
- `avg_cost_clp`
- `avg_cost_usd`
- `current_price_clp`
- `current_price_usd`
- `market_value_clp`
- `market_value_usd`
- `weight`
- `sector`
- `industry`

### `MarketSnapshot`

- `last_price`
- `market_cap`
- `enterprise_value`
- `trailing_pe`
- `forward_pe`
- `p_to_fcf`
- `ev_to_ebitda`
- `revenue_growth`
- `gross_margin`
- `ebitda_margin`
- `free_cash_flow`
- `roe`
- `roic`
- `beta`
- `sma_20`
- `sma_50`
- `rsi_14`
- `current_volume`
- `avg_volume_20`
- `volume_ratio_20`
- `sector`
- `industry`
- `sec_*` para enrichment desde SEC

### `ValuationCase`

- `fair_value`
- `upside`
- `dcf_value`
- `peer_value_pe`
- `peer_value_pfcf`
- `peer_value_ev_ebitda`
- `confidence`
- `assumptions`

### `ScreenRow`

- `quality_score`
- `value_score`
- `risk_score`
- `growth_score`
- `composite_score`
- `thesis_bucket`
- `suggested_position`

### `DailyScreenRow`

- `pe_used`
- `rsi_14`
- `volume_ratio_20`
- `sma_20`
- `sma_50`
- `price_above_sma50`
- `golden_cross`
- `pe_in_range`
- `rsi_in_range`
- `volume_breakout`
- `passes_all`

## Como corre el pipeline

### 1. Ingesta del workbook

El parser toma:

- Hoja `Portfolio_Base` si existe. Esa hoja pasa a ser la fuente canonica del portfolio.
- Si `Portfolio_Base` no existe, usa las hojas legacy:
  - `Portafolio` para cantidades, costo promedio CLP y mark actual.
  - `IGMAR` para costo promedio USD.
  - `RESUMEN INVERSIONES` para exposicion crypto.

Ademas inspecciona todas las hojas para detectar dependencias externas tipo `GOOGLEFINANCE`.

### 2. Market data

La implementacion usa una combinacion pragmatica:

- Yahoo chart endpoint para historico ajustado, volumen y pricing reciente.
- Stooq como fallback de historico.
- Stock Analysis para multiplos, cash flow, deuda, ROIC, beta, sector, industria y analyst target.
- SEC CompanyFacts para reforzar revenue, operating income, equity, operating cash flow y free cash flow cuando el emisor reporta en la SEC.
- FRED (`DGS10`) para tasa libre de riesgo.
- Damodaran para implied equity risk premium.

Esto evita depender del motor `GOOGLEFINANCE` incrustado en Excel.

### 3. Portfolio analytics

Se reconstruye una serie diaria de valor del portafolio en CLP usando:

- precio historico de cada ticker
- cantidades del workbook
- serie historica `USDCLP=X`

Sobre esa serie se calculan:

- `Annual Return`
- `Annual Volatility`
- `Sharpe Ratio`
- `Sortino Ratio`
- `Max Drawdown`
- `VaR 95% (1d)`
- `CVaR 95% (1d)`
- `Ulcer Index`
- `Beta`
- `Alpha (annual)`
- `R^2`
- `Tracking Error`

Tambien se agregan exposiciones por sector y por tipo de activo, mas concentracion por HHI.

### 4. Valuation engine

Para acciones operativas, el fair value mezcla cuatro capas:

1. `Equity FCF DCF`
2. comparables por `Forward P/E`
3. comparables por `P/FCF`
4. comparables por `EV/EBITDA`

El DCF usa:

- `FCF per share`
- crecimiento base desde `Revenue Growth Forecast (5Y)` o `Revenue Growth (YoY)`
- `WACC` si existe; si no, `risk_free_rate + beta * ERP`
- `terminal_growth` conservador

Capas nuevas:

- `SEC CompanyFacts`: si Stock Analysis no entrega un campo clave, el engine intenta completarlo con facts XBRL de la SEC.
- `FRED DGS10`: actualiza el `risk_free_rate`.
- `Damodaran implied ERP`: reemplaza el `equity_risk_premium` fijo cuando la fuente esta disponible.

Para ETFs el engine no fuerza un DCF artificial; degrada la confianza y deja que predominen mercado, analytics y simulacion.

### 5. Monte Carlo

Hay dos motores:

- Precio: GBM con drift y volatilidad estimados desde historicos.
- Valor intrinseco: perturbacion de `growth`, `discount_rate` y `terminal_growth` alrededor del caso base.

Se exportan:

- `price_p10`, `price_p50`, `price_p90`
- `fair_value_p10`, `fair_value_p50`, `fair_value_p90`
- `prob_loss`
- `prob_reach_fair_value`
- `var_95`
- `cvar_95`
- `expected_return`

### 6. Sizing

El sizing no usa Kelly pleno. La regla por defecto es:

- `raw_kelly = argmax E[log(1 + f * r)]`
- `suggested_position = min(10%, 0.25 * raw_kelly)`

Y ademas:

- cap por posicion: `10%`
- cap por sector: `25%`
- revision manual obligatoria antes de ejecutar

### 7. Screener compuesto

El screener se corre sobre:

- holdings actuales no crypto
- watchlist definida en `config/defaults.yaml`
- universo diario en `config/daily_screener_universe.txt`

El score compuesto mezcla:

- `quality_score`: ROIC, ROE, gross margin, EBITDA margin, FCF yield
- `value_score`: forward P/E, EV/EBITDA, P/FCF y valuation gap
- `risk_score`: beta, leverage y probabilidad de perdida simulada
- `growth_score`: revenue growth, 5Y growth forecast, momentum 6m

### 8. Daily technical screener

El screener tecnico diario aplica exactamente estos filtros:

- `P/E between 5-25`
- `RSI 30-70`
- `Volume 1.5x above average`
- `Price above 50-day SMA`
- `Golden cross (20 SMA > 50 SMA)`

La logica vive en [daily_screen.py](C:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/02_Finance/portfolio_manager/src/portfolio_manager/daily_screen.py).
Por defecto `config/defaults.yaml` ya viene con `exchange_preset: "NYSE"`, usando el symbol directory oficial de Nasdaq Trader para cargar la NYSE completa no-ETF.

## Setup

Usa el Python local que ya existe en esta maquina:

```powershell
& 'C:\conda\python.exe' -m pip install -r .\requirements.txt
```

Si quieres correr el paquete desde el directorio del proyecto:

```powershell
$env:PYTHONPATH = (Resolve-Path .\src)
```

## Ejecucion

Desde `02_Finance\portfolio_manager`:

```powershell
$env:PYTHONPATH = (Resolve-Path .\src)
& 'C:\conda\python.exe' -m portfolio_manager.cli --config .\config\defaults.yaml
```

Solo daily screen:

```powershell
$env:PYTHONPATH = (Resolve-Path .\src)
& 'C:\conda\python.exe' -m portfolio_manager.cli --config .\config\defaults.yaml --daily-screen-only
```

Solo para regenerar la guia `.docx`:

```powershell
$env:PYTHONPATH = (Resolve-Path .\src)
& 'C:\conda\python.exe' -m portfolio_manager.cli --config .\config\defaults.yaml --guide-only
```

## Outputs

La carpeta `output/latest/` deja:

- `portfolio_snapshot.xlsx` como workbook maestro para uso diario
- `holdings_normalized.csv`
- `formula_flags.csv`
- `valuation_summary.csv`
- `valuation_pretty.csv`
- `simulation_summary.csv`
- `simulation_pretty.csv`
- `screener.csv`
- `screener_pretty.csv`
- `daily_screener.csv`
- `daily_screener_pretty.csv`
- `daily_screener_hits.csv`
- `daily_screener_hits_pretty.csv`
- `portfolio_summary.json`

El archivo principal para revisar todo en un solo lugar es `portfolio_snapshot.xlsx`. Incluye estas pestanas:

- `Resumen`
- `Analytics`
- `Macro`
- `Holdings`
- `Valuation`
- `MonteCarlo`
- `Screener`
- `DailyHits`
- `DailyScreen`
- `Flags`

El modo `--daily-screen-only` escribe por defecto en `output/daily_screen/` para no pisar los reportes completos.
La primera corrida sobre toda la NYSE puede tardar bastante mas porque calienta el cache semanal de P/E en `cache/daily_pe/`. Las siguientes corridas deberian ser mas rapidas.
Si solo quieres ver las coincidencias finales, usa `daily_screener_hits.csv` o `daily_screener_hits_pretty.csv`.

Y la guia adaptada se genera en `docs/portfolio_management_guide.docx`.

Los `csv` se exportan con separador `;` y formato decimal compatible con Excel en configuracion hispana. Las versiones `*_pretty.csv` ademas abrevian magnitudes (`512.53B`, `654.87`, `11.77%`) para lectura rapida.

## Automatizacion diaria

### Windows Task Scheduler

Script listo:

```powershell
.\scripts\run_daily_screener.ps1
```

Ejemplo de alta:

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PWD\scripts\run_daily_screener.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At 8:30am
Register-ScheduledTask -TaskName "PortfolioDailyScreener" -Action $action -Trigger $trigger -Description "Runs the portfolio daily technical screener"
```

### Cron

Script listo:

```bash
./scripts/run_daily_screener.sh
```

Ejemplo:

```cron
30 8 * * 1-5 /path/to/portfolio_manager/scripts/run_daily_screener.sh >> /path/to/portfolio_manager/output/daily_screen.log 2>&1
```

## Como extenderlo

### Watchlist y universo diario

Edita `config/defaults.yaml`:

- agrega o saca tickers de `watchlist`
- cambia benchmark
- cambia caps de riesgo
- ajusta filtros de `daily_screen`

Y expande `config/daily_screener_universe.txt` para abrir el scanner a mas nombres.

### Nuevas fuentes

Si mas adelante quieres profesionalizarlo aun mas:

- ampliar `SEC CompanyFacts` a mas conceptos y trailing normalization
- traer tablas sectoriales de Damodaran para comparables de industria mas finos
- agregar cache local por ticker y fecha para evitar scraping repetido

### Reemplazo gradual de Excel

La forma correcta de migrarlo no es borrar el workbook de una vez. Es:

1. mantener Excel como front-end operativo
2. extraer holdings a `csv` canonico
3. recalcular todo afuera
4. devolver snapshot y screener al workbook
5. recien despues decidir si conviene una UI web

## Limitaciones actuales

- El valuation de ETFs no es tan rico como el de equities operativas.
- Las metricas dependen de lo que exponga Stock Analysis y de la cobertura del emisor en la SEC.
- Damodaran hoy entra como capa macro de ERP, no aun como tabla completa de comparables sectoriales.
- El sistema esta pensado para research y decision asistida, no para ejecucion automatica.
- Crypto se sigue trackeando, pero no entra al motor principal de valuacion fundamental.

## Criterio de aceptacion sugerido

- El parser debe leer holdings y costos promedio desde tu workbook sin perder tickers.
- Debe detectar formulas `GOOGLEFINANCE`.
- Debe producir analytics de portafolio cercanos a tu hoja `Analytics`.
- Debe correr valuation y screener al menos sobre `UNH`, `BABA`, `ASML`, `UBER`, `ASTS`.
- Debe producir sizing y percentiles de simulacion para holdings existentes y watchlist.
- Debe producir un `daily_screener` filtrado por tus reglas tecnicas.
