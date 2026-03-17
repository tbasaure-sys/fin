# BLS Prime: Guía simple para clientes

## Qué es BLS Prime

BLS Prime es una terminal de decisión para inversionistas.

Su objetivo no es mostrar “más datos” por mostrar, sino ayudar a responder preguntas concretas sobre mercado, riesgo, portafolio y acción.

Hoy la terminal busca responder, de forma simple, seis preguntas clave:

1. Qué está pasando realmente en el mercado
2. Dónde hay una oportunidad concreta
3. Qué tan sano está el portafolio
4. Qué tan frágil está la estructura del mercado
5. Si conviene confiar en un rebote o desconfiar de él
6. Qué debería hacer un portafolio de forma prudente

La idea central es combinar:

- análisis cuantitativo
- lectura de riesgo
- contexto de portafolio
- estructura de mercado
- ideas accionables en lenguaje simple

## Qué hace diferente a BLS Prime

Muchos dashboards financieros muestran gráficos, ratios y noticias.

BLS Prime busca ir un paso más allá:

- no solo describe el mercado
- también traduce el análisis en postura, riesgo y acción
- distingue entre rebotes sanos y rebotes engañosos
- separa shocks transitorios de fragilidad estructural

En vez de obligar al usuario a interpretar 20 señales distintas, el sistema intenta resumir:

- dónde está el edge
- qué tan sano está el portafolio
- qué tan frágil está el mercado
- si el rebote actual parece confiable
- qué movimientos parecen más razonables ahora
- qué tendría que cambiar para modificar esa postura

## La idea nueva más importante

Una de las mejoras centrales incorporadas recientemente es que BLS Prime ya no trata toda la volatilidad como si fuera igual.

La terminal ahora distingue entre dos tipos de clusters de volatilidad:

- componente estructural (`G`): fragilidad del mercado, crowding, compresión espectral, pérdida de diversificación real
- componente de régimen (`R`): shock agudo, estrés transitorio, episodios de miedo o liquidación

Esto importa porque dos períodos con volatilidad alta pueden verse parecidos en un gráfico, pero exigir respuestas completamente distintas.

En simple:

- si domina `G`, el problema es más profundo y el rebote puede no resolver la fragilidad
- si domina `R`, el shock puede ser fuerte pero transitorio, y esperar un rebote puede ser razonable

## Cómo está organizado

La terminal está dividida en secciones. Cada una cumple una función distinta.

## 1. Your Portfolio

Esta es la vista principal del portafolio.

Muestra:

- holdings principales
- pesos
- exposición por sector
- comparaciones visuales contra SPY
- distribución de valorización
- notas sobre fortalezas y debilidades ocultas del portafolio
- paneles rápidos de retorno, volatilidad y drawdown

En simple:

Esta sección responde “qué tengo realmente” y “cómo está parado mi portafolio hoy”.

## 2. Next Best Moves

Esta sección propone los movimientos más razonables en este momento.

Puede incluir:

- ideas para agregar
- ideas para reducir
- posiciones para mantener
- fuente de financiamiento sugerida
- razón principal
- qué invalidaría esa idea

Ahora además incorpora el framework de rebote y fragilidad.

Eso significa que las acciones ya no se explican solo con momentum, score o valuation. También se condicionan por:

- si el cluster es `G-dominated` o `R-dominated`
- qué tan alta es la confianza en un rebote
- qué tan buena parece la calidad de ese rebote
- el nivel de `VIX` cuando está disponible

En simple:

Esta sección responde “si tuviera que actuar hoy, qué haría primero” y “por qué esa acción sí o no tiene sentido en este tipo de mercado”.

## 3. Capital Protocol

Esta es la capa de disciplina del sistema.

No mira solo retorno potencial. También mira:

- confianza del modelo
- espacio de error
- necesidad de protección
- capacidad del portafolio para recuperarse si algo sale mal
- recoverability budget
- decision rights del sistema

En simple:

Esta sección responde “cuánto derecho tiene el sistema a hablar fuerte hoy”.

## 4. Edge Board

Resume dónde están las oportunidades más interesantes del momento en cuatro niveles:

- sectores
- países
- monedas
- acciones

Cada edge viene acompañado de:

- score
- explicación corta
- forma sugerida de expresarlo
- señales que lo apoyan

En simple:

Esta sección responde “dónde está la mejor oportunidad visible ahora”.

## 5. Stock Ideas

Aquí aparece el screener de oportunidades.

Muestra:

- nombres nuevos fuera del portafolio
- tipo de tesis
- score
- gap de valoración
- momentum
- confirmaciones fundamentales

En simple:

Esta sección responde “qué acciones merecen entrar al radar”.

## 6. Risk Check

Esta sección resume el estado de riesgo del sistema.

Incluye:

- `VIX` cuando está disponible
- probabilidad de caída fuerte
- riesgo de estrés
- fragilidad de mercado
- techo de riesgo sugerido
- barras visuales para leer el estado general
- descomposición del cluster de volatilidad entre `G` y `R`
- `Rebound Confidence`
- histórico de confianza del rebote comparado con el telón de fondo del `VIX`

### Qué significa cada concepto nuevo

#### Volatility Cluster Decomposition

No solo dice que hay volatilidad alta.

También intenta responder:

- la volatilidad viene más de una estructura de mercado comprimida y frágil
- o viene más de un shock agudo y potencialmente transitorio

En simple:

Esta capa responde “la calma es prudencia o complacencia”.

#### Rebound Confidence

No parte de la idea simplista de que “los mercados siempre rebotan”.

Más bien intenta estimar:

- qué tan probable parece una recuperación desde el estado actual
- qué tan rápida podría ser
- si el contexto actual parece recuperable o no

En simple:

Esta sección responde “conviene confiar en el rebote desde aquí”.

## 7. Diversification Map

Aquí se evalúa si la diversificación del portafolio es real o aparente.

No basta con tener muchos nombres. A veces un portafolio parece diversificado, pero en la práctica depende de pocos factores.

Esta sección ayuda a detectar:

- concentración real
- falsa diversificación
- espacio efectivo para diversificar mejor
- compresión espectral
- dimensión efectiva del mercado
- peso del factor dominante

Además ahora incorpora una señal nueva:

### Rebound Quality

Esta señal intenta medir si el rebote actual está:

- restaurando de verdad la estructura del mercado
- o simplemente generando alivio de precio sin reparar la fragilidad subyacente

Un rebote puede ser:

- `Restorative`: mejora breadth, baja compresión, mejora la diversificación real
- `Mixed`: hay rebote, pero la estructura mejora solo parcialmente
- `Palliative`: suben los precios, pero la fragilidad sigue ahí o empeora

La sección también puede mostrar histórico reciente de calidad del rebote versus compresión estructural.

En simple:

Esta sección responde “estoy realmente diversificado o solo parece que sí” y “el rebote está sanando el mercado o solo maquillándolo”.

## 8. Areas to Watch

Muestra sectores o grupos temáticos que merecen atención.

Puede señalar:

- áreas preferidas
- áreas activas
- áreas para monitorear

En simple:

Esta sección responde “qué zonas del mercado están ganando relevancia”.

## 9. Beyond the US

Entrega contexto internacional.

Muestra oportunidades fuera de Estados Unidos en mercados o países específicos.

En simple:

Esta sección responde “hay mejores oportunidades fuera de EE.UU. ahora”.

## 10. Decision Log

Es la memoria del sistema.

Guarda advertencias, notas y señales relevantes que explican por qué la postura actual es la que es.

En simple:

Esta sección responde “qué cambió para que el sistema piense distinto”.

## 11. Alertas y Command Bar

La terminal también incluye:

- alertas contextuales
- vistas guardadas
- comandos rápidos
- navegación más rápida entre módulos

Esto hace que el producto funcione más como una terminal y menos como una página estática.

## De dónde viene la información

La base de BLS Prime no es un simple frontend bonito.

La información viene de una arquitectura de varias capas:

### 1. Research engine

Existe una capa de investigación cuantitativa y de asignación que genera:

- postura
- riesgo
- hedge
- ideas
- mapas sectoriales e internacionales
- snapshot del estado del sistema
- medidas espectrales de compresión, libertad y dimensión efectiva

### 2. Portfolio layer

Existe una capa que analiza el portafolio:

- holdings
- pesos
- valuation
- simulaciones
- screener
- contexto de posiciones actuales

### 3. Product layer

Encima de eso, BLS Prime traduce ese trabajo técnico a una interfaz mucho más usable para un inversionista.

También resume señales complejas en conceptos accionables como:

- edge dominante
- recoverability
- `G vs R`
- confianza del rebote
- calidad del rebote

## Por qué la base es sólida

Hay varias razones por las que la base del producto es seria:

### 1. Separación entre análisis y presentación

La lógica de research no vive mezclada con la interfaz.

Eso es importante porque:

- hace más confiable el sistema
- permite auditar mejor
- reduce errores por cambios visuales
- hace posible escalar la plataforma

### 2. Snapshot reproducible

La terminal no depende de improvisación en vivo para funcionar.

La información se empaqueta en un snapshot reproducible, lo que permite:

- consistencia
- control de versiones
- despliegues más estables
- menos dependencia del entorno local

### 3. Mejor lectura de mercado que un dashboard tradicional

La mejora más importante es conceptual.

Muchos sistemas llegan solo hasta:

- la volatilidad está alta
- el mercado está débil
- eventualmente debería venir un rebote

BLS Prime intenta llegar más lejos y preguntar:

- por qué se agrupó la volatilidad
- si el mercado es realmente recuperable desde aquí
- si el rebote actual es estructuralmente sano o solo alivio temporal

Ese cambio hace que el sistema sea más útil para toma de decisiones reales, no solo para monitoreo.

## En una frase

BLS Prime no solo intenta decir “qué está pasando”.

Intenta decir:

- qué está pasando
- por qué está pasando
- si el rebote merece confianza
- qué significa eso para el portafolio
- y qué acción prudente parece más razonable ahora
