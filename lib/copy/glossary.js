export const GLOSSARY = {
  en: {
    cvar5: {
      term: "CVaR 5%",
      definition:
        "The average of the worst 5% of simulated outcomes. It answers: when things go wrong, how wrong? It is not a prediction.",
    },
    var5: {
      term: "VaR 5%",
      definition:
        "The line that 95% of simulated outcomes stay above. It is a floor for normal bad outcomes, not the worst case.",
    },
    var1: {
      term: "VaR 1%",
      definition:
        "The line that 99% of simulated outcomes stay above. It is a harsh simulated floor, not a forecast.",
    },
    drawdown: {
      term: "Drawdown",
      definition:
        "The deepest drop from a peak before recovering. A -10% drawdown means the portfolio was down 10% from its high at some point.",
    },
    scenario: {
      term: "Scenario",
      definition:
        "One simulated version of the next N days. We run thousands to map the range of outcomes; none is a forecast.",
    },
    regime: {
      term: "Regime",
      definition:
        "A market mood the simulation assumes: calm, crisis, recovery, or inflation shock. Pick the weather you want to test against.",
    },
    stressTest: {
      term: "Stress test",
      definition:
        "Deliberately harsh simulations. The point is to see if the portfolio survives bad weather, not to predict it.",
    },
    tail: {
      term: "Tail",
      definition:
        "The worst slice of simulated outcomes. Tail contributors are the positions that do the most damage in that slice.",
    },
    tailContributor: {
      term: "Tail contributor",
      definition:
        "A position that drives losses in the worst simulated outcomes. It helps show what hurts most when the stress test gets ugly.",
    },
    probabilityLoss: {
      term: "Probability of loss",
      definition:
        "The share of simulated scenarios that end below zero. It is a simulated frequency, not a probability forecast.",
    },
    factor: {
      term: "Factor",
      definition:
        "A common force that moves many stocks at once, such as the market, a sector, or a style. The engine simulates forces, then translates them into your positions.",
    },
    calibratedStressEngine: {
      term: "Calibrated stress engine",
      definition:
        "A statistical engine tuned to historical market behavior. It ships because it beat the experimental AI model on the v8 accuracy tests.",
    },
    runFingerprint: {
      term: "Run ID and seed",
      definition:
        "The fingerprint of this exact simulation. Same fingerprint means identical results, so any run can be audited or reproduced.",
    },
    notPrediction: {
      term: "Not a prediction",
      definition:
        "These are simulated stress scenarios, not forecasts or advice. Use them to understand possible damage before making a decision.",
    },
    mmd: {
      term: "MMD",
      definition:
        "A test that compares whether simulated outcomes look like the real evaluation set. Lower is better for this diagnostic.",
    },
    correlationFidelity: {
      term: "Correlation fidelity",
      definition:
        "How closely the simulation keeps the intended relationships between positions. Higher fidelity means the portfolio moves together as expected.",
    },
    distributionCoverage: {
      term: "Distribution coverage",
      definition:
        "Whether simulated outcomes fill the expected range instead of collapsing into one narrow band. It is a quality check, not a trading signal.",
    },
    endpointGate: {
      term: "Endpoint gate",
      definition:
        "The deployment rule that decides whether the engine is safe to serve. A closed gate keeps research outputs away from users.",
    },
    stressFloor: {
      term: "Stress floor",
      definition:
        "A check that simulated crises are at least as severe as real historical drops. It is a lower-bound severity test, not episode replay.",
    },
    ddpm: {
      term: "DDPM",
      definition:
        "An experimental AI simulation model tested in research. It is not the shipped engine because the v8 baseline beat it.",
    },
    score: {
      term: "Score",
      definition:
        "A compact ranking signal built from the visible rules on the screen. It should guide research priority, not replace judgment.",
    },
  },
  es: {
    cvar5: {
      term: "CVaR 5%",
      definition:
        "El promedio del peor 5% de los resultados simulados. Responde: cuando sale mal, que tan mal sale? No es una prediccion.",
    },
    var5: {
      term: "VaR 5%",
      definition:
        "La linea que el 95% de los resultados simulados queda por encima. Es un piso para lo malo normal, no el peor caso.",
    },
    var1: {
      term: "VaR 1%",
      definition:
        "La linea que el 99% de los resultados simulados queda por encima. Es un piso simulado severo, no un pronostico.",
    },
    drawdown: {
      term: "Drawdown",
      definition:
        "La caida mas profunda desde un maximo antes de recuperarse. Un drawdown de -10% significa que la cartera estuvo 10% bajo su maximo en algun momento.",
    },
    scenario: {
      term: "Escenario",
      definition:
        "Una version simulada de los proximos N dias. Corremos miles para mapear el rango de resultados; ninguno es un pronostico.",
    },
    regime: {
      term: "Regimen",
      definition:
        "Un clima de mercado que asume la simulacion: calma, crisis, recuperacion o shock inflacionario. Elige contra que clima quieres probar.",
    },
    stressTest: {
      term: "Stress test",
      definition:
        "Simulaciones deliberadamente duras. Sirven para ver si la cartera resiste mal clima, no para predecirlo.",
    },
    tail: {
      term: "Cola",
      definition:
        "El peor tramo de los resultados simulados. Los contribuidores de cola son las posiciones que mas dano hacen en ese tramo.",
    },
    tailContributor: {
      term: "Contribuidor de cola",
      definition:
        "Una posicion que empuja perdidas en los peores resultados simulados. Muestra que duele mas cuando el stress test se pone feo.",
    },
    probabilityLoss: {
      term: "Probabilidad de perdida",
      definition:
        "La parte de los escenarios simulados que termina bajo cero. Es una frecuencia simulada, no una probabilidad pronosticada.",
    },
    factor: {
      term: "Factor",
      definition:
        "Una fuerza comun que mueve muchas acciones a la vez, como mercado, sector o estilo. El motor simula fuerzas y luego las traduce a tus posiciones.",
    },
    calibratedStressEngine: {
      term: "Motor calibrado de stress",
      definition:
        "Un motor estadistico ajustado al comportamiento historico del mercado. Se sirve porque supero al modelo experimental de IA en las pruebas v8.",
    },
    runFingerprint: {
      term: "Run ID y seed",
      definition:
        "La huella de esta simulacion exacta. Misma huella significa mismos resultados, asi que la corrida se puede auditar o reproducir.",
    },
    notPrediction: {
      term: "No es prediccion",
      definition:
        "Son escenarios simulados de stress, no pronosticos ni asesoria. Sirven para entender dano posible antes de decidir.",
    },
    mmd: {
      term: "MMD",
      definition:
        "Una prueba que compara si los resultados simulados se parecen al conjunto real de evaluacion. Menor es mejor en este diagnostico.",
    },
    correlationFidelity: {
      term: "Fidelidad de correlacion",
      definition:
        "Que tan bien la simulacion mantiene las relaciones esperadas entre posiciones. Mayor fidelidad significa que la cartera se mueve junta como corresponde.",
    },
    distributionCoverage: {
      term: "Cobertura de distribucion",
      definition:
        "Si los resultados simulados cubren el rango esperado en vez de colapsar en una banda estrecha. Es un chequeo de calidad, no una senal de trading.",
    },
    endpointGate: {
      term: "Gate del endpoint",
      definition:
        "La regla de despliegue que decide si el motor se puede servir. Un gate cerrado mantiene outputs de investigacion lejos del usuario.",
    },
    stressFloor: {
      term: "Piso de stress",
      definition:
        "Un chequeo de que las crisis simuladas sean al menos tan severas como caidas historicas reales. Es severidad minima, no replay de episodios.",
    },
    ddpm: {
      term: "DDPM",
      definition:
        "Un modelo experimental de simulacion con IA probado en investigacion. No es el motor servido porque el baseline v8 le gano.",
    },
    score: {
      term: "Score",
      definition:
        "Una senal compacta de ranking construida con las reglas visibles en pantalla. Prioriza investigacion; no reemplaza juicio.",
    },
  },
};

export function getGlossaryEntry(key, language = "en") {
  if (!key) return null;
  const normalizedLanguage = language === "es" ? "es" : "en";
  return GLOSSARY[normalizedLanguage]?.[key] || GLOSSARY.en[key] || null;
}
