# BLS Prime — Auditoría, propuesta de producto y prompt de rediseño

> Documento fuente del trabajo de rediseño. Subido por Tomas al chat el 27 de julio
> de 2026 y copiado al repo para que cualquier agente pueda retomar sin depender de
> la sesión original. Ver `HANDOFF_2026-07-27_P0.md` para el estado de ejecución.

Fecha de auditoría: 27 de julio de 2026
Sitio revisado: https://www.blsprime.com/

## Veredicto ejecutivo

BLS Prime no necesita principalmente un "lavado de cara". La calidad visual de varias pantallas ya está por encima de la media. El problema es que parece una colección de cuatro productos diseñados en momentos distintos, no un sistema único para tomar decisiones de inversión.

La oportunidad es convertirlo en un **workspace de decisión de inversión** con una secuencia coherente:

1. Descubrir una empresa que merece atención.
2. Entender qué expectativas exige su precio.
3. Construir una valoración y una tesis defendibles.
4. Medir el efecto sobre la cartera y su downside.
5. Guardar la decisión, los falsificadores y lo que debe monitorearse.

AURORA, FactorLab y Stress Engine deben sobrevivir como nombres de motores secundarios. BLS Prime debe ser la marca y el producto principal. El usuario debería poder entrar desde cualquier motor, pero todos los caminos deben converger en el mismo objeto: una empresa, su evidencia, una decisión y su impacto en cartera.

## Qué vale la pena preservar

- La estética oscura, sobria y editorial transmite seriedad.
- La combinación tipográfica serif/sans tiene personalidad y evita parecer otro dashboard genérico.
- "Antes de invertir, entiende qué necesita el precio" es una muy buena puerta de entrada.
- La disciplina de no publicar una cifra sin evidencia suficiente es una diferenciación real.
- La trazabilidad, las fuentes y los falsificadores pueden convertirse en una ventaja competitiva.
- FactorLab ya articula "por qué ahora" y "qué mata la tesis", mucho más útil que un screener convencional.
- AURORA tiene estados de proceso claros y una lógica de auditoría reproducible.

El rediseño debe consolidar estas virtudes, no reemplazarlas por una interfaz SaaS genérica azul con tarjetas intercambiables.

## Diagnóstico priorizado

### P0 — Confianza y funcionamiento

1. **La herramienta principal de la portada no concluye.** Con ASML quedó en "Revisando la empresa…" sin resultado, error ni recuperación. Todo proceso debe tener timeout, mensaje útil, reintento y un estado terminal.
2. **"Probar mi cartera" no permite probar Stress Engine.** El clic abre una barrera de registro. Es una promesa rota. Debe existir una demo con una cartera de ejemplo o el CTA debe decir honestamente "Analizar mi cartera — requiere cuenta".
3. **Los datos no siempre tienen fecha y fuente utilizables.** AURORA terminó un análisis de MU con "Fecha pendiente" para estados y precio. Un producto financiero no puede presentar métricas sin un "as of" visible.
4. **La localización se rompe entre rutas y durante la carga.** FactorLab mostró contenido español e inglés en una misma vista; Portfolio Intelligence inició en inglés pese a `lang=es`; "Terms" permanece en inglés. Idioma, metadatos, atributos accesibles y contenido deben cambiar de forma atómica.
5. **Falta una política visible de privacidad.** La portada sólo enlaza Términos y el registro solicita nombre, email y contraseña sin un enlace de privacidad visible junto al formulario.

### P1 — Arquitectura y claridad

1. **La portada contiene dos héroes y dos `h1`.** Ambos compiten por definir el producto. Debe existir una sola promesa principal y una sola acción primaria.
2. **La navegación pública casi no existe.** No permite entender Producto, Cómo funciona, Metodología, Seguridad/privacidad o Precios/acceso.
3. **La marca cambia:** "BLS Prime", "BLS PRIME", "BL'S" y el isotipo "B". Debe existir un único lockup y reglas de uso.
4. **Cada módulo es una microsite.** Cambian header, navegación, estilos, lenguaje, densidad, estructura y forma de volver al producto.
5. **La secuencia del producto no es evidente.** Portfolio Intelligence, AURORA, FactorLab y Stress aparecen numerados, pero no producen una decisión persistente ni hacen visible cómo se pasan información.
6. **El registro vende sólo Stress Engine.** La promesa de la cuenta debe ser el workspace completo, no una función aislada.

### P1 — Utilidad decisional

1. **AURORA privilegia el proceso sobre la decisión.** Tras 12 segundos muestra 128 entradas de registro, seis auditorías y 63% de cobertura, pero no entrega primero una respuesta simple: qué sabemos, qué no sabemos, qué exige el precio, qué supuesto domina y qué haría cambiar de opinión.
2. **"En revisión" es correcto, pero insuficiente.** Si no se publica un rango, la salida debe transformarse en un plan de cierre de evidencia priorizado: bloqueo, impacto, fuente requerida, responsable y siguiente acción.
3. **FactorLab expone implementación interna.** El JSON completo de búsqueda es útil para auditoría o descarga, no para la vista principal.
4. **El ranking es confuso.** Se repiten prioridades "1" y "2" por grupo, mientras aparece un score distinto. Debe distinguirse ranking global, ranking dentro del arquetipo y score.
5. **La fecha de FactorLab es antigua para una búsqueda que parece viva.** Debe existir un indicador prominente `Datos al DD MMM AAAA`, una etiqueta Demo/Live y una explicación de actualización.
6. **Portfolio Intelligence tiene una buena idea, pero vive aislada.** La selección de observaciones repetibles produce nombres, KPI y falsificadores; eso debería crear elementos en una research queue y conectarse con AURORA, no terminar como una lista estática.

### P2 — Legibilidad, accesibilidad y calidad

1. Hay etiquetas de aproximadamente 11 px y mucho texto gris de bajo énfasis sobre negro. Deben revisarse contraste, tamaño mínimo y legibilidad real.
2. Los héroes son demasiado grandes y ocupan casi todo el viewport; reducen el contenido útil above the fold.
3. Debe probarse navegación completa por teclado, foco visible, anuncios de loading/error y orden de lectura.
4. Debe existir sólo un `h1` por página y una jerarquía semántica estable.
5. La descripción SEO de la portada está en inglés aunque la página está en español; canonical, `hreflang`, Open Graph y metadata deben ser coherentes.
6. La vista móvil no pudo validarse visualmente en esta auditoría. Debe considerarse una condición de aceptación, no una suposición.

## Arquitectura recomendada

### Sitio público

- `/` — promesa única, análisis rápido de ticker, workflow completo y demos.
- `/product` — el proceso de decisión de principio a fin.
- `/aurora` — demo de valoración/expectativas implícitas.
- `/factorlab` — demo de descubrimiento.
- `/stress` — demo con cartera de ejemplo.
- `/methodology` — fuentes, point-in-time, reglas, limitaciones y auditabilidad.
- `/security` o `/privacy` — privacidad, almacenamiento y tratamiento de cartera.
- `/login` y `/signup` — acceso coherente al workspace.

### Aplicación autenticada

- `/app` — home con research queue, análisis recientes, cartera y alertas.
- `/app/discover` — FactorLab.
- `/app/company/[ticker]` — ficha unificada de empresa: quick take, AURORA, tesis, fuentes, decisión y monitoreo.
- `/app/portfolio` — posiciones, exposiciones efectivas, clusters y concentración.
- `/app/portfolio/risk` — Stress Engine y escenarios.
- `/app/decisions` — journal de decisiones, passes, watchlist y tesis.
- `/app/monitor` — KPI, falsificadores, cambios de tesis y datos nuevos.
- `/app/settings` — perfil, idioma, fuentes y privacidad.

## Propuesta para la portada

### Hero

**Eyebrow:** BLS Prime · Investment decision workspace
**Título:** Antes de invertir, entiende qué necesita el precio.
**Subtítulo:** Descubre empresas, contrasta precio y valor, y comprueba el efecto sobre tu cartera con datos fechados, supuestos visibles y razones claras para actuar o pasar.
**Acción principal:** input de ticker + `Analizar empresa`
**Acción secundaria:** `Explorar una demo`

Debajo del input deben verse tres garantías concretas:

- Sin cuenta para la primera lectura.
- Fecha, fuente y supuestos siempre visibles.
- Si la evidencia no alcanza, explica exactamente qué falta.

### Segundo bloque

Mostrar un solo flujo, no otro hero:

`Descubrir → Entender el precio → Construir la tesis → Medir riesgo → Monitorear`

Cada paso debe tener un resultado tangible, no sólo un nombre de módulo.

### Demo

Usar una empresa real con datos fechados y claramente etiquetados como ejemplo. Mostrar:

- precio y fecha;
- expectativa implícita;
- rango o estado "no publicable";
- principal supuesto;
- principal riesgo;
- efecto en una cartera de ejemplo;
- CTA para abrir el análisis completo.

### Confianza

Incluir metodología, política de datos, timestamp, fuentes, limitaciones, privacidad y un sample report descargable. No inventar logos de clientes, testimonios ni métricas de uso.

---

# Prompt completo listo para un agente

```text
Actúa como principal product designer, product strategist y senior full-stack engineer responsable de convertir blsprime.com en un producto financiero profesional, coherente y funcional.

Tu misión no es "modernizar" superficialmente la UI. Debes rediseñar la arquitectura del producto, unificar la experiencia y corregir las funciones rotas o engañosas sin destruir las mejores ideas existentes.

CONTEXTO DEL PRODUCTO

BLS Prime aspira a ser un workspace de decisión de inversión para inversores serios e independientes y, eventualmente, gestores boutique. Su diferenciación no debe ser tener más gráficos, sino conectar:

1. descubrimiento de oportunidades;
2. expectativas implícitas en el precio;
3. valoración y tesis;
4. efecto sobre la cartera y downside;
5. decisión, falsificadores y monitoreo.

Los motores actuales son:

- AURORA: valoración, expectativas y calidad de evidencia.
- FactorLab: búsqueda y priorización de oportunidades.
- Stress Engine: riesgo y escenarios de cartera.
- Portfolio Intelligence: concentración, apuestas efectivas y descubrimiento basado en observaciones repetibles.

Mantén BLS Prime como marca maestra. AURORA, FactorLab y Stress Engine pueden conservarse como nombres secundarios de motores, pero no deben sentirse como microsites independientes. "BLS Breakpoint" no debe añadir otra marca: conviértelo en la lectura rápida de AURORA o en una capacidad genérica del hero.

PROBLEMAS CONFIRMADOS EN LA WEB ACTUAL

1. La portada tiene dos héroes y dos h1 que compiten por explicar el producto.
2. El análisis rápido de ASML queda indefinidamente en "Revisando la empresa…" sin resultado, timeout, error ni retry.
3. "Probar mi cartera" abre un modal que exige crear cuenta; no existe una prueba real de Stress Engine.
4. La identidad cambia entre BLS Prime, BLS PRIME, BL'S y el isotipo B.
5. Cada módulo tiene header, navegación, densidad y lenguaje visual diferentes.
6. Hay contenido español e inglés mezclado, estados iniciales en inglés pese a `lang=es` y metadatos en inglés en páginas españolas.
7. AURORA puede terminar correctamente, pero presenta primero auditoría y proceso. En la prueba con MU informó 63% de cobertura, "Fecha pendiente" y "En revisión", sin convertir esas brechas en un siguiente paso claro.
8. FactorLab funciona como filtro, pero usa un snapshot antiguo presentado como ejemplo, mezcla idiomas, repite rankings dentro de grupos y expone un gran JSON interno en la página principal.
9. Portfolio Intelligence tiene un generador útil de nombres/KPI/falsificadores, pero no crea una research queue ni conecta los resultados con una ficha de empresa o decisión.
10. El registro vende principalmente Stress Engine, no el valor total del workspace.
11. La portada sólo muestra un enlace a Términos; falta una política de privacidad visible en navegación y registro.
12. Hay etiquetas cercanas a 11 px, texto gris poco legible y héroes sobredimensionados.
13. La portada usa descripción SEO en inglés sobre contenido español.

PRINCIPIO DE PRODUCTO

El objeto central no es "un módulo"; es una decisión sobre una empresa.

Todos los caminos deben converger en una ficha unificada:

- empresa y ticker;
- fecha y precio observados;
- quick take;
- expectativas implícitas;
- valoración o razón para no publicarla;
- calidad/cobertura de evidencia;
- tesis y contra-tesis;
- KPI a monitorear;
- falsificadores;
- efecto sobre la cartera;
- decisión: investigar, watchlist, pasar, comprar/aumentar/reducir si el producto realmente soporta esas acciones;
- historial de cambios.

No inventes capacidades de backend ni presentes datos simulados como live. Toda promesa visible debe mapearse a una función real. Cuando el backend no exista, implementa un modo demo determinístico y claramente rotulado, o elimina/reformula la promesa.

FASE 1 — INSPECCIÓN OBLIGATORIA

Antes de editar:

1. Recorre el repositorio completo y documenta framework, rutas, componentes compartidos, autenticación, APIs, proveedores de datos, variables de entorno, modelos, caché, persistencia, i18n y tests.
2. Ejecuta la app y reproduce cada flujo público y autenticado disponible.
3. Construye una matriz de rutas con: propósito, usuario, CTA, backend usado, estado real, errores y duplicaciones.
4. Identifica qué componentes y estilos son reutilizables. No reescribas todo si existe una base sólida.
5. Localiza la causa del spinner infinito de Breakpoint. Añade logging y tests que reproduzcan la falla antes de corregirla.
6. Comprueba si Stress Engine funciona dentro del workspace autenticado y qué datos mínimos necesita.
7. Comprueba de dónde provienen fechas, precio, estados, SEC, FMP y scores. Ningún dato financiero podrá mostrarse sin `as of`, fuente y estado de frescura.
8. Presenta un plan breve de implementación y un inventario de riesgos. Luego continúa; no te detengas a pedir aprobación salvo que falte una decisión irreversible o credenciales necesarias.

FASE 2 — ARQUITECTURA

Separa con claridad:

A. Sitio público:
- `/`
- `/product`
- `/aurora`
- `/factorlab`
- `/stress`
- `/methodology`
- `/privacy`
- `/terms`
- `/login`
- `/signup`

B. Aplicación:
- `/app`
- `/app/discover`
- `/app/company/[ticker]`
- `/app/portfolio`
- `/app/portfolio/risk`
- `/app/decisions`
- `/app/monitor`
- `/app/settings`

Adapta esta estructura al router existente. Evita migraciones de URL destructivas: crea redirects para rutas antiguas y conserva deep links.

NAVEGACIÓN GLOBAL

Sitio público:
- logo único BLS Prime;
- Producto;
- Metodología;
- Demo;
- ES/EN;
- Iniciar sesión;
- CTA "Crear workspace".

Aplicación:
- Inicio;
- Descubrir;
- Empresas;
- Cartera;
- Monitorear;
- búsqueda global de ticker;
- selector de idioma;
- perfil.

El mismo shell, logo, tokens y comportamiento deben usarse en todo el producto. Los motores pueden tener un color/acento secundario, pero no headers ni sistemas visuales propios.

FASE 3 — PORTADA

Construye una sola narrativa.

Hero recomendado:

Eyebrow: "BLS Prime · Investment decision workspace"
H1: "Antes de invertir, entiende qué necesita el precio."
Subtítulo: "Descubre empresas, contrasta precio y valor, y comprueba el efecto sobre tu cartera con datos fechados, supuestos visibles y razones claras para actuar o pasar."

CTA principal:
- input de ticker;
- botón "Analizar empresa";
- validación inmediata;
- loading con etapas reales;
- timeout;
- error accionable;
- retry;
- éxito con preview útil;
- soporte de teclado;
- respuesta móvil.

CTA secundario:
- "Explorar una demo".

Garantías debajo:
- "Sin cuenta para la primera lectura."
- "Fecha, fuente y supuestos siempre visibles."
- "Si la evidencia no alcanza, explica exactamente qué falta."

Luego muestra el workflow:

1. Descubrir — resultado: candidatos priorizados.
2. Entender el precio — resultado: expectativas implícitas.
3. Construir la tesis — resultado: rango/estado, drivers y falsificadores.
4. Medir riesgo — resultado: contribución a downside y concentración.
5. Monitorear — resultado: KPI, evidencia nueva y cambios de tesis.

Evita un segundo hero. Usa una demo integrada de una empresa real con datos claramente fechados y una cartera de ejemplo. Ningún número ilustrativo debe parecer live.

FASE 4 — FICHA UNIFICADA DE EMPRESA

Diseña `/app/company/[ticker]` y la equivalente demo pública con divulgación progresiva.

Above the fold:
- empresa/ticker;
- precio + fecha + estado de mercado;
- estado del análisis;
- quick verdict: atractivo, exigente, incierto o no publicable, con explicación no prescriptiva;
- expectativas implícitas a 3/5/10 años cuando existan;
- rango defendible o razón concreta para no publicarlo;
- principal driver;
- principal riesgo;
- evidencia disponible y faltante;
- acciones: guardar, añadir a research queue, comparar, abrir impacto en cartera.

Segundo nivel:
- Valor;
- Tesis;
- Escenarios;
- Evidencia;
- Cambios;
- Auditoría.

La auditoría completa y el registro técnico deben estar disponibles, pero no dominar la primera pantalla.

Cuando el valor sea "En revisión", muestra un plan de cierre:
- control faltante;
- por qué cambia la decisión;
- impacto estimado;
- fuente necesaria;
- próxima acción;
- posibilidad de marcarlo como resuelto.

FASE 5 — FACTORLAB

Mantén su gran virtud: "por qué ahora" y "qué mata la tesis".

Corrige:
- idioma coherente;
- `Demo` vs `Live` visible;
- fecha del dataset;
- frecuencia de actualización;
- ranking global separado de ranking por arquetipo;
- score explicado en plain language;
- filtros con URL compartible;
- empty states y errores;
- navegación directa a la ficha unificada;
- acción "Añadir a research queue";
- no mostrar JSON crudo en la vista principal.

Mueve parámetros, versión del modelo, fuentes, lag policy y JSON a un drawer "Metodología y auditoría" con opción de copiar/descargar.

FASE 6 — PORTFOLIO INTELLIGENCE Y STRESS

Para usuarios sin cuenta, crea una demo real con una cartera de ejemplo y permite:
- editar 4–6 pesos;
- visualizar concentración;
- mostrar clusters/exposiciones;
- ejecutar un stress básico;
- identificar contribución a pérdida;
- ver cómo añadir una empresa cambia la cartera.

Si una función requiere cuenta, indícalo antes del clic. Nunca uses "Probar" para una acción que abre sólo registro.

Para usuarios autenticados:
- importar o ingresar posiciones;
- mostrar fuente, fecha y moneda;
- distinguir peso, capital invertido y exposición efectiva;
- ejecutar escenarios reproducibles;
- guardar resultados;
- enlazar cada riesgo a las posiciones que lo explican;
- enlazar una empresa investigada a su impacto marginal en cartera.

Integra el generador de observaciones repetibles:
- las cuatro elecciones producen nombres;
- cada nombre incluye KPI, prueba pública, vencimiento y falsificador;
- "Guardar" crea un item en research queue;
- desde ahí puede abrirse AURORA;
- el seguimiento semanal/mensual aparece en Monitor.

FASE 7 — REGISTRO, CONFIANZA Y LEGAL

El signup debe vender el workspace completo:
- "Guarda investigaciones, conecta decisiones con cartera y monitorea qué podría invalidarlas."

Incluye:
- beneficios concretos;
- explicación de qué datos se guardan;
- privacidad;
- términos;
- política de datos de cartera;
- gestión de cuenta;
- password manager/autocomplete correctos;
- validación y errores accesibles;
- confirmación clara.

No inventes pricing. Si no existe una decisión comercial, crea una sección de acceso sin precios ficticios y documenta la decisión pendiente.

FASE 8 — DISEÑO

Preserva el carácter editorial oscuro, pero construye un sistema único:

- una sola marca y lockup;
- una escala tipográfica;
- grid de 12 columnas desktop;
- ancho de lectura controlado;
- spacing tokens;
- radios, bordes y elevación consistentes;
- colores semánticos para éxito, advertencia, error, datos incompletos y demo;
- serif sólo para narrativa/títulos;
- sans para producto y datos;
- mono para timestamps, tickers y metadata, nunca para párrafos largos;
- cuerpo mínimo 16 px;
- labels mínimos 12–13 px si el contraste y tracking lo permiten;
- targets táctiles de al menos 44×44 px;
- foco visible;
- skeletons discretos;
- animación reducida con `prefers-reduced-motion`.

No hagas un dashboard genérico. La interfaz debe sentirse como una mezcla de research notebook, terminal de decisión y publicación financiera premium.

FASE 9 — I18N, ACCESIBILIDAD, SEO Y RENDIMIENTO

I18N:
- español e inglés completos;
- cero strings hardcodeadas fuera del sistema;
- sin flash de idioma incorrecto;
- `lang`, metadata, fechas, números y currency consistentes;
- preferencia persistente;
- rutas y query params preservados al cambiar idioma.

Accesibilidad:
- WCAG 2.2 AA como objetivo;
- un h1 por página;
- landmarks;
- labels;
- teclado;
- foco;
- live regions para estados asíncronos;
- error recovery;
- contraste;
- zoom 200%;
- reflow 320 CSS px;
- tablas responsivas;
- charts con resumen textual.

SEO:
- title y description únicos;
- canonical correcto;
- `hreflang`;
- Open Graph;
- sitemap;
- robots;
- structured data sólo cuando corresponda;
- no usar "institutional terminal" si el producto aún no cumple ese nivel de flujo, seguridad y soporte.

Rendimiento:
- medir Lighthouse;
- optimizar LCP/CLS/INP;
- evitar fondos pesados en mobile;
- no bloquear contenido útil con animaciones;
- eliminar espacios vacíos y secciones lazy que no se renderizan al capturar/scroll.

FASE 10 — ESTADOS Y ERRORES

Cada operación asíncrona debe tener:
- idle;
- validación;
- loading con progreso honesto;
- success;
- partial success;
- no publicable/insufficient evidence;
- empty;
- timeout;
- rate limit;
- provider unavailable;
- auth required;
- retry.

Nunca dejes un botón deshabilitado indefinidamente. Después de un timeout, restaura controles y conserva el input.

TESTS OBLIGATORIOS

Añade o actualiza:

1. unit tests para transformaciones, scores y estados;
2. integration tests para APIs y fallbacks;
3. E2E para:
   - home → análisis rápido exitoso;
   - ticker inválido;
   - timeout/provider failure;
   - home → FactorLab → empresa → AURORA;
   - demo de Stress;
   - signup/signin;
   - portfolio vacío;
   - cambio ES/EN sin contenido mixto;
   - keyboard-only;
   - mobile 390×844;
   - desktop 1440×900;
4. visual regression de home, AURORA, FactorLab, portfolio, Stress y auth;
5. axe/accessibility checks;
6. verificación de enlaces y redirects;
7. tests que garanticen que toda cifra financiera visible tenga fecha/estado de frescura.

CRITERIOS DE ACEPTACIÓN

El trabajo no está terminado hasta que:

- un usuario nuevo entiende en cinco segundos qué hace BLS Prime;
- existe una sola marca, navegación y sistema visual;
- no hay mezcla ES/EN;
- no hay dos h1 en una página;
- ningún CTA promete una demo y entrega sólo un registro;
- Breakpoint no puede quedar cargando indefinidamente;
- toda cifra financiera muestra fecha, fuente o un estado explícito de falta de datos;
- AURORA prioriza decisión y brechas antes que auditoría;
- FactorLab muestra ranking y frescura sin ambigüedad;
- los nombres descubiertos pueden convertirse en research items;
- Stress tiene demo pública o CTA honesto;
- la experiencia funciona en mobile, tablet y desktop;
- teclado y foco funcionan;
- no hay errores de consola propios;
- todos los tests relevantes pasan;
- se entrega una lista de cambios, decisiones, deuda pendiente y capturas before/after.

FORMA DE TRABAJO

- Trabaja en etapas pequeñas y verificables.
- Conserva integraciones y datos existentes.
- No uses placeholders que parezcan reales.
- No inventes testimonios, AUM, clientes, retornos ni claims de precisión.
- No despliegues a producción sin autorización explícita.
- Si una decisión estética compite con claridad, confianza o funcionamiento, prioriza claridad, confianza y funcionamiento.
- Al finalizar, abre el build local y recorre todos los flujos como usuario nuevo y como usuario autenticado.

ENTREGABLES

1. Auditoría técnica y de producto del repositorio.
2. Arquitectura de información final.
3. Sistema de diseño/tokens.
4. Implementación responsive.
5. Corrección de funciones rotas.
6. Tests y resultados.
7. Matriz de rutas y estados.
8. Capturas comparativas before/after.
9. README de arquitectura, datos, i18n y despliegue.
10. Backlog P0/P1/P2 de lo que no pudo completarse y por qué.
```

## Secuencia de ejecución recomendada

> Nota: esta lista de 8 pasos es **distinta** de las 10 FASES del prompt anterior.
> Las fases describen *qué construir*; esta secuencia describe *en qué orden*.

1. **P0 funcional:** Breakpoint, fechas/fuentes, idioma, CTAs honestos, privacidad.
2. **Shell unificado:** logo, navegación, tokens, layouts y estados.
3. **Portada:** una sola promesa, una demo funcional y un workflow.
4. **Ficha unificada:** transformar AURORA en la superficie central de decisión.
5. **FactorLab y research queue:** convertir descubrimientos en trabajo persistente.
6. **Portfolio/Stress:** demo pública y experiencia autenticada.
7. **Monitor y decision journal:** cerrar el ciclo de aprendizaje.
8. **QA completa:** mobile, accesibilidad, SEO, rendimiento y regresión visual.

## Límite de esta auditoría

La revisión se realizó sobre el sitio público en un viewport desktop y sin crear una cuenta nueva. Se probaron el análisis rápido, AURORA, filtros de FactorLab, descubrimiento público de Portfolio Intelligence, la barrera de Stress Engine y el formulario de registro. No se verificó la experiencia autenticada completa, la persistencia de cartera ni una vista móvil real; deben comprobarse en la implementación.
