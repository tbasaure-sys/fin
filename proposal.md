

| Familia                                                                   | Utilidad real para un fondo familiar                                           | Mi nota |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------: |
| State-space + Dynamic Factor Models + Kalman + MIDAS                      | Estimar crecimiento, inflación y liquidez **ahora**, no cuando sale el titular |  9.5/10 |
| Term structure no-arbitrage (ACM/Nelson-Siegel/Affine) + crédito/liquidez | Separar expectativas de tasas vs term premium; mapear descuento del sistema    |  9.3/10 |
| Quantile / Growth-at-Risk / density forecasting                           | Traducir macro-finanzas a **colas** y probabilidades de escenario              |  9.1/10 |
| q-theory + profitability + intangibles-adjusted value                     | Núcleo de alpha estructural en selección de acciones                           |  9.4/10 |
| Regime-switching / change-points / structural breaks                      | Reconocer que los parámetros cambian y que promediar regímenes destruye señal  |  8.8/10 |
| Bayesian model averaging / scenario synthesis                             | Combinar modelos sin caer en dogmas ni sobreajuste                             |  8.7/10 |
| Options-implied distributions                                             | Excelente “sanity check” de la cola que el mercado está pagando                |  7.6/10 |
| EVT + copulas + redes de contagio                                         | Defensa y supervivencia; menos alpha directo, más evitar ruina                 |  7.9/10 |
| DSGE / BVAR estructural                                                   | Coherencia narrativa y escenarios; no lo pondría como motor principal          |  6.5/10 |
| Predictive regressions del equity premium, solas                          | Útiles como input, flojas como negocio principal                               |  4.5/10 |

## Por qué este ranking

El **motor más útil** para vuestro caso es un stack de **Dynamic Factor Models, state-space y mixed-frequency**. No porque prediga retornos de forma mágica, sino porque estima mejor el estado contemporáneo de crecimiento, inflación y liquidez a partir de datos ruidosos, asincrónicos y revisables. La Fed de Nueva York usa un DFM semanal para su Staff Nowcast; el BCE publicó en 2024 un toolbox con DFM, large BVAR y bridge equations; y la literatura de mixed-frequency VAR/MIDAS documenta ganancias reales al incorporar información intra-trimestre en tiempo real. Además, la evidencia sobre ciclo financiero global sugiere que debéis incluir un **global financial cycle factor** en el vector de estado, no solo macro doméstico. ([Federal Reserve Bank of New York][4])

La segunda pieza crítica es la **term structure**. La razón matemática es simple y poderosa: el yield largo puede descomponerse en **trayectoria esperada de tasas cortas + term premium**. Si no hacéis esa separación, confundís crecimiento con prima de riesgo, o política monetaria con apetito por duración. La New York Fed publica term premia diarios con el modelo ACM; su modelo de recesión por pendiente de curva sigue siendo una de las señales más limpias de ciclo; y en pruebas de la propia Fed de Nueva York, los pronósticos basados en ACM superaron al random walk y a los forwards a horizontes largos. Sumad a eso que la NY Fed estima que el r* global subió alrededor de 1 punto tras COVID y que la Fed reanudó compras de Treasury bills para mantener reservas amplias: el prior “volvemos automáticamente al mundo de rates ultrabajos de los 2010s” es más débil que antes. ([Federal Reserve Bank of New York][5])

La tercera familia imprescindible es **Growth-at-Risk / quantile forecasting / density forecasting**. Para asignación de capital, el promedio es mucho menos importante que la cola izquierda. El marco GaR del IMF vincula condiciones macrofinancieras con la distribución futura del crecimiento; el trabajo “Vulnerable Growth” y el “Forecasting Macroeconomic Risks” de la New York Fed muestran que los riesgos son variables en el tiempo, asimétricos y parcialmente predecibles, y que el tightening financiero desplaza hacia abajo los cuantiles malos más que los buenos. Esto es exactamente lo que queréis si vuestro objetivo no es “tradear” sino decidir cuánta agresividad tener, cuánto cash opcional preservar y qué spread exigirle a una posición. ([IMF][6])

Donde yo veo el **alpha más durable** para tres hermanos con paciencia y cabeza es en la capa **cross-sectional**: **q-theory, profitability, expected growth e intangibles-adjusted value**. Hou y coautores muestran que el q-factor y su extensión q5 son de los modelos más parsimoniosos y fuertes; en su paper del expected growth factor reportan una prima media de 0,82% mensual. Eisfeldt, Kim y Papanikolaou muestran que el intangible value factor mejora al value tradicional y genera retornos superiores. Y Novy-Marx, en 2025, empuja una idea que me parece central: **profitability subsume buena parte de “quality”** y explica una fracción relevante de la decepción del value posterior a 2007. Traducido: vuestro motor de selección debería ponderar persistencia de rentabilidad, disciplina de reinversión, emisiones netas, intensidad de capital, capital intangible y fragilidad del balance mucho más que un múltiplo barato aislado. ([SSRN][7])

Los **modelos de régimen** importan muchísimo, pero como **meta-modelos**, no como robots de compra/venta. La idea correcta no es “un HMM sobre precios va a darme alpha”, sino “las relaciones entre variables cambian; si no modelo no-estacionariedad, promediaré mundos incompatibles”. Ang resume muy bien que el poder predictivo de dividend yield, term spread y default spread ha variado e incluso desaparecido por periodos; Bianchi, Lettau y Ludvigson encuentran cambios de régimen de baja frecuencia en valoraciones y en la relación con la política monetaria/r*. Para un fondo serio, eso significa que la primera pregunta no es “¿cuál es el coeficiente beta hoy?”, sino “¿en qué mundo estoy estimando ese beta?”. ([NBER][8])

La otra capa que yo sí construiría es **Bayesian model averaging / scenario synthesis**. La razón es práctica: los modelos buenos no coinciden entre sí. De hecho, a inicios de 2026 el modelo de recesión por curva de la New York Fed daba 18,8% para enero de 2027, mientras que su forecast DSGE de diciembre de 2025 situaba la probabilidad de recesión en los próximos cuatro trimestres en 37,5%. Eso no es una anomalía: es evidencia de **incertidumbre de modelo**. La NY Fed muestra que el averaging bayesiano con breaks mejora point y density forecasts de inflación; y un paper del IMF de 2025 formaliza una síntesis bayesiana entre narrativa de escenarios y forecasting estadístico. Evaluad estos motores con **log score** o **CRPS**, no solo con RMSE. ([Federal Reserve Bank of New York][9])

Las **options-implied distributions** y los modelos de **colas/dependencia/redes** los pondría en segunda línea, pero sin ignorarlos. La lógica de Breeden-Litzenberger permite recuperar densidades riesgo-neutrales a partir de opciones; IMF y otros trabajos usan distribuciones implícitas precisamente para leer cómo el mercado está valorando inflación, growth o crash risk. La advertencia es esencial: **riesgo-neutral no es probabilidad física**, así que sirve como espejo del precio del miedo, no como verdad revelada. Por su parte, BIS e IMF muestran que la dependencia de cola y las estructuras de red importan porque las pérdidas extremas co-mueven más de lo que admite una correlación gaussiana. Eso no os da alpha primario; os evita la ruina cuando vuestro modelo principal subestima la sincronización del estrés. ([American Economic Association][10])

## La arquitectura que yo construiría con tres hermanos

No haría “un gran modelo”. Haría **cuatro capas**.

| Capa      | Modelo                                                                 | Output                                                             |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Estado    | DFM + Kalman + MIDAS/MF-VAR                                            | crecimiento latente, inflación persistente, liquidez, global cycle |
| Régimen   | Markov-switching / change-point sobre factores, no sobre precios solos | probabilidades de soft landing, reflación, squeeze, recesión       |
| Selección | q-theory + profitability + intangibles + balance-sheet fragility       | ranking relativo de oportunidades                                  |
| Decisión  | Bayesian scenario weighting + robust mean-variance / fractional Kelly  | tamaño de posición, cash, hurdle rate                              |

La matemática mínima sería esta. Primero, estimáis un vector latente (x_t):
(x_t = A x_{t-1} + \varepsilon_t),
(y_t = C x_t + \eta_t).

Luego, actualizáis regímenes con Bayes:
(p(z_t=j \mid D_t) \propto p(D_t \mid z_t=j)\sum_i p(z_t=j \mid z_{t-1}=i)p(z_{t-1}=i \mid D_{t-1})).

Después, el retorno esperado de cada activo pasa a ser **scenario-weighted**:
(\mathbb{E}[R_i \mid D_t] = \sum_s p_s ,\mathbb{E}[R_i \mid s]).

Y el sizing lo haría con algo del estilo:
(w_t = \kappa(\Sigma_t+\tau I)^{-1}\mu_t),
con (\kappa) fraccional y (\tau) como shrinkage explícito para castigar error de estimación.

Eso, en castellano llano, significa: el modelo no decide por vosotros; os obliga a explicitar **qué mundo creéis estar viendo**, **qué escenarios pesan más**, y **qué tasa de descuento exige cada posición en ese mundo**.

## Qué evitar

Evitaría tres trampas. La primera es convertir **predictive regressions del equity premium** en religión: Campbell y Thompson encuentran capacidad out-of-sample, sí, pero con R² positivos y muy pequeños; Cochrane defiende la predictibilidad, pero sobre todo como variación en discount rates a horizontes largos, no como market-timing fino. La segunda es la **factor zoo disease**: Hou y coautores muestran que muchos modelos “distintos” están muy emparentados y se pisan entre sí. La tercera es tomar indicadores macroprudenciales sin pensar en tiempo real: el BIS muestra que los credit-to-GDP gaps pueden ser buenos early-warning indicators, pero también que algunas construcciones sufren mucho por problemas de endpoint y rendimiento real-time. ([NBER][11])

## Mi conclusión neta

Si solo pudiera elegir **tres motores** para un fondo como el vuestro, elegiría estos: **(1) DFM/Kalman/MIDAS para estimar el presente**, **(2) term structure + crédito/liquidez + régimen para mapear descuento y fragilidad**, y **(3) q-theory + profitability + intangibles para generar alpha de selección**. Todo lo demás lo pondría al servicio de eso.


[1]: https://www.federalreserve.gov/newsevents/pressreleases/monetary20260128a.htm?utm_source=chatgpt.com "Federal Reserve issues FOMC statement"
[2]: https://home.treasury.gov/ "Front page | U.S. Department of the Treasury"
[3]: https://www.multpl.com/?utm_source=chatgpt.com "Multpl - Market, financial, and economic data"
[4]: https://www.newyorkfed.org/medialibrary/media/research/blog/2023/NYFed-Staff-Nowcast_technical-paper "https://www.newyorkfed.org/medialibrary/media/research/blog/2023/NYFed-Staff-Nowcast_technical-paper"
[5]: https://www.newyorkfed.org/research/data_indicators/term-premia-tabs "https://www.newyorkfed.org/research/data_indicators/term-premia-tabs"
[6]: https://www.imf.org/-/media/Files/Publications/WP/2019/WPIEA2019036.ashx "https://www.imf.org/-/media/Files/Publications/WP/2019/WPIEA2019036.ashx"
[7]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2520929. "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2520929."
[8]: https://www.nber.org/system/files/working_papers/w17182/w17182.pdf "https://www.nber.org/system/files/working_papers/w17182/w17182.pdf"
[9]: https://www.newyorkfed.org/medialibrary/media/research/capital_markets/prob_rec.pdf?utm_source=chatgpt.com "Probability of US Recession Predicted by Treasury Spread"
[10]: https://www.aeaweb.org/conference/2020/preliminary/paper/FR4yS3f3 "https://www.aeaweb.org/conference/2020/preliminary/paper/FR4yS3f3"
[11]: https://www.nber.org/system/files/working_papers/w11468/w11468.pdf "https://www.nber.org/system/files/working_papers/w11468/w11468.pdf"
