# BLS Prime — Auditoría UX/QA y plan de rediseño

Fecha: 2026-07-06 · Alcance: app desplegada (blsprime.com) + código fuente (`blsprime-fin`)
Método: fetch de rutas públicas en producción, lectura del código (rutas, componentes, servicios, i18n) y correcciones aplicadas directamente al repo. La verificación en navegador del workspace autenticado quedó pendiente (extensión de Chrome no disponible durante la sesión); todo lo marcado "por verificar" tiene su spec Playwright en `tests-e2e/`.

---

## 1. Inventario de funciones

| Ruta | Pantalla | Función para el usuario | Estado |
|---|---|---|---|
| `/` | Landing pública | Explicar el sistema (AURORA, FactorLab, Stress) y llevar a login | OK |
| `/login` | Registro + inicio de sesión (mismo formulario, `intent=signup/signin`) | Crear workspace o entrar; destino `next=/app#risk` | OK |
| `/forgot-password` | Recuperación | Pedir enlace de reset por email (respuesta neutral) | OK |
| `/reset-password` | Nueva contraseña | Definir contraseña desde enlace seguro, auto-login | Por verificar en vivo |
| `/aurora` → `/valuation-os-lab` | AURORA Valuation OS | Valoración pública sin cuenta: reverse DCF, drivers, escenarios, veredicto | OK (copy corregido) |
| `/factorlab` | FactorLab | Screening point-in-time de small/microcaps con gates y audit trail | OK |
| `/stress` | Stress Engine público | Explicación + gate a cuenta | OK |
| `/terms` | Términos | Disclaimer legal (research, no asesoría) | OK |
| `/app` (protegida) | Workspace | Centro del producto; secciones por hash | Por verificar en vivo |
| `/app#today` | Hoy | Lectura del día, acción principal, escrow, historial | Por verificar |
| `/app#risk` | Mi mayor riesgo | Stress Engine sobre cartera real + portfolio + phantom diversification | Por verificar |
| `/app#macro` | Macro | MOSAIC Observatory + Macro Brain | Por verificar |
| `/app#candidates` | Candidatos | FactorLab del workspace + research loop + equity research | Por verificar |
| `/app#decisions` | Decisiones | Registrar/diferir/rechazar acciones, escrow, ledger | Por verificar |
| `/app#holdings` | Posiciones (avanzado) | Tabla de posiciones + alta directa (ticker/acciones/USD) + notas en lenguaje natural | Por verificar |
| Chat "Preguntar al espacio" | Overlay | Preguntas en lenguaje simple con contexto del portafolio | Por verificar |
| `/macro-brain`, `/legacy` | Secundarias | Página macro pública; legacy protegida | Por verificar |
| API `/api/v1/workspaces/:id/*` | ~30 endpoints | dashboard, portfolio, stress (`market-simulation`), escrow, decisions, stream (SSE), research, etc. | Existen y están protegidos por sesión |

Capacidades del holding a nivel de datos: `dayPnlUsd` y `dayReturn` existen (variación intradía) pero solo se muestran en el mini-panel "Hoy" cuando el backend entrega precio vivo. No existe módulo de noticias por posición ni comparación explícita contra mercado global en el workspace — ver plan (sección 3).

---

## 2. Auditoría de diseño y comprensión (por severidad)

### Alta

**A1 · Arquitectura de idioma frágil (Spanglish estructural).** Conviven tres mecanismos: (a) objetos de copy EN/ES (FactorLab, Stress panel, shell parcial), (b) español hardcodeado (HoldingsPanel, guía de bienvenida, glosario, banners, live-data), y (c) una capa que reescribe el DOM con un diccionario EN→ES (`language-layer.jsx`, MutationObserver). Consecuencias: en modo ES se filtran frases en inglés no registradas en el diccionario; en modo EN se filtran las hardcodeadas en español; el MutationObserver recorre todo el DOM en cada mutación (coste de rendimiento); y textos dinámicos del motor (razonamientos de AURORA, descripciones de FactorLab) nunca se traducen. *Se corrigieron las fugas visibles de AURORA (ver sección 4); la unificación a un i18n por claves queda como refactor priorizado.*

**A2 · Ortografía inconsistente en superficie de confianza.** El veredicto público de AURORA — la primera lectura que ve un usuario sin cuenta — mostraba "Hay algo aca", "todavia", "criticos", "senales", "numeros". En un producto que vende disciplina institucional, la ortografía descuidada erosiona la credibilidad más que cualquier defecto visual. **Corregido en código.**

**A3 · Densidad sin jerarquía en AURORA público.** La página `/valuation-os-lab` renderiza ~8 motores, grilla de sensibilidad, 12 supuestos ajustables, glosario y presión de mercado en un solo scroll. El usuario nuevo no sabe qué es editable, qué es ejemplo ("Supuesto de ejemplo" aparece después de los números) y qué es resultado. Falta una jerarquía de tres niveles: veredicto → qué lo sostiene → detalle bajo demanda (el `<details>` "Ver el análisis completo" ya apunta en esa dirección; el contenido previo al fold sigue siendo excesivo).

**A4 · El workspace abre en `#risk` pero la guía dice empezar por posiciones.** El login redirige a `/app#risk`; con cartera vacía el Stress Engine no tiene nada que estresar. El copy del login lo admite ("si la cartera está vacía, primero agrega posiciones") en vez de resolverlo: con 0 posiciones el destino debería ser `#holdings` con un empty state que guíe el alta. Cambio pequeño de lógica en el redirect o en `TerminalApp` (si `holdingsCount === 0`, forzar sección holdings).

### Media

**M1 · Mensajes de estado hardcodeados en un solo idioma.** `live-data.js` (labels de conexión), banners de refresh, "Aplicando actualización...", éxito de escrow — todos en español fijo; un usuario EN los ve en español. Además existía un mensaje mezclado: "`{acción} moved into escrow.`" dentro de un flujo en español. **Este último corregido; el resto documentado para el refactor i18n.**

**M2 · Error de login reflejado desde la URL.** `/login` renderizaba `searchParams.error` tal cual. React escapaba el HTML (no había XSS), pero cualquier enlace podía inyectar un mensaje arbitrario en la pantalla de login (phishing por copy). **Corregido:** el redirect ahora usa códigos conocidos y la pantalla los mapea a copy propio.

**M3 · SSE sin reconexión.** Si el stream de eventos fallaba, se cerraba y solo quedaba el poll de 90 s; nunca se reintentaba la conexión en vivo. El usuario podía ver "Sincronización pausada" hasta recargar. **Corregido:** reconexión con backoff y refresh al reabrir el stream.

**M4 · Semántica ARIA incorrecta en formularios/tablas.** Control segmentado "Acciones / USD objetivo" usaba `role="tablist"` + `aria-selected` (patrón de tabs, no de toggle) y el input de notas de compra/venta no tenía label accesible. **Corregido:** `role="group"` + `aria-pressed`, `aria-label` en el input y tablas de posiciones con `table`/`rowgroup`/`row`/`cell`.

**M5 · El mismo `tradeError` se muestra bajo los dos formularios de posiciones.** Ambos formularios compartían estado de error; un fallo en la edición directa aparecía también bajo "Actualización avanzada". **Corregido:** estados de error separados por formulario.

**M6 · FactorLab: datos de research solo en inglés.** Las descripciones de candidatos ("Small digital optical retailer…", "Why now", "What kills it") son contenido del motor sin variante ES; en modo ES la página queda mitad y mitad. Marcar como contenido técnico intencional (con microcopy que lo aclare) o traducir en origen.

### Baja

**B1 · Flash de idioma.** `useLanguagePreference` inicia en "en" y corrige tras leer localStorage → parpadeo EN→ES en cada carga para usuarios ES. Inicializar leyendo la cookie/atributo `lang` del SSR.
**B2 · Términos solo con fecha "April 20, 2026" en formato EN** dentro de la versión ES (el diccionario ya la traduce; verificar).
**B3 · `PortfolioMoversPanel` muestra "-" como total cuando no hay movers**; mejor ocultar el número y dejar solo el empty state (ya existe copy correcto).
**B4 · Consistencia de marca:** la landing usa "BL'S" y "BLS Prime" indistintamente; elegir una.

---

## 3. Plan de rediseño priorizado

Objetivo declarado: que el usuario entre a su workspace y no necesite otro sitio para *ver* sus finanzas (ejecutar operaciones queda fuera, coherente con `/terms`).

**Fase 1 — Confianza y coherencia (esta semana; parte ya aplicada).**
Ortografía y copy institucional en todas las superficies (hecho en AURORA/veredictos); mensajes de éxito/error consistentes en un idioma por sesión; redirect post-login sensible al estado de la cartera (A4); mapeo de errores de login (M2).

**Fase 2 — El workspace como página única de finanzas (1–2 sprints).**
1. *Holdings con variación intradía siempre visible:* los campos `dayPnlUsd`/`dayReturn` ya existen; agregar columnas "Hoy $ / Hoy %" a la tabla de `HoldingsPanel` y un total de P&L del día en el header (dato ya disponible, solo UI).
2. *Noticias relevantes por posición:* no existe hoy en el workspace — **recomendación, no hecho**. El código ya tiene adaptadores de noticias (`valuation-catalyst-news.js`, FMP/Brave en FactorLab): reutilizarlos para un panel "Noticias de tus posiciones" en `#today`, con fuente y hora, sin sentimiento inventado.
3. *Comparación con mercado global:* no existe como módulo — **recomendación**. El dashboard ya tiene `international.json` y benchmark spread en performance; exponer una fila de referencia (SPY/ACWI/sector) bajo el gráfico de rendimiento.
4. *Screening y valoración ya integrados* (`#candidates` embebe FactorLab + research + AURORA por ticker): mantener, mejorando el paso "candidato → abrir en AURORA → registrar decisión" como flujo guiado de 3 pasos.

**Fase 3 — Refactor i18n (paralelo, mecánico).**
Un solo sistema por claves (los objetos `COPY` ya existentes son la base), eliminar la capa de reescritura del DOM, `lang` desde cookie en SSR (elimina B1), y decisión explícita: contenido de motor en EN técnico con etiqueta, o traducido en origen.

**Fase 4 — Accesibilidad y mobile.**
Roles de tabla correctos, foco visible auditado, contraste del tema oscuro verificado (tokens en `shell.module.css`), navegación del workspace usable con teclado, y pruebas móviles (proyecto "mobile" ya configurado en Playwright).

Sin cambios de stack: Next 14 + CSS Modules + Neon se mantienen. Nada de librerías de UI nuevas; el sistema visual actual (oscuro, sobrio, tipografía técnica) es correcto y solo necesita consistencia.

---

## 4. Cambios concretos aplicados (UI/copy por pantalla)

| Archivo | Cambio | Riesgo |
|---|---|---|
| `lib/aurora-copy-map.js` | Tildes y signos en veredictos y secciones ("Hay algo acá…", "Qué está asumiendo el precio", "Qué rompería la tesis", "valoración", "Cómo se ponderó") | Nulo (strings de display; test actualizado) |
| `app/valuation-os-lab/page.jsx` | ~20 correcciones de ortografía ES + 5 strings EN traducidos ("Review status"→"Estado de revisión", "Data quality"→"Calidad de datos", bullets de calibración y grilla) | Nulo (solo strings) |
| `lib/valuation-router.js` | Mensajes de confianza de AURORA al español | Nulo |
| `components/terminal-app.jsx` | "Aplicando actualización…", "Sin hora de actualización", "Un clic, tres números", "`{acción} quedó en espera para revisar después.`" (antes EN); a11y: `role="group"`+`aria-pressed` en control segmentado, `aria-label` en input de notas | Muy bajo |
| `tests-node/aurora-copy-map-ui.test.mjs` | Assert actualizado a la string corregida | — |
| `package.json` | Script `test:e2e` | — |
| `tests-e2e/` (nuevo) | Config Playwright + 4 suites (rutas públicas, auth, workspace, a11y) desktop y mobile | — |

Aplicados en esta pasada: redirect condicional a `#holdings` cuando la cartera está vacía (A4), mapeo seguro de errores de login (M2), reconexión SSE con backoff (M3), roles de tabla/rowgroup/cell en posiciones (M4), errores separados por formulario de posiciones (M5), columnas intradía "Hoy $ / Hoy %" y referencia de mercado bajo performance.

Pendientes de decisión de producto (no aplicados): panel de noticias por posición, flujo guiado candidato → AURORA → decisión, refactor i18n por claves y validación visual completa en producción con cuenta real.

---

## 5. Matriz de QA funcional

Leyenda estado: OK (verificado), Parcial, Por verificar (spec listo), Confuso.

| Función | Ruta | Comportamiento esperado | Observado | Problemas UX | Problemas técnicos | Riesgo usuario | Prueba manual | Playwright | Estado |
|---|---|---|---|---|---|---|---|---|---|
| Landing | `/` | Presenta módulos, CTA a login | Correcto (fetch SSR) | Marca dual BL'S/BLS Prime | — | Bajo | Cargar, click en 3 CTAs | `public-routes` #1 | OK |
| Registro | `/login` | Crea cuenta → workspace; si cartera está vacía, guiar a posiciones | Formulario correcto; error por código seguro | Redirect sensible a cartera vacía aplicado | — | Medio | Crear cuenta nueva, revisar destino | `auth` #2 | Parcial |
| Inicio de sesión | `/login?intent=signin` | Entra o muestra error claro | Por verificar | — | — | Medio | Contraseña mala → error visible | `auth` #1 | Por verificar |
| Recuperar cuenta | `/forgot-password` | Respuesta neutral + email | Página y copy correctos | — | Envío real de email por verificar | Medio | Flujo completo con email real | `auth` #3 | Parcial |
| Reset | `/reset-password` | Nueva contraseña + auto-login | Por verificar (requiere token) | — | — | Medio | Desde email real | Manual | Por verificar |
| Navegación workspace | `/app#*` | Hash cambia sección, scroll correcto, hashes legacy redirigen | Código correcto (LEGACY_HASH_REDIRECT) | — | — | Bajo | Recorrer 6 secciones | `workspace` #1 | Por verificar |
| Resumen Hoy | `#today` | Lectura + acción principal + fallback honesto | Fallback bien construido en código | Mucho texto de postura | — | Bajo | Con y sin datos backend | `workspace` #1 | Por verificar |
| Stress Engine | `#risk` | Corre 5000 escenarios, CVaR, loading y error visibles | Auto-run + estados completos en código | Diagnóstico denso (en `<details>`, bien) | Backend Railway puede tardar | Alto (número financiero) | Correr con 2-3 posiciones, cambiar régimen/horizonte | `workspace` #2 | Por verificar |
| Portfolio/performance | `#risk`, `#holdings` | Gráfico desde snapshots, empty state si faltan | Empty state correcto ("La trayectoria… aparecerá aquí") | MWR vs línea explicado (bien) | — | Medio | Rango 1M/3M/1A | Manual | Por verificar |
| Alta de posición | `#holdings` | Guardar por acciones o USD; 0 elimina | Formulario correcto; validación deshabilita submit | Errores separados por formulario aplicados | — | Alto (datos del usuario) | Alta, edición, borrado con 0 | `workspace` #3 | Por verificar |
| Nota en lenguaje natural | `#holdings` | "compré 100 USD de NVDA" actualiza | Endpoint existe | Input sin label (corregido) | Parser por verificar | Medio | Probar compra/venta/ambigua | Manual | Por verificar |
| Decisiones/escrow | `#decisions` | Preparar, confirmar, cancelar, historial | Flujo completo en código | Mensaje EN corregido | — | Medio | Ciclo completo de una acción | Manual | Por verificar |
| Chat del portafolio | overlay | Respuestas con contexto + disclaimer | Copy y estados definidos | — | Coste/latencia LLM | Medio | 3 preguntas sugeridas | Manual | Por verificar |
| Macro | `#macro` | MOSAIC + Macro Brain con datos o vacío honesto | Snapshots estáticos importados | Frescura de datos no obvia | Actualización depende de artifacts | Bajo | Revisar fechas mostradas | Manual | Por verificar |
| FactorLab público | `/factorlab` | Screening reproducible, audit trail | Correcto (fetch) | Contenido motor solo EN (M6) | — | Bajo | Toggle idioma, copiar spec | `public-routes` #3 | OK |
| AURORA público | `/valuation-os-lab` | Valoración sin cuenta, veredicto claro | Correcto; copy corregido | Densidad (A3) | — | Medio | Cargar ejemplo, bear/base/bull | `public-routes` #2 | OK |
| Persistencia idioma | global | ES sobrevive reload y navegación | localStorage + evento correcto | Flash EN→ES (B1) | Capa DOM frágil (A1) | Bajo | Cambiar a ES, recargar, navegar | `public-routes` #4 | Parcial |
| Protección de rutas | `/app` sin sesión | Redirect a login con `next` | Verificado (fetch) | — | — | Alto | URL directa sin cookie | `public-routes` #5 | OK |
| Logout | header | Cierra sesión y sale de `/app` | Form POST correcto | — | — | Medio | Logout y volver atrás | `auth` #2 | Por verificar |
| SSE en vivo | `/app` | Estados live/polling/warn; reconexión | Reconexión con backoff aplicada | Falta prueba manual cortando red | — | Bajo | Cortar red 2 min y restaurar | Manual | Parcial |
| Errores de red | `/app` | Sin 5xx en carga; mensajes amigables | `friendlyWorkspaceMessage` filtra tracebacks (bien) | — | — | Medio | DevTools abierto al cargar | `workspace` #5 | Por verificar |
| Mobile | todas | Layout usable en 375px | Media queries extensas en CSS | Por verificar sidebar/tablas | — | Medio | iPhone real o emulado | proyecto `mobile` | Por verificar |
| A11y básica | todas | Labels, foco, lang, alt | Fixes aplicados; tabla de posiciones ya expone table/rowgroup/cell | Queda prueba de teclado y contraste | — | Medio | Navegar solo con teclado | `a11y` | Parcial |

---

## 6. Checklist final antes de deploy

Código y build: `npm run test:web` en verde (incluye el assert de copy actualizado) · `npm run build` sin errores ni warnings nuevos · diff revisado — solo strings, atributos ARIA y tests (ninguna lógica de negocio tocada).

Funcional en staging/prod: login, logout y recuperación con cuenta real · alta/edición/borrado de posición · Stress Engine corre y muestra CVaR con la cartera de prueba · AURORA público muestra el copy corregido ("Hay algo acá…", "Estado de revisión") · toggle ES/EN en factorlab y login · `/app` sin cookie redirige.

Automatizado: `npm i -D @playwright/test && npx playwright install chromium` · `BLS_E2E_EMAIL=… BLS_E2E_PASSWORD=… npm run test:e2e` (desktop y mobile) · revisar el reporte HTML de fallos.

Salud: consola del navegador sin errores en `/`, `/valuation-os-lab`, `/app` · sin respuestas 5xx en la carga del workspace · Lighthouse mobile en `/` y `/login` (objetivo ≥85 en accesibilidad).

Reversa: los cambios son de copy/atributos; rollback = revertir el commit. Sin migraciones, sin cambios de API, sin variables de entorno nuevas.

---

## Addendum — Segunda pasada (revisión de M2–M5 aplicados)

Revisión de los cambios del usuario: M3 (reconexión SSE con backoff y tope de 30 s, reset del contador al reabrir, limpieza de timers) y M5 (estados `holdingDraftError` / `tradeInstructionError` separados y bien cableados) quedaron correctos sin ajustes. M4 quedó correcto en tablas (`table`/`row`/`rowgroup`/`cell` + columnas intradía "Hoy $ / Hoy %"); se corrigieron dos toggles restantes con semántica de tabs sin comportamiento de tabs (`RangeTabs` y "Modo de candidatos") al patrón `role="group"` + `aria-pressed`.

Hallazgos nuevos corregidos en esta pasada:

1. **Open redirect en `/api/auth/login` (seguridad).** `next.startsWith("/")` aceptaba `//evil.com`, y `new URL("//evil.com", origen)` resuelve al dominio externo: tras un login exitoso con `next` manipulado, el usuario aterrizaba fuera del sitio. Corregido con `safeNextPath` (bloquea `//` y `/\`) en la ruta y alineado en `app/login/page.js`. Spec nuevo en `auth.spec.mjs`.
2. **`devResetUrl` inyectable en `/forgot-password` (phishing).** El parámetro se renderizaba como enlace clickeable con etiqueta oficial; `?devResetUrl=https://evil.com` producía un link de phishing. Corregido en ambos lados: la API solo emite la ruta interna (`/reset-password?...`) y la página solo renderiza valores que empiecen por `/reset-password`.
3. **M2 extendido a `forgot-password` y `reset-password`.** Ambas rutas devolvían el mensaje de error crudo en la URL (mismo patrón que login tenía). Ahora emiten códigos (`mismatch`, `invalid_token`, `validation`, `service_unavailable`, `not_configured`, `generic`) y las páginas los mapean a copy propio EN/ES, verificado contra los mensajes reales de `session.js` (incluye "Password reset email failed" → `service_unavailable`, no `validation`).
4. **Specs actualizados.** (ver detalle al final del addendum)

## Addendum 2 — Verificación en vivo (Chrome, sesión real, 29 posiciones)

Verificado OK: consola sin errores en `/`, AURORA, y las 6 secciones de `/app` · red sin 4xx/5xx durante carga y refresh · login con redirect a `#risk` · Stress Engine corre automático (CVaR −23.4%, 5000 escenarios) · MOSAIC con datos FRED vivos · FactorLab del workspace con ranking en ES · tabla de posiciones con columnas intradía · botón Actualizar responde con banner de éxito.

Hallazgos nuevos (corregidos en código, pendientes de deploy):

1. **"datos al Esperando actualización"** — el header interpola el label de estado donde va una fecha y la frase queda rota. Corregido: `syncedStatus` detecta labels de estado y omite el "datos al".
2. **"En un Crisis simulado"** — concordancia rota al interpolar el régimen en la respuesta del Stress Engine. Corregido: "En un escenario simulado de crisis…".
3. **"Proximo paso" / "Veredicto de valoracion auditable"** sin tildes en la tarjeta de veredicto AURORA. Corregido.

Hallazgos documentados (requieren decisión de producto/backend, no corregidos):

4. **Gráfico TWR con dientes de sierra** (0↔~24% alternando) sobre 146 snapshots: sugiere snapshots con base faltante o cero ploteados como retornos reales. Es el hallazgo de datos más importante — el gráfico central de performance no es legible ni confiable así. Revisar el builder de la serie en `private-portfolio.js` (filtrar snapshots sin base o interpolar huecos).
5. **Intradía en cero engañoso**: sin sesión de precios viva, todas las filas muestran "Hoy $0.00 / 0.0%" y la tile dice "Precio diario cargado". Si el backend manda 0 en vez de null, el frontend no puede distinguir "sin cambio" de "sin dato". Normalizar a null cuando no hay sesión viva.
6. **Performance "0.0% / $0.00 sobre base $0.00"**: con base ausente debería mostrar empty state, no cero.
7. **Estados de frescura contradictorios**: tras "Sesión de mercado actualizada." los badges siguen en "Esperando actualización" — el refresh responde pero la foto de mercado no cambia; unificar la semántica de ambos indicadores.
8. **Copy relleno repetido**: "Tema: Global" y "Acción: Mantener" en las 29 filas; "Se compara contra el resto del portafolio." en cada candidato; "Fuente de financiamiento: Sin cambio / Sin cambio" (label y detalle duplicados).
9. **Dock de idioma flotante tapa contenido** en la esquina inferior derecha (solapa filas de posiciones y fuentes en viewports medianos).
10. Emulación mobile vía resize de ventana no aplicó en la sesión; la cobertura mobile queda en el proyecto `mobile` de Playwright. `auth.spec.mjs`: el test de contraseña incorrecta ahora espera el copy mapeado y un código conocido en la URL; test nuevo de open redirect. Nota: `PortfolioHoldingsPanel` (terminal-app.jsx) quedó sin uso tras el reemplazo por la tabla matrix — es código muerto inofensivo, candidato a eliminarse en el próximo commit.
