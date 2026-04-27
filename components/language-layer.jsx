"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export const LANGUAGE_STORAGE_KEY = "blsprime_language_preference";

const SUPPORTED_LANGUAGES = new Set(["en", "es"]);
const LANGUAGE_EVENT = "blsprime:language";

const TEXT_TRANSLATIONS = {
  "Back to home": "Volver al inicio",
  "Back to login": "Volver a iniciar sesión",
  "Account access": "Acceso a la cuenta",
  "Your capital OS,": "Tu sistema de capital,",
  "protected by your password.": "protegido por tu contraseña.",
  "Your capital OS, protected by your password.": "Tu sistema de capital, protegido por tu contraseña.",
  "Sign in once, then return to the same money plan, portfolio, research desk, and decision memory from web or mobile.": "Inicia sesión una vez y vuelve al mismo plan de dinero, portafolio, mesa de investigación y memoria de decisiones desde web o móvil.",
  "Your own credentials": "Tus propias credenciales",
  "Each user gets their own password instead of one shared access code for everyone.": "Cada usuario tiene su propia contraseña en vez de un código compartido para todos.",
  "One private workspace": "Un espacio de trabajo privado",
  "Your finance plan, holdings, research, and staged decisions all come back after login.": "Tu plan financiero, posiciones, investigación y decisiones preparadas vuelven después de iniciar sesión.",
  "Web and mobile ready": "Listo para web y móvil",
  "The native app uses the same account and the same workspace APIs as the website.": "La app nativa usa la misma cuenta y las mismas APIs del espacio de trabajo que el sitio web.",
  "Your private workspace": "Tu espacio de trabajo privado",
  "Welcome to": "Bienvenido a ",
  "Welcome to BLS Prime": "Bienvenido a BLS Prime",
  "First time here?": "¿Primera vez aquí?",
  "Create your account below - it only takes a minute.": "Crea tu cuenta abajo. Toma solo un minuto.",
  "Already have an account?": "¿Ya tienes una cuenta?",
  "Sign in with your email and password.": "Inicia sesión con tu email y contraseña.",
  "Your name": "Tu nombre",
  "(only needed for new accounts)": "(solo necesario para cuentas nuevas)",
  "Email address": "Email",
  "Password": "Contraseña",
  "(8 characters minimum)": "(mínimo 8 caracteres)",
  "Create my account": "Crear mi cuenta",
  "Creates your private workspace in one step.": "Crea tu espacio de trabajo privado en un solo paso.",
  "or": "o",
  "Sign in": "Iniciar sesión",
  "Use the email and password you set before.": "Usa el email y la contraseña que configuraste antes.",
  "Forgot your password?": "¿Olvidaste tu contraseña?",
  "Password recovery": "Recuperación de contraseña",
  "Recover access": "Recupera el acceso",
  "to your workspace.": "a tu espacio de trabajo.",
  "Recover access to your workspace.": "Recupera el acceso a tu espacio de trabajo.",
  "Enter your email and we will send you a secure link so you can set a new password without needing support to intervene.": "Ingresa tu email y te enviaremos un enlace seguro para crear una nueva contraseña sin necesitar soporte.",
  "Reset password": "Restablecer contraseña",
  "Get your recovery link": "Recibe tu enlace de recuperación",
  "If the email exists, we will create a secure reset link and deliver it.": "Si el email existe, crearemos y enviaremos un enlace seguro de recuperación.",
  "If the account exists, the reset instructions are on the way.": "Si la cuenta existe, las instrucciones de recuperación van en camino.",
  "Send reset link": "Enviar enlace de recuperación",
  "Back to sign in": "Volver a iniciar sesión",
  "Choose a new password": "Elige una nueva contraseña",
  "Set a new password": "Crea una nueva contraseña",
  "and get back in.": "y vuelve a entrar.",
  "Set a new password and get back in.": "Crea una nueva contraseña y vuelve a entrar.",
  "This secure link lets you replace the old password and sign back into your workspace right away.": "Este enlace seguro te permite reemplazar la contraseña anterior y volver a entrar a tu espacio de trabajo.",
  "Create your new password": "Crea tu nueva contraseña",
  "Use at least 8 characters. After saving it, you will be signed in automatically.": "Usa al menos 8 caracteres. Después de guardarla, entrarás automáticamente.",
  "New password": "Nueva contraseña",
  "Confirm password": "Confirmar contraseña",
  "Save new password": "Guardar nueva contraseña",
  "Terms of Service": "Términos de Servicio",
  "Workspace": "Espacio",
  "Home": "Inicio",
  "Research software, not financial advice.": "Software de investigación, no asesoría financiera.",
  "These terms explain how": "Estos términos explican cómo ",
  "should be used. The short version: the product helps you organize information and think more clearly, but you remain responsible for every financial decision.": " debe usarse. La versión corta: el producto te ayuda a organizar información y pensar con más claridad, pero sigues siendo responsable de cada decisión financiera.",
  "These terms explain how BLS Prime should be used. The short version: the product helps you organize information and think more clearly, but you remain responsible for every financial decision.": "Estos términos explican cómo debe usarse BLS Prime. La versión corta: el producto te ayuda a organizar información y pensar con más claridad, pero sigues siendo responsable de cada decisión financiera.",
  "Effective date: April 20, 2026": "Fecha de vigencia: 20 de abril de 2026",
  "1. Educational and research use only": "1. Uso solo educativo y de investigación",
  "provides portfolio organization, market context, risk analytics, equity research outputs, and AI-assisted explanations for informational and educational purposes. It is not a registered investment adviser, broker, dealer, tax adviser, or law firm.": " ofrece organización de portafolio, contexto de mercado, analítica de riesgo, investigación de acciones y explicaciones asistidas por IA con fines informativos y educativos. No es asesor de inversiones registrado, intermediario financiero, distribuidor de valores, asesor tributario ni firma legal.",
  "BLS Prime provides portfolio organization, market context, risk analytics, equity research outputs, and AI-assisted explanations for informational and educational purposes. It is not a registered investment adviser, broker, dealer, tax adviser, or law firm.": "BLS Prime ofrece organización de portafolio, contexto de mercado, analítica de riesgo, investigación de acciones y explicaciones asistidas por IA con fines informativos y educativos. No es asesor de inversiones registrado, intermediario financiero, distribuidor de valores, asesor tributario ni firma legal.",
  "2. No personalized financial advice": "2. Sin asesoría financiera personalizada",
  "Nothing in the product is financial, investment, tax, accounting, or legal advice. Outputs should not be treated as a recommendation to buy, sell, hold, hedge, rebalance, or otherwise transact in any security or asset. You should make decisions independently or with a qualified professional who understands your full circumstances.": "Nada en el producto constituye asesoría financiera, de inversión, tributaria, contable o legal. Los resultados no deben tratarse como recomendación para comprar, vender, mantener, cubrir, rebalancear o transar ningún valor o activo. Debes decidir de forma independiente o con un profesional calificado que entienda tu situación completa.",
  "3. No trading or execution": "3. Sin operaciones ni ejecución",
  "The workspace does not place trades, route orders, manage money, or execute transactions. Any staged action, memo, valuation, model, alert, or checklist is a research artifact only.": "El espacio de trabajo no realiza operaciones, enruta órdenes, administra dinero ni ejecuta transacciones. Cualquier acción preparada, informe, valoración, modelo, alerta o lista de verificación es solo un artefacto de investigación.",
  "4. Data and model limitations": "4. Limitaciones de datos y modelos",
  "Market data, financial statements, third-party APIs, user-entered holdings, AI outputs, and derived calculations may be delayed, incomplete, stale, wrong, or unavailable. Deterministic calculations can still be wrong if the source data or assumptions are wrong. You should verify important information against primary sources before acting.": "Los datos de mercado, estados financieros, APIs de terceros, posiciones ingresadas por el usuario, resultados de IA y cálculos derivados pueden estar retrasados, incompletos, desactualizados, equivocados o no disponibles. Los cálculos determinísticos también pueden fallar si los datos fuente o supuestos son incorrectos. Verifica la información importante contra fuentes primarias antes de actuar.",
  "5. AI-assisted analysis": "5. Análisis asistido por IA",
  "AI may summarize, critique, or explain sourced data and deterministic model outputs. AI can make mistakes, omit context, or overstate confidence. Treat AI text as a draft research aid, not an authority.": "La IA puede resumir, criticar o explicar datos con fuente y resultados de modelos determinísticos. Puede equivocarse, omitir contexto o exagerar confianza. Trata el texto de IA como borrador de apoyo a la investigación, no como autoridad.",
  "6. Your responsibility": "6. Tu responsabilidad",
  "You are responsible for the accuracy of holdings you enter, the assumptions you accept, the professionals you consult, and any decision you make outside the product. Past performance, model output, valuation estimates, and risk scores do not guarantee future results.": "Eres responsable de la precisión de las posiciones que ingresas, los supuestos que aceptas, los profesionales que consultas y cualquier decisión que tomes fuera del producto. El desempeño pasado, los modelos, las estimaciones de valoración y los puntajes de riesgo no garantizan resultados futuros.",
  "7. Acceptable use": "7. Uso aceptable",
  "Do not use the workspace to automate trading, manipulate markets, violate laws, reverse engineer protected services, overload third-party data providers, or make decisions for another person without proper authorization.": "No uses el espacio de trabajo para automatizar operaciones, manipular mercados, violar leyes, hacer ingeniería inversa de servicios protegidos, sobrecargar proveedores de datos o tomar decisiones por otra persona sin autorización adecuada.",
  "Today": "Hoy",
  "Start": "Inicio",
  "Brief and action": "Resumen y acción",
  "Current brief and immediate move": "Resumen actual y próximo movimiento",
  "Start with the live read, the supporting notes, and the move that currently deserves attention.": "Parte por la lectura en vivo, las notas de soporte y el movimiento que hoy merece atención.",
  "Money plan": "Plan de dinero",
  "Fund": "Fondos",
  "Income and investable cash": "Ingreso y caja invertible",
  "Monthly cashflow and investable room": "Flujo mensual y margen invertible",
  "Keep income, fixed costs, variable spending, and the funded contribution in one operating view.": "Mantén ingreso, costos fijos, gasto variable y aporte financiado en una sola vista operativa.",
  "Portfolio": "Portafolio",
  "Read": "Lectura",
  "Path and carriers": "Trayectoria y motores",
  "Performance, weight, and what is carrying the book": "Rendimiento, pesos y qué sostiene el portafolio",
  "Read the portfolio through performance, position weight, and the names doing the real work.": "Lee el portafolio por rendimiento, peso de posiciones y los nombres que realmente lo mueven.",
  "Overlap": "Solapamiento",
  "Audit": "Auditar",
  "Structural breadth": "Amplitud estructural",
  "Real breadth and overlap under stress": "Amplitud real y solapamiento bajo estrés",
  "Check whether the portfolio still has independent bets once hidden concentration is included.": "Revisa si el portafolio aún tiene apuestas independientes cuando se incluye la concentración oculta.",
  "Research": "Investigación",
  "Explain": "Explicar",
  "Company brief": "Informe de compañía",
  "Company work in a concise research brief": "Trabajo de compañía en un informe conciso",
  "Open the current memo, the valuation debate, and the sources without leaving the workspace.": "Abre el informe actual, el debate de valoración y las fuentes sin salir del espacio de trabajo.",
  "Holdings": "Posiciones",
  "Update": "Actualizar",
  "Positions and edits": "Posiciones y ediciones",
  "Direct position updates and stored holdings": "Actualizaciones directas y posiciones guardadas",
  "Review what is connected, add positions, and save sizing changes in the same operating surface.": "Revisa lo conectado, agrega posiciones y guarda cambios de tamaño en la misma superficie.",
  "One decision surface. Open only the layer you need.": "Una sola superficie de decisión. Abre solo la capa que necesitas.",
  "Alerts": "Alertas",
  "Staged": "Preparadas",
  "Ask workspace": "Preguntar al espacio",
  "Glossary": "Glosario",
  "Guide": "Guía",
  "Terms": "Términos",
  "Current answer": "Respuesta actual",
  "Executive answer": "Respuesta ejecutiva",
  "Preserve the reserve sleeve": "Preservar la reserva",
  "No change is needed here unless a cleaner use for that capital appears.": "No hace falta cambiar nada aquí salvo que aparezca un uso más claro para ese capital.",
  "No change needed while reserve use is unclear.": "No hace falta cambiar nada mientras el uso de la reserva no esté claro.",
  "Review decision": "Revisar decisión",
  "Open explanation": "Abrir explicación",
  "Check overlap": "Revisar solapamiento",
  "Available": "Disponible",
  "Available to invest this month": "Disponible para invertir este mes",
  "Investable cash": "Caja invertible",
  "After expenses and reserve.": "Después de gastos y reserva.",
  "Target coverage": "Cobertura objetivo",
  "Set target": "Definir objetivo",
  "Share of the planned contribution that is funded.": "Parte del aporte planificado que ya está financiada.",
  "Optionality reserve": "Reserva de opcionalidad",
  "Wait for a cleaner state before spending optionality on new risk.": "Espera un estado más claro antes de usar opcionalidad en nuevo riesgo.",
  "Wait for a cleaner setup before widening risk.": "Espera una configuración más clara antes de ampliar el riesgo.",
  "Wait for a cleaner setup": "Esperar una configuración más clara",
  "Preserve current sizing until the setup improves.": "Mantén el tamaño actual hasta que mejore la configuración.",
  "No funding change": "Sin cambio de financiamiento",
  "Selective posture": "Postura selectiva",
  "Protect capital": "Proteger capital",
  "Portfolio data": "Datos del portafolio",
  "Market snapshot": "Foto de mercado",
  "Current session": "Sesión actual",
  "Research desk": "Mesa de investigación",
  "Run analysis": "Analizar",
  "Running...": "Analizando...",
  "Running": "Analizando",
  "Ready": "Listo",
  "Ready to run": "Listo para analizar",
  "Full desk": "Análisis completo",
  "Quick read": "Lectura rápida",
  "Waiting for run": "Esperando análisis",
  "Ready for review": "Listo para revisar",
  "Evidence gaps open": "Hay brechas de evidencia",
  "Partially reviewed": "Revisado parcialmente",
  "No required gaps": "Sin brechas requeridas",
  "Business": "Negocio",
  "No run yet": "Sin análisis aún",
  "Latest revenue": "Ingresos recientes",
  "Base value/share": "Valor base/acción",
  "Audit state": "Estado de auditoría",
  "Evidence coverage": "Cobertura de evidencia",
  "Best supported value": "Valor mejor respaldado",
  "What still needs work": "Qué falta trabajar",
  "Coverage": "Cobertura",
  "Statement source": "Fuente de estados",
  "Prior changes": "Cambios previos",
  "Downloads": "Descargas",
  "Run receipt": "Registro del análisis",
  "Statements": "Estados financieros",
  "Filings": "Presentaciones",
  "Artifacts": "Artefactos",
  "Memo": "Memo",
  "Value": "Valor",
  "Debate": "Debate",
  "Sources": "Fuentes",
  "Changes": "Cambios",
  "Portfolio path will appear here": "La trayectoria del portafolio aparecerá aquí",
  "Stored snapshots are needed before the app draws performance, benchmark spread, and trend direction.": "Se necesitan snapshots guardados antes de dibujar rendimiento, comparación con benchmark y tendencia.",
  "Save holding": "Guardar posición",
  "Saving...": "Guardando...",
  "This path updates the final position directly instead of trying to infer a trade note.": "Esta ruta actualiza la posición final directamente, sin intentar inferir una nota de operación.",
  "Advanced update": "Actualización avanzada",
  "Use plain English for buy and sell notes": "Usa lenguaje simple para notas de compra y venta",
  "Run text update": "Actualizar desde texto",
  "Updating...": "Actualizando...",
  "Reset to connected holdings": "Restablecer posiciones conectadas",
  "Analyze diversification": "Analizar diversificación",
  "Analyzing...": "Analizando...",
  "Check structure": "Revisar estructura",
  "Checking...": "Revisando...",
  "Refresh": "Actualizar",
  "Ask your portfolio": "Pregúntale a tu portafolio",
  "Close": "Cerrar",
  "You": "Tú",
  "Ask anything about your portfolio": "Pregunta cualquier cosa sobre tu portafolio",
  "I have full context of your holdings, market state, risk metrics, and alerts. Ask me in plain English - no jargon needed.": "Tengo el contexto de tus posiciones, estado de mercado, métricas de riesgo y alertas. Pregunta en lenguaje simple, sin jerga.",
  "Is my portfolio too concentrated right now?": "¿Mi portafolio está demasiado concentrado ahora?",
  "What does the current market stance mean for me specifically?": "¿Qué significa para mí la postura actual del mercado?",
  "Which of my positions adds the least real diversification?": "¿Cuál de mis posiciones agrega menos diversificación real?",
  "Should I be worried about what the alerts are flagging?": "¿Debería preocuparme por lo que marcan las alertas?",
  "What would I need to see before adding more risk to the portfolio?": "¿Qué tendría que ver antes de agregar más riesgo al portafolio?",
  "What is the clearest reason to wait before adding risk?": "¿Cuál es la razón más clara para esperar antes de agregar riesgo?",
  "Retry": "Reintentar",
  "Stop": "Detener",
  "Send": "Enviar",
  "Answers are grounded in your workspace data but are not financial advice. Always verify before acting.": "Las respuestas se basan en los datos de tu espacio de trabajo, pero no son asesoría financiera. Verifica siempre antes de actuar.",
  "Language": "Idioma",
};

const ATTRIBUTE_TRANSLATIONS = {
  "Your name": "Tu nombre",
  "Jane Smith": "Jane Smith",
  "Choose a secure password": "Elige una contraseña segura",
  "At least 8 characters": "Al menos 8 caracteres",
  "Repeat your new password": "Repite tu nueva contraseña",
  "bought 100 USD of NVDA": "compré 100 USD de NVDA",
  "Ask about your portfolio, any position, or any metric...": "Pregunta por tu portafolio, cualquier posición o cualquier métrica...",
  "Close chat": "Cerrar chat",
  "Ticker": "Ticker",
  "Run the complete analyst bundle": "Ejecutar el paquete completo de análisis",
  "Run a fast memo and valuation pass": "Ejecutar informe y valoración rápida",
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.has(value) ? value : "en";
}

export function readStoredLanguage() {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.has(stored)) return stored;
  } catch {}
  return window.navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

export function writeStoredLanguage(language) {
  if (typeof window === "undefined") return;
  const nextLanguage = normalizeLanguage(language);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  } catch {}
  document.documentElement.lang = nextLanguage;
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { language: nextLanguage } }));
}

export function useLanguagePreference() {
  const [language, setLanguageState] = useState("en");

  useEffect(() => {
    setLanguageState(readStoredLanguage());

    function handleLanguage(event) {
      setLanguageState(normalizeLanguage(event?.detail?.language));
    }

    window.addEventListener(LANGUAGE_EVENT, handleLanguage);
    return () => window.removeEventListener(LANGUAGE_EVENT, handleLanguage);
  }, []);

  const setLanguage = useMemo(
    () => (nextLanguage) => {
      const normalized = normalizeLanguage(nextLanguage);
      setLanguageState(normalized);
      writeStoredLanguage(normalized);
    },
    [],
  );

  return { language, setLanguage };
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

export function LanguageLayer() {
  const { language, setLanguage } = useLanguagePreference();
  const [path, setPath] = useState("/");
  const originalTextByNodeRef = useRef(new WeakMap());

  useEffect(() => {
    setPath(window.location.pathname || "/");
  }, []);

  useEffect(() => {
    let frame = 0;
    const run = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => translateDocument(language, originalTextByNodeRef.current));
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
  }, [language]);

  if (path === "/") return null;

  return (
    <div className="global-language-dock" data-no-translate aria-label={language === "es" ? "Elegir idioma" : "Choose language"}>
      <span>{language === "es" ? "Idioma" : "Language"}</span>
      <button aria-pressed={language === "en"} data-active={language === "en"} onClick={() => setLanguage("en")} type="button">
        EN
      </button>
      <button aria-pressed={language === "es"} data-active={language === "es"} onClick={() => setLanguage("es")} type="button">
        ES
      </button>
    </div>
  );
}
