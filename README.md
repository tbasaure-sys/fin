# BLS Prime

**Un espacio de decisión de inversión para pasar de una empresa interesante a una tesis defendible.**

[Abrir BLS Prime](https://www.blsprime.com) · [Producto](https://www.blsprime.com/product?lang=es) · [Metodología](https://www.blsprime.com/methodology?lang=es)

BLS Prime conecta descubrimiento, precio, valoración y riesgo de cartera en un solo flujo. No intenta reemplazar el juicio del usuario ni producir una señal de compra o venta: organiza la evidencia necesaria para decidir si una oportunidad merece capital, más investigación o simplemente pasar.

## Qué ofrece

### 1. FactorLab — descubrir empresas

Prioriza acciones usando datos de mercado, estados financieros presentados y filtros de investigación visibles. Cada candidato conserva la razón por la que apareció y los controles que podría no superar.

### 2. Breakpoint — entender qué exige el precio

Parte del precio actual y muestra qué crecimiento, rentabilidad y ejecución tendría que sostener una empresa para justificarlo. La primera lectura pública no requiere una cuenta.

### 3. AURORA — estimar valor razonable

Construye un rango aproximado de valor por acción, identifica el método usado y explica por qué el intervalo tiene esa amplitud. La confianza cambia con la calidad y actualidad de la evidencia; una cobertura más débil produce un rango más prudente, no una precisión falsa.

Las cifras se calculan de forma determinista. El modelo abierto alojado mediante Hugging Face sólo clasifica y explica resultados ya calculados: no modifica el precio, el rango ni los supuestos y no inventa datos. Si el proveedor no está disponible, la explicación determinista sigue funcionando.

### 4. Stress Engine — medir el efecto en cartera

Evalúa concentración, contribución al downside y escenarios adversos condicionados por régimen para mostrar qué posiciones explican el riesgo potencial de una cartera.

## Principios del producto

- **Fecha y fuente visibles.** Las cifras importantes conservan su procedencia y fecha de referencia.
- **Supuestos discutibles.** Los rangos y escenarios muestran qué condiciones los producen.
- **Separación entre cálculo y lenguaje.** Los motores numéricos no dependen de un LLM.
- **Incertidumbre explícita.** La amplitud del rango y su confianza reflejan la evidencia disponible.
- **Sin recomendaciones automáticas.** BLS Prime es software de investigación, no asesoría financiera ni ejecución de operaciones.

## Flujo de una lectura

```text
FactorLab              Breakpoint                AURORA                  Stress Engine
descubrir       ->     entender el precio  ->   valorar y explicar  ->  medir en cartera
candidatos             expectativas implícitas   rango + impulsores      downside + concentración
```

## Arquitectura

- **Aplicación:** Next.js 14 y React 18.
- **Despliegue web:** Vercel.
- **Persistencia:** Neon/Postgres para usuarios, sesiones, workspaces y lecturas durables.
- **Datos financieros:** backend canónico, SEC EDGAR y Financial Modeling Prep, según cobertura.
- **Valoración:** cálculos deterministas, controles de precio, método, evidencia y auditoría.
- **Explicación de valoración:** Hugging Face Inference Providers con fallback local determinista.
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
