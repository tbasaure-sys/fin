# BLS Prime

**Entiende la caja de una empresa, contrasta tu tesis y conecta sus supuestos con tu cartera.**

[Abrir BLS Prime](https://www.blsprime.com) · [Ver un ejemplo real sin cuenta](https://www.blsprime.com/example?lang=es) · [Investigar](https://www.blsprime.com/research?lang=es) · [Metodología](https://www.blsprime.com/methodology?lang=es)

BLS Prime organiza evidencia, preguntas y escenarios; no recomienda compras, ejecuta órdenes ni demuestra alpha. Empieza por el ejemplo histórico de Microsoft, con fuente y cálculos visibles, sin cuenta ni llamadas a un modelo. Para trabajar con documentos actuales, guardar investigación o conectar posiciones se requiere autenticación.

## Qué ofrece

### 1. Leer antes de escribir

Introduce un ticker en Investigación. Documentos y lectura es la primera vista. El informe asistido se solicita explícitamente; citas y revisión automática no certifican que sus interpretaciones sean correctas.

### 2. Contrastar una tesis

Conserva hipótesis, contraargumentos, evidencia y próximas comprobaciones. Las revisiones privadas son inmutables y pueden compararse. Una hipótesis no resuelta no se presenta como un hecho verificado.

### 3. Explorar cifras y exposición

Desde Mi tesis → Valoración y cartera puedes preparar un expediente inicial sin redactar una tesis. Carga fundamentos documentales, revisa supuestos y observa escenarios y sensibilidad. El valor por acción exige conciliar deuda, obligaciones, caja y acciones; no se rellenan desconocidos con cero.

El impacto en cartera es una simulación de una posición, no riesgo conjunto ni retorno esperado. Los cálculos se guardan con sus inputs y versión. AURORA sigue disponible como exploración pública separada; no sustituye el expediente privado.

### 4. Medir sin inventar historial

Los rendimientos registrados conservan pérdidas totales y no recortan extremos. Flujos dentro de un intervalo utilizan Modified Dietz, identificado como aproximación; ausencia de tiempo/cobertura bloquea el acumulado. El histórico hipotético de posiciones actuales permanece separado de la trayectoria personal. G820, FactorLab y Stress conservan sus rutas de exploración.

## Principios del producto

- **Fecha y fuente visibles.** Las cifras importantes conservan su procedencia y fecha de referencia.
- **Supuestos discutibles.** Los rangos y escenarios muestran qué condiciones los producen.
- **Separación entre cálculo y lenguaje.** Los motores numéricos no dependen de un LLM.
- **Incertidumbre explícita.** La amplitud del rango y su confianza reflejan la evidencia disponible.
- **Sin recomendaciones automáticas.** BLS Prime es software de investigación, no asesoría financiera ni ejecución de operaciones.

## Flujo de una lectura

```text
Ejemplo público → Documentos → Tesis privada → Valoración condicional → Exposición
```

## Arquitectura

- **Aplicación:** Next.js 14 y React 18.
- **Despliegue web:** Vercel.
- **Persistencia:** Neon/Postgres para usuarios, sesiones, workspaces y lecturas durables.
- **Datos financieros:** backend canónico, SEC EDGAR y Financial Modeling Prep, según cobertura.
- **Valoración:** cálculos deterministas, controles de precio, método, evidencia y auditoría.
- **Interpretación:** servicio externo configurable; no modifica los cálculos deterministas de la tesis.
- **Idiomas:** español e inglés, con preferencia persistida en el navegador.

## Desarrollo local

Requisitos:

- Node.js 24
- npm

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

## Verificación y medición

- `npm run test:web`: contratos, contabilidad adversarial y aislamiento.
- `npm run build`: build de producción.
- `BLS_E2E_BASE_URL` selecciona el entorno de pruebas; `BLS_E2E_BROWSER_CHANNEL=msedge` permite usar Edge instalado sin descargar otro navegador.
- `tests-e2e/product-entry.spec.mjs` verifica ejemplo sin cuenta, cálculos, consentimiento y navegación. `prepare-capital.spec.mjs` verifica preparación sin redactar hipótesis; requiere contexto autenticado de pruebas.
- `node scripts/product-metrics.mjs`, con `DATABASE_URL` provista de forma segura, devuelve agregados de los últimos 30 días. Sólo incluye navegadores que aceptaron medición; no representa todos los visitantes ni usuarios humanos certificados. No exporta identificadores ni contenido financiero.
- No se copió código ni se implementó todavía un importador de Portfolio Performance. La integración de archivos sigue separada de estas correcciones.

### Variables principales

Nunca agregues secretos al repositorio. Usa `.env.local` en desarrollo y variables cifradas en Vercel.

| Variable | Uso |
| --- | --- |
| `FMP_API_KEY` | Cotizaciones, estados y enriquecimiento de mercado |
| `SEC_USER_AGENT` | Acceso identificado a SEC EDGAR |
| `BLS_PRIME_BACKEND_URL` | Backend canónico de investigación |
| `DATABASE_URL` | Persistencia Neon/Postgres |
| `BLS_PRIME_STORAGE_BACKEND` | `auto` o `neon` |
| `BLS_PRIME_AUTH_SECRET` | Firma de sesiones privadas |
| `BLS_PRIME_BREAKPOINT_FORK_SECRET` | Firma de variaciones de lecturas públicas |
| `HUGGINGFACE_API_KEY` | Explicación abierta de los rangos de valoración |
| `HUGGINGFACE_VALUATION_MODEL` | Modelo de explicación; por defecto `Qwen/Qwen2.5-7B-Instruct:fastest` |

La lista completa y sus valores seguros de ejemplo están en [`.env.example`](./.env.example).

### Base de datos

Con `DATABASE_URL` configurada:

```powershell
npm run db:neon:apply
```

### Verificación

```powershell
npm run test:web
npm run build
npm run test:e2e
```

## Rutas principales

| Ruta | Función |
| --- | --- |
| `/` | Primera lectura pública y flujo completo del producto |
| `/factorlab` | Descubrimiento de empresas |
| `/aurora` | Investigación y valoración por empresa |
| `/stress` | Riesgo de cartera |
| `/app` | Workspace privado |
| `/methodology` | Principios de evidencia y cálculo |
| `/privacy` | Contrato de privacidad |
| `/terms` | Términos y alcance |

## Estado

BLS Prime está en desarrollo activo y disponible en producción. Los módulos experimentales permanecen separados de la lógica pública hasta superar sus pruebas y controles de evidencia.

---

Software de investigación. No es asesoría financiera.
