"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const TEXT_TRANSLATIONS = {
  "Back to home": "Volver al inicio",
  "Back to login": "Volver a iniciar sesiÃ³n",
  "Account access": "Acceso a la cuenta",
  "Your capital OS,": "Tu sistema de capital,",
  "protected by your password.": "protegido por tu contraseÃ±a.",
  "Your capital OS, protected by your password.": "Tu sistema de capital, protegido por tu contraseÃ±a.",
  "Sign in once, then return to the same valuation OS, portfolio, research desk, and decision memory from web or mobile.": "Inicia sesiÃ³n una vez y vuelve a AURORA, tu portafolio, mesa de investigaciÃ³n y memoria de decisiones desde web o mÃ³vil.",
  "Your own credentials": "Tus propias credenciales",
  "Each user gets their own password instead of one shared access code for everyone.": "Cada usuario tiene su propia contraseÃ±a en vez de un cÃ³digo compartido para todos.",
  "One private workspace": "Un espacio de trabajo privado",
  "Your valuation workspace, holdings, research, and staged decisions all come back after login.": "AURORA, tus posiciones, investigaciÃ³n y decisiones preparadas vuelven despuÃ©s de iniciar sesiÃ³n.",
  "Web and mobile ready": "Listo para web y mÃ³vil",
  "The native app uses the same account and the same workspace APIs as the website.": "La app nativa usa la misma cuenta y las mismas APIs del espacio de trabajo que el sitio web.",
  "Your private workspace": "Tu espacio de trabajo privado",
  "Welcome to": "Bienvenido a ",
  "Welcome to BLS Prime": "Bienvenido a BLS Prime",
  "First time here?": "Â¿Primera vez aquÃ­?",
  "Create your account below - it only takes a minute.": "Crea tu cuenta abajo. Toma solo un minuto.",
  "Already have an account?": "Â¿Ya tienes una cuenta?",
  "Sign in with your email and password.": "Inicia sesiÃ³n con tu email y contraseÃ±a.",
  "Your name": "Tu nombre",
  "(only needed for new accounts)": "(solo necesario para cuentas nuevas)",
  "Email address": "Email",
  "Password": "ContraseÃ±a",
  "(8 characters minimum)": "(mÃ­nimo 8 caracteres)",
  "Create my account": "Crear mi cuenta",
  "Creates your private workspace in one step.": "Crea tu espacio de trabajo privado en un solo paso.",
  "or": "o",
  "Sign in": "Iniciar sesiÃ³n",
  "Use the email and password you set before.": "Usa el email y la contraseÃ±a que configuraste antes.",
  "Forgot your password?": "Â¿Olvidaste tu contraseÃ±a?",
  "Password recovery": "RecuperaciÃ³n de contraseÃ±a",
  "Recover access": "Recupera el acceso",
  "to your workspace.": "a tu espacio de trabajo.",
  "Recover access to your workspace.": "Recupera el acceso a tu espacio de trabajo.",
  "Enter your email and we will send you a secure link so you can set a new password without needing support to intervene.": "Ingresa tu email y te enviaremos un enlace seguro para crear una nueva contraseÃ±a sin necesitar soporte.",
  "Reset password": "Restablecer contraseÃ±a",
  "Get your recovery link": "Recibe tu enlace de recuperaciÃ³n",
  "If the email exists, we will create a secure reset link and deliver it.": "Si el email existe, crearemos y enviaremos un enlace seguro de recuperaciÃ³n.",
  "If the account exists, the reset instructions are on the way.": "Si la cuenta existe, las instrucciones de recuperaciÃ³n van en camino.",
  "Send reset link": "Enviar enlace de recuperaciÃ³n",
  "Back to sign in": "Volver a iniciar sesiÃ³n",
  "Choose a new password": "Elige una nueva contraseÃ±a",
  "Set a new password": "Crea una nueva contraseÃ±a",
  "and get back in.": "y vuelve a entrar.",
  "Set a new password and get back in.": "Crea una nueva contraseÃ±a y vuelve a entrar.",
  "This secure link lets you replace the old password and sign back into your workspace right away.": "Este enlace seguro te permite reemplazar la contraseÃ±a anterior y volver a entrar a tu espacio de trabajo.",
  "Create your new password": "Crea tu nueva contraseÃ±a",
  "Use at least 8 characters. After saving it, you will be signed in automatically.": "Usa al menos 8 caracteres. DespuÃ©s de guardarla, entrarÃ¡s automÃ¡ticamente.",
  "New password": "Nueva contraseÃ±a",
  "Confirm password": "Confirmar contraseÃ±a",
  "Save new password": "Guardar nueva contraseÃ±a",
  "Terms of Service": "TÃ©rminos de Servicio",
  "Workspace": "Espacio",
  "Home": "Inicio",
  "Research software, not financial advice.": "Software de investigaciÃ³n, no asesorÃ­a financiera.",
  "These terms explain how": "Estos tÃ©rminos explican cÃ³mo ",
  "should be used. The short version: the product helps you organize information and think more clearly, but you remain responsible for every financial decision.": " debe usarse. La versiÃ³n corta: el producto te ayuda a organizar informaciÃ³n y pensar con mÃ¡s claridad, pero sigues siendo responsable de cada decisiÃ³n financiera.",
  "These terms explain how BLS Prime should be used. The short version: the product helps you organize information and think more clearly, but you remain responsible for every financial decision.": "Estos tÃ©rminos explican cÃ³mo debe usarse BLS Prime. La versiÃ³n corta: el producto te ayuda a organizar informaciÃ³n y pensar con mÃ¡s claridad, pero sigues siendo responsable de cada decisiÃ³n financiera.",
  "Effective date: April 20, 2026": "Fecha de vigencia: 20 de abril de 2026",
  "1. Educational and research use only": "1. Uso solo educativo y de investigaciÃ³n",
  "provides portfolio organization, market context, risk analytics, equity research outputs, and AI-assisted explanations for informational and educational purposes. It is not a registered investment adviser, broker, dealer, tax adviser, or law firm.": " ofrece organizaciÃ³n de portafolio, contexto de mercado, analÃ­tica de riesgo, investigaciÃ³n de acciones y explicaciones asistidas por IA con fines informativos y educativos. No es asesor de inversiones registrado, intermediario financiero, distribuidor de valores, asesor tributario ni firma legal.",
  "BLS Prime provides portfolio organization, market context, risk analytics, equity research outputs, and AI-assisted explanations for informational and educational purposes. It is not a registered investment adviser, broker, dealer, tax adviser, or law firm.": "BLS Prime ofrece organizaciÃ³n de portafolio, contexto de mercado, analÃ­tica de riesgo, investigaciÃ³n de acciones y explicaciones asistidas por IA con fines informativos y educativos. No es asesor de inversiones registrado, intermediario financiero, distribuidor de valores, asesor tributario ni firma legal.",
  "2. No personalized financial advice": "2. Sin asesorÃ­a financiera personalizada",
  "Nothing in the product is financial, investment, tax, accounting, or legal advice. Outputs should not be treated as a recommendation to buy, sell, hold, hedge, rebalance, or otherwise transact in any security or asset. You should make decisions independently or with a qualified professional who understands your full circumstances.": "Nada en el producto constituye asesorÃ­a financiera, de inversiÃ³n, tributaria, contable o legal. Los resultados no deben tratarse como recomendaciÃ³n para comprar, vender, mantener, cubrir, rebalancear o transar ningÃºn valor o activo. Debes decidir de forma independiente o con un profesional calificado que entienda tu situaciÃ³n completa.",
  "3. No trading or execution": "3. Sin operaciones ni ejecuciÃ³n",
  "The workspace does not place trades, route orders, manage money, or execute transactions. Any staged action, memo, valuation, model, alert, or checklist is a research artifact only.": "El espacio de trabajo no realiza operaciones, enruta Ã³rdenes, administra dinero ni ejecuta transacciones. Cualquier acciÃ³n preparada, informe, valoraciÃ³n, modelo, alerta o lista de verificaciÃ³n es solo un artefacto de investigaciÃ³n.",
  "4. Data and model limitations": "4. Limitaciones de datos y modelos",
  "Market data, financial statements, third-party APIs, user-entered holdings, AI outputs, and derived calculations may be delayed, incomplete, stale, wrong, or unavailable. Deterministic calculations can still be wrong if the source data or assumptions are wrong. You should verify important information against primary sources before acting.": "Los datos de mercado, estados financieros, APIs de terceros, posiciones ingresadas por el usuario, resultados de IA y cÃ¡lculos derivados pueden estar retrasados, incompletos, desactualizados, equivocados o no disponibles. Los cÃ¡lculos determinÃ­sticos tambiÃ©n pueden fallar si los datos fuente o supuestos son incorrectos. Verifica la informaciÃ³n importante contra fuentes primarias antes de actuar.",
  "5. AI-assisted analysis": "5. AnÃ¡lisis asistido por IA",
  "AI may summarize, critique, or explain sourced data and deterministic model outputs. AI can make mistakes, omit context, or overstate confidence. Treat AI text as a draft research aid, not an authority.": "La IA puede resumir, criticar o explicar datos con fuente y resultados de modelos determinÃ­sticos. Puede equivocarse, omitir contexto o exagerar confianza. Trata el texto de IA como borrador de apoyo a la investigaciÃ³n, no como autoridad.",
  "6. Your responsibility": "6. Tu responsabilidad",
  "You are responsible for the accuracy of holdings you enter, the assumptions you accept, the professionals you consult, and any decision you make outside the product. Past performance, model output, valuation estimates, and risk scores do not guarantee future results.": "Eres responsable de la precisiÃ³n de las posiciones que ingresas, los supuestos que aceptas, los profesionales que consultas y cualquier decisiÃ³n que tomes fuera del producto. El desempeÃ±o pasado, los modelos, las estimaciones de valoraciÃ³n y los puntajes de riesgo no garantizan resultados futuros.",
  "7. Acceptable use": "7. Uso aceptable",
  "Do not use the workspace to automate trading, manipulate markets, violate laws, reverse engineer protected services, overload third-party data providers, or make decisions for another person without proper permission.": "No uses el espacio de trabajo para automatizar operaciones, manipular mercados, violar leyes, hacer ingenierÃ­a inversa de servicios protegidos, sobrecargar proveedores de datos o tomar decisiones por otra persona sin permiso adecuado.",
  "Today": "Hoy",
  "Start": "Inicio",
  "Brief and action": "Resumen y acciÃ³n",
  "Current brief and immediate move": "Resumen actual y prÃ³ximo movimiento",
  "Start with the live read, the supporting notes, and the move that currently deserves attention.": "Parte por la lectura en vivo, las notas de soporte y el movimiento que hoy merece atenciÃ³n.",
  "Money plan": "Plan de dinero",
  "Fund": "Fondos",
  "Income and investable cash": "Ingreso y caja invertible",
  "Monthly cashflow and investable room": "Flujo mensual y margen invertible",
  "Keep income, fixed costs, variable spending, and the funded contribution in one operating view.": "MantÃ©n ingreso, costos fijos, gasto variable y aporte financiado en una sola vista operativa.",
  "Portfolio": "Portafolio",
  "Read": "Lectura",
  "Path and carriers": "Trayectoria y motores",
  "Performance, weight, and what is carrying the book": "Rendimiento, pesos y quÃ© sostiene el portafolio",
  "Read the portfolio through performance, position weight, and the names doing the real work.": "Lee el portafolio por rendimiento, peso de posiciones y los nombres que realmente lo mueven.",
  "Overlap": "Solapamiento",
  "Audit": "Auditar",
  "Structural breadth": "Amplitud estructural",
  "Real breadth and overlap under stress": "Amplitud real y solapamiento bajo estrÃ©s",
  "Check whether the portfolio still has independent bets once hidden concentration is included.": "Revisa si el portafolio aÃºn tiene apuestas independientes cuando se incluye la concentraciÃ³n oculta.",
  "Research": "InvestigaciÃ³n",
  "Explain": "Explicar",
  "Company brief": "Informe de compaÃ±Ã­a",
  "Company work in a concise research brief": "Trabajo de compaÃ±Ã­a en un informe conciso",
  "Open the current memo, the valuation review, and the sources without leaving the workspace.": "Abre el informe actual, la revisiÃ³n de valoraciÃ³n y las fuentes sin salir del espacio de trabajo.",
  "Holdings": "Posiciones",
  "Update": "Actualizar",
  "Positions and edits": "Posiciones y ediciones",
  "Direct position updates and stored holdings": "Actualizaciones directas y posiciones guardadas",
  "Review what is connected, add positions, and save sizing changes in the same operating surface.": "Revisa lo conectado, agrega posiciones y guarda cambios de tamaÃ±o en la misma superficie.",
  "One decision surface. Open only the layer you need.": "Una sola superficie de decisiÃ³n. Abre solo la capa que necesitas.",
  "Staged": "Preparadas",
  "Ask workspace": "Preguntar al espacio",
  "Glossary": "Glosario",
  "Guide": "GuÃ­a",
  "Terms": "TÃ©rminos",
  "Current answer": "Respuesta actual",
  "Executive answer": "Respuesta ejecutiva",
  "Preserve the reserve sleeve": "Mantener caja aparte",
  "No change is needed here unless a cleaner use for that capital appears.": "No hace falta cambiar nada aquÃ­ salvo que aparezca un uso mÃ¡s claro para ese capital.",
  "No change needed while reserve use is unclear.": "Sin cambios mientras no haya un uso claro para esa caja.",
  "Review decision": "Revisar decisiÃ³n",
  "Open explanation": "Abrir explicaciÃ³n",
  "Check overlap": "Revisar solapamiento",
  "Available": "Disponible",
  "Available to invest this month": "Disponible para invertir este mes",
  "Investable cash": "Caja invertible",
  "After expenses and reserve.": "DespuÃ©s de gastos.",
  "Target coverage": "Cobertura objetivo",
  "Set target": "Definir objetivo",
  "Share of the planned contribution that is funded.": "Parte del aporte planificado que ya estÃ¡ financiada.",
  "Optionality reserve": "Margen flexible",
  "Wait for a cleaner state before spending optionality on new risk.": "Sin cambios hasta que el riesgo sea mÃ¡s claro.",
  "Wait for a cleaner setup before widening risk.": "Sin ampliar riesgo por ahora.",
  "Wait for a cleaner setup": "Sin ampliar riesgo",
  "Preserve current sizing until the setup improves.": "Mantener tamaÃ±o actual.",
  "No funding change": "Sin cambio de financiamiento",
  "Selective posture": "Postura selectiva",
  "Protect capital": "Proteger capital",
  "Portfolio data": "Datos del portafolio",
  "Market snapshot": "Foto de mercado",
  "Current session": "SesiÃ³n actual",
  "Research desk": "Mesa de investigaciÃ³n",
  "Run analysis": "Analizar",
  "One morning page: what moved, what matters next, what gets saved.": "Una pÃ¡gina de maÃ±ana: quÃ© se moviÃ³, quÃ© mirar y quÃ© queda guardado.",
  "Open in workspace": "Abrir en el espacio",
  "See today": "Ver hoy",
  "Today": "Hoy",
  "Log": "Registro",
  "Functions": "Funciones",
  "Only what is active now.": "Solo lo que ya funciona.",
  "Moves": "Movimientos",
  "Ideas": "Ideas",
  "Next data": "PrÃ³ximos datos",
  "Dated log": "Registro con fecha",
  "signals": "seÃ±ales",
  "open": "abierta",
  "watch": "en revisiÃ³n",
  "Running...": "Analizando...",
  "Running": "Analizando",
  "Ready": "Listo",
  "Ready to run": "Listo para analizar",
  "Full desk": "AnÃ¡lisis completo",
  "Quick read": "Lectura rÃ¡pida",
  "Waiting for run": "Esperando anÃ¡lisis",
  "Ready for review": "Listo para revisar",
  "Evidence gaps open": "Hay brechas de evidencia",
  "Partially reviewed": "Revisado parcialmente",
  "No required gaps": "Sin brechas requeridas",
  "Business": "Negocio",
  "No run yet": "Sin anÃ¡lisis aÃºn",
  "Latest revenue": "Ingresos recientes",
  "Base value/share": "Valor base/acciÃ³n",
  "Audit state": "Estado de auditorÃ­a",
  "Evidence coverage": "Cobertura de evidencia",
  "Best supported value": "Valor mejor respaldado",
  "What still needs work": "QuÃ© falta trabajar",
  "Coverage": "Cobertura",
  "Statement source": "Fuente de estados",
  "Prior changes": "Cambios previos",
  "Downloads": "Descargas",
  "Run receipt": "Registro del anÃ¡lisis",
  "Statements": "Estados financieros",
  "Filings": "Presentaciones",
  "Artifacts": "Artefactos",
  "Memo": "Memo",
  "Value": "Valor",
  "Review": "RevisiÃ³n",
  "Sources": "Fuentes",
  "Changes": "Cambios",
  "Portfolio path will appear here": "La trayectoria del portafolio aparecerÃ¡ aquÃ­",
  "Stored snapshots are needed before the app draws a historical path, benchmark spread, and trend direction. Current performance can still be shown from cost basis.": "Se necesitan snapshots guardados antes de dibujar trayectoria histÃ³rica, comparaciÃ³n con benchmark y tendencia. La performance actual sÃ­ puede mostrarse desde el costo base.",
  "Save holding": "Guardar posiciÃ³n",
  "Saving...": "Guardando...",
  "This path updates the final position directly instead of trying to infer a trade note.": "Esta ruta actualiza la posiciÃ³n final directamente, sin intentar inferir una nota de operaciÃ³n.",
  "Advanced update": "ActualizaciÃ³n avanzada",
  "Use plain English for buy and sell notes": "Usa lenguaje simple para notas de compra y venta",
  "Run text update": "Actualizar desde texto",
  "Updating...": "Actualizando...",
  "Reset to connected holdings": "Restablecer posiciones conectadas",
  "Analyze diversification": "Analizar diversificaciÃ³n",
  "Analyzing...": "Analizando...",
  "Check structure": "Revisar estructura",
  "Checking...": "Revisando...",
  "Refresh": "Actualizar",
  "Ask your portfolio": "PregÃºntale a tu portafolio",
  "Close": "Cerrar",
  "You": "TÃº",
  "Ask anything about your portfolio": "Pregunta cualquier cosa sobre tu portafolio",
  "I have full context of your holdings, market state, risk metrics, and alerts. Ask me in plain English - no jargon needed.": "Tengo el contexto de tus posiciones, estado de mercado, mÃ©tricas de riesgo y alertas. Pregunta en lenguaje simple, sin jerga.",
  "Is my portfolio too concentrated right now?": "Â¿Mi portafolio estÃ¡ demasiado concentrado ahora?",
  "What does the current market stance mean for me specifically?": "Â¿QuÃ© significa para mÃ­ la postura actual del mercado?",
  "Which of my positions adds the least real diversification?": "Â¿CuÃ¡l de mis posiciones agrega menos diversificaciÃ³n real?",
  "Should I be worried about what the alerts are flagging?": "Â¿DeberÃ­a preocuparme por lo que marcan las alertas?",
  "What would I need to see before adding more risk to the portfolio?": "Â¿QuÃ© tendrÃ­a que ver antes de agregar mÃ¡s riesgo al portafolio?",
  "What is the clearest reason to wait before adding risk?": "Â¿CuÃ¡l es la razÃ³n mÃ¡s clara para esperar antes de agregar riesgo?",
  "Retry": "Reintentar",
  "Stop": "Detener",
  "Send": "Enviar",
  "Answers are grounded in your workspace data but are not financial advice. Always verify before acting.": "Las respuestas se basan en los datos de tu espacio de trabajo, pero no son asesorÃ­a financiera. Verifica siempre antes de actuar.",
  "Language": "Idioma",
  "Example": "Ejemplo",
  "What it does": "QuÃ© hace",
  "Record": "Registro",
  "A short morning note for macro ideas.": "Una nota breve para tus ideas macro.",
  "It shows what moved, which ideas need attention, what data matters next, and keeps a record of the call.": "Muestra quÃ© se moviÃ³, quÃ© ideas necesitan atenciÃ³n, quÃ© datos mirar despuÃ©s y guarda el registro.",
  "See the example": "Ver el ejemplo",
  "Research-only. Not financial advice. No trades placed.": "Solo investigaciÃ³n. No es asesorÃ­a financiera. No realiza operaciones.",
  "Example run": "Ejemplo",
  "June 11, 2026": "11 de junio de 2026",
  "Dollar pressure is mixed, copper has not confirmed the bullish case, and the market stress check is calm.": "El dÃ³lar estÃ¡ mixto, el cobre aÃºn no confirma la idea alcista y el chequeo de estrÃ©s estÃ¡ tranquilo.",
  "Signals": "SeÃ±ales",
  "Open": "Abiertas",
  "Watch": "Vigilar",
  "One page. Four checks.": "Una pÃ¡gina. Cuatro chequeos.",
  "What changed": "QuÃ© cambiÃ³",
  "Gold": "Oro",
  "weaker": "mÃ¡s dÃ©bil",
  "Colombia FX": "FX Colombia",
  "less pressure": "menos presiÃ³n",
  "Credit": "CrÃ©dito",
  "better": "mejor",
  "Chile FX": "FX Chile",
  "stronger": "mÃ¡s fuerte",
  "Brazil FX": "FX Brasil",
  "Rates volatility": "Volatilidad de tasas",
  "quieter": "mÃ¡s tranquila",
  "Ideas": "Ideas",
  "Strong dollar versus LatAm FX": "DÃ³lar fuerte contra FX LatAm",
  "Needs watching": "Requiere atenciÃ³n",
  "Brazil still helps the idea, but the broad dollar and Chile FX are pushing back.": "Brasil todavÃ­a ayuda la idea, pero el dÃ³lar amplio y el FX chileno empujan en contra.",
  "Structural floor in copper": "Piso estructural en cobre",
  "Chile FX and the dollar backdrop help, but copper itself has not joined in yet.": "El FX chileno y el dÃ³lar ayudan, pero el cobre todavÃ­a no acompaÃ±a.",
  "BCCh cuts before the Fed": "BCCh recorta antes que la Fed",
  "Still open": "Sigue abierta",
  "Nothing is directly arguing against it, but some rate inputs are still missing.": "Nada la contradice directamente, pero aÃºn faltan algunos datos de tasas.",
  "Next checks": "PrÃ³ximos datos",
  "US CPI": "IPC de EE.UU.",
  "next release": "prÃ³xima publicaciÃ³n",
  "China credit data": "CrÃ©dito en China",
  "US payrolls": "Empleo de EE.UU.",
  "Friday": "viernes",
  "CFTC positioning": "Posicionamiento CFTC",
  "Friday lag": "rezago del viernes",
  "Stress": "EstrÃ©s",
  "The stress check is not near its warning line. The main weak spot is still the dollar-Chile-copper link.": "El chequeo de estrÃ©s no estÃ¡ cerca de su lÃ­nea de alerta. El punto dÃ©bil sigue siendo el vÃ­nculo dÃ³lar-Chile-cobre.",
  "Calm": "Tranquilo",
  "Only the parts that exist now.": "Solo lo que ya existe.",
  "Shows the biggest market moves.": "Muestra los mayores movimientos.",
  "No long dashboard. Just the changes worth reading first.": "Sin dashboard largo. Solo los cambios que vale la pena leer primero.",
  "Tracks a few live ideas.": "Sigue unas pocas ideas vivas.",
  "Each idea says what supports it and what is pushing back.": "Cada idea muestra quÃ© la apoya y quÃ© empuja en contra.",
  "Ranks what to watch next.": "Ordena quÃ© mirar despuÃ©s.",
  "The calendar focuses on the releases that can actually change the ideas.": "El calendario se enfoca en los datos que realmente pueden cambiar las ideas.",
  "Keeps a dated record.": "Guarda un registro fechado.",
  "Every call can be checked later instead of remembered generously.": "Cada lectura puede revisarse despuÃ©s, sin depender de la memoria.",
  "What would change your mind?": "Â¿QuÃ© te harÃ­a cambiar de opiniÃ³n?",
  "Each idea is saved with a date, a market expression, a time frame, and the evidence that would change your mind.": "Cada idea queda guardada con fecha, expresiÃ³n de mercado, plazo y la evidencia que cambiarÃ­a tu opiniÃ³n.",
  "99,566 data points": "99.566 datos",
  "3 ideas": "3 ideas",
  "Partial liquidity": "Liquidez parcial",
};

const ATTRIBUTE_TRANSLATIONS = {
  "Your name": "Tu nombre",
  "Jane Smith": "Jane Smith",
  "Choose a secure password": "Elige una contraseÃ±a segura",
  "At least 8 characters": "Al menos 8 caracteres",
  "Repeat your new password": "Repite tu nueva contraseÃ±a",
  "bought 100 USD of NVDA": "comprÃ© 100 USD de NVDA",
  "Ask about your portfolio, any position, or any metric...": "Pregunta por tu portafolio, cualquier posiciÃ³n o cualquier mÃ©trica...",
  "Close chat": "Cerrar chat",
  "Ticker": "Ticker",
  "Run the complete analyst bundle": "Ejecutar el paquete completo de anÃ¡lisis",
  "Run a fast memo and valuation pass": "Ejecutar informe y valoraciÃ³n rÃ¡pida",
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function translateNodeText(node, language, originalTextByNode) {
  const parent = node.parentElement;
  if (!parent || parent.closest("[data-no-translate]")) return;

  if (!originalTextByNode.has(node)) {
    originalTextByNode.set(node, node.nodeValue);
  }

  const original = originalTextByNode.get(node);
  const key = normalizeText(original);

  if (language === "es" && TEXT_TRANSLATIONS[key]) {
    node.nodeValue = TEXT_TRANSLATIONS[key];
    return;
  }

  if (language === "en") {
    node.nodeValue = original;
  }
}

function translateAttributes(element, language) {
  for (const attribute of ["placeholder", "aria-label", "title"]) {
    if (!element.hasAttribute(attribute)) continue;
    const originalAttribute = `data-original-${attribute}`;
    if (!element.hasAttribute(originalAttribute)) {
      element.setAttribute(originalAttribute, element.getAttribute(attribute) || "");
    }
    const original = element.getAttribute(originalAttribute) || "";
    const translated = ATTRIBUTE_TRANSLATIONS[normalizeText(original)];
    element.setAttribute(attribute, language === "es" && translated ? translated : original);
  }
}

function translateDocument(language, originalTextByNode) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[data-no-translate]")) return NodeFilter.FILTER_REJECT;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return normalizeText(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => translateNodeText(node, language, originalTextByNode));

  document.querySelectorAll("input, textarea, button, [aria-label], [title]").forEach((element) => {
    if (!element.closest("[data-no-translate]")) translateAttributes(element, language);
  });
}

export function LegacyLanguageTranslator({ language }) {
  const path = usePathname() || "/";
  const originalTextByNodeRef = useRef(new WeakMap());

  useEffect(() => {
    const routeLanguage = path === "/aurora" || path === "/valuation-os-lab" ? "es" : language;
    let frame = 0;
    const run = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => translateDocument(routeLanguage, originalTextByNodeRef.current));
    };

    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title"],
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [language, path]);

  return null;
}
