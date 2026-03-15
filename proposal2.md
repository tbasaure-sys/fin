
Mi intuición central es esta: **lo nuevo no va a venir de otra regresión del equity premium**. Va a venir de modelar mejor los **wedges** que el mercado suele comprimir en una sola variable. En la práctica, el mercado tiende a tratar como si fueran lo mismo cuatro cosas que no lo son: la historia que se cuenta, quién posee el activo, cuánto tiempo puede sostenerlo, y qué parte del beneficio reportado termina siendo caja real.

### 1) Mapa de desalineación entre creencia y capacidad de sostenerla

Esta sería mi apuesta más original.

No mediría “sentimiento”. Mediría algo más raro: **quién cree qué, y si tiene balance, mandato y horizonte para seguir creyéndolo cuando el precio va en contra**. La idea nace de unir tres literaturas que suelen vivir separadas: higher-order beliefs, narrativas y sistemas de demanda/ownership. Sabemos que las creencias de segundo orden importan, que las narrativas pueden mover flujos, y que la composición de tenedores y el benchmarking generan crowding y afectan precios. La hipótesis nueva sería que el mercado es más frágil no cuando hay optimismo, sino cuando el optimismo está alojado en “manos débiles”: holders apalancados, benchmarked, con riesgo de redención, o con mandato rígido. ([NBER][1])

La forma matemática mínima sería algo así:

[
Frag_t = Disp_t \times HOBgap_t \times Constraint_t \times Rigidity_t
]

donde (Disp_t) es dispersión de creencias, (HOBgap_t) es la diferencia entre “lo que creo” y “lo que creo que los otros creen”, (Constraint_t) mide restricciones del holder marginal, y (Rigidity_t) la rigidez de ownership.
No es un modelo de trading. Es un **modelo de fragilidad del consenso**. Sirve para decir: “el rally está sostenido por capital paciente” versus “el rally está sostenido por una narrativa buena pero en manos incapaces de absorber volatilidad”.

Eso, honestamente, me parece más prometedor que casi cualquier timing macro estándar.

### 2) Kernel de conversión earnings → caja

Esta sería mi segunda apuesta fuerte.

No haría un modelo de “earnings quality” tradicional. Haría un modelo donde **cada dólar de earnings reportado entra en una cadena de estados** y solo una parte termina en caja distribuible. El resto se va a mantenimiento, capitalización dudosa, SBC, reversión contable, write-offs, o crecimiento que jamás se monetiza.

Una forma compacta:

[
CF_{t+h}^{(earn)}=\sum_{\tau \le t} K_i(h \mid z_t),E_{i,\tau}
]

donde (K_i) es un **cash-realization kernel** firma-específico y (z_t) es el régimen macro/financiero. La pregunta deja de ser “¿crecen las ganancias?” y pasa a ser “¿a qué velocidad y con qué pérdida se convierten en caja?”

La intuición no sale de la nada: la evidencia reciente muestra que earnings ajustados por intangibles ayudan a pronosticar mejor dividendos y cash flows futuros, y también hay trabajo estructural mostrando que los incentivos de disclosure pueden distorsionar inversión e informativeness de earnings. Pero no vi una formulación estándar que trate a los earnings como **cohortes que decaen hacia caja** con una dinámica de supervivencia. 

Mi sospecha es que aquí hay alpha de verdad porque el mercado sigue siendo bastante bruto para distinguir “beneficio económico” de “beneficio contable con baja tasa de realización”.

### 3) Semivida de salida del capital

El capital cycle clásico mira entrada de capacidad y márgenes. Yo lo empujaría un paso más: **lo decisivo no es solo cuánto entra, sino qué tan rápido puede salir cuando sobra**.

Definiría para cada industria una **exit half-life** del capital:

[
h_j(t)=P(\text{salida de capacidad en } t \mid \text{márgenes, deuda, especificidad, regulación, rigidez laboral})
]

La tesis es que muchos errores de mercado vienen de asumir “mean reversion” sin modelar la velocidad de destrucción de capacidad. Pero la velocidad importa brutalmente. Si el capital es específico, la liquidación vale poco; si la reubicación es lenta, la sobrecapacidad dura mucho; si la capacidad es organizacional y no física, la salida también puede ser muy lenta aunque el capex aparente sea bajo. La literatura sí muestra que la redeployability/liquidation value suele ser limitada en muchas firmas y que la reallocation del capital tiene una dinámica cíclica propia. Lo que yo añadiría es usar eso como **motor explícito de escenarios sectoriales**. 

Donde más me gusta esta idea es en industrias donde el mercado narra rápido pero el capital muere lento.

### 4) Superficie de elasticidad del dueño marginal

Aquí la pregunta no es “¿está barato?” sino “¿qué tan difícil es mover el precio si cambia el flujo marginal?”.

En vez de un único concepto de demand elasticity, construiría una **superficie**:

[
\frac{\partial P_i}{\partial F_i}\Big|_{s} \approx \frac{1}{A_i(s)}
]

donde (A_i(s)) es la **capacidad de absorción** del activo (i) bajo el escenario (s).
Esa capacidad dependería de float real, ownership pasivo, overlap con benchmarks, concentración, insider lock-up económico, mandato del holder dominante, liquidez micro, y necesidad de intermediación.

Esto me parece especialmente fértil en small/mid caps, holdings, spin-offs, situaciones familiares, o compañías con base accionaria rara. Además, hay una razón teórica para no tratar esa elasticidad como fija: un paper reciente muestra que en setting dinámico los shocks de oferta no solo mueven el punto sobre la curva de demanda, sino que pueden inclinar y desplazar la curva misma; es decir, la elasticidad “verdadera” es más estructural y estado-dependiente de lo que sugieren estimaciones estándar. A eso se suma la evidencia de crowding por benchmarking y las restricciones de intermediación de balance sheet. 

Mi traducción práctica: hay activos cuya “baratura” no importa porque su dueño marginal está atrapado; y otros cuya “caridad valorativa” no importa porque casi nadie más puede comprar.

### 5) Detector de incoherencia entre escenarios implícitos

Este es el más raro, y probablemente el más “nunca formalizado así”.

Yo construiría un modelo que no intenta predecir el mercado, sino detectar cuándo el mercado está **internamente incoherente**. Es decir: dados equity, crédito, curva, breakevens, oro, dólar, vol, etc., ¿existe un conjunto pequeño y razonable de escenarios que racionalice simultáneamente esos precios?

Formalmente:

[
\min_{p_s,\lambda_i}
\sum_i w_i\left(r_i^{mkt} - \sum_s p_s B_{is} - \lambda_i\right)^2 + \Omega(p,\lambda)
]

donde (B_{is}) es la sensibilidad aproximada del activo (i) al escenario (s), (p_s) son probabilidades de escenario y (\lambda_i) ajustes por prima de riesgo.
Si el error irreducible sale muy alto, no concluyo “el mercado está loco”; concluyo algo más útil: **algún subconjunto de activos está contando una historia que no cabe junto con el resto**.

Eso, para asset allocation, me parece potentísimo. No porque te diga el próximo print. Porque te dice cuándo el tape entero está mal ensamblado.

### 6) Gap entre reacción de política implícita y reacción de política estructural

Muchos inversores creen que modelan macro, pero en realidad deberían modelar la **función de reacción**.
No importa solo el dato; importa cómo responderán Fed, Treasury, reguladores y dealers bajo restricciones reales de mercado.

La variable sería:

[
Gap_t = E_t^{mkt}[\text{política}] - E_t^{struct}[\text{política}\mid x_t,\text{condiciones financieras},\text{funcionamiento de mercado}]
]

Aquí metería no solo rates, sino balance sheet policy y market functioning. Hay trabajo reciente del BIS que integra balance sheet policy dentro de un Monetary Conditions Index, y también evidencia de que las restricciones de balance sheet de dealers deterioran la liquidez del Treasury más allá de lo explicado por volatilidad. Eso te dice que la reacción de política y la transmisión financiera ya no pueden pensarse solo con la short rate. ([Banco de Pagos Internacionales][2])

No es mi primer modelo a construir, pero sí uno muy valioso como overlay macro.

## Si yo tuviera que apostar el tiempo de los tres hermanos

No empezaría por el más elegante. Empezaría por el que combina **novedad, falsabilidad y cercanía al dinero**.

Mi orden sería:

Primero, **kernel earnings→caja**. Porque pega directo sobre valoración, evita muchísimas trampas de crecimiento bonito, y puede dar ventaja tanto en largos como en “no tocar esto ni loco”.

Segundo, **desalineación creencia-capacidad**. Porque es una forma distinta de leer mercado: no desde precio y macro, sino desde la fragilidad del consenso.

Tercero, **superficie de elasticidad del dueño marginal**. Porque ustedes, siendo chicos y con capital propio, pueden explotar rincones donde los grandes no pueden entrar o salir con libertad.

Cuarto, **semivida de salida del capital** para sectores o subindustrias concretas.

Y el **detector de incoherencia** lo correría todos los meses a nivel cartera, no como stock picker sino como brújula de régimen.

La idea de fondo es esta: el alpha nuevo probablemente no salga de “predecir mejor”, sino de **medir mejor lo que el mercado simplifica**. El mercado simplifica narrativas, holders, contabilidad, capacidad y política. Ahí es donde yo cavaría.

[1]: https://www.nber.org/system/files/working_papers/w32680/w32680.pdf "Higher-Order Beliefs and Risky Asset Holdings"
[2]: https://www.bis.org/publ/work1281.pdf "Integrating balance sheet policy into monetary policy conditions"
