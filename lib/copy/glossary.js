export const GLOSSARY = {
  en: {
    cvar5: {
      term: "CVaR 5%",
      definition:
        "The average of the worst 5% of simulated outcomes. It answers: when things go wrong, how wrong? It is not a claim about what will happen.",
    },
    var5: {
      term: "VaR 5%",
      definition:
        "The line that 95% of simulated outcomes stay above. It is a floor for normal bad outcomes, not the worst case.",
    },
    var1: {
      term: "VaR 1%",
      definition:
        "The line that 99% of simulated outcomes stay above. It is a harsh simulated floor, not a claim about what will happen.",
    },
    drawdown: {
      term: "Drawdown",
      definition:
        "The deepest drop from a peak before recovering. A -10% drawdown means the portfolio was down 10% from its high at some point.",
    },
    scenario: {
      term: "Scenario",
      definition:
        "One simulated version of the next N days. We run thousands to map the range of outcomes; none is a claim about what will happen.",
    },
    regime: {
      term: "Regime",
      definition:
        "A market mood the simulation assumes: calm, crisis, recovery, or inflation shock. Pick the weather you want to test against.",
    },
    stressTest: {
      term: "Stress test",
      definition:
        "Deliberately harsh simulations. The point is to see if the portfolio survives bad weather, not to say what happens next.",
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
        "The share of simulated scenarios that end below zero. It is a simulated frequency, not market odds.",
    },
    factor: {
      term: "Factor",
      definition:
        "A common force that moves many stocks at once, such as the market, a sector, or a style. The engine simulates forces, then translates them into your positions.",
    },
    calibratedStressEngine: {
      term: "PIT FHS stress engine",
      definition:
        "A statistical stress engine built from point-in-time market history. It ships because the v9 stress book beat the classical baselines and covered walk-forward stress checks.",
    },
    pointInTime: {
      term: "Point-in-time data",
      definition:
        "Historical membership as it was known at the time, not only today's surviving companies. It reduces survivorship bias in stress tests.",
    },
    conditionalVar: {
      term: "Conditional VaR",
      definition:
        "A daily risk line that updates with current volatility using only information available before that day. It is the right backtest for daily VaR.",
    },
    christoffersen: {
      term: "Christoffersen test",
      definition:
        "A backtest that checks whether VaR misses are independent instead of clustering. It complements the exception-count test.",
    },
    runFingerprint: {
      term: "Run ID and seed",
      definition:
        "The fingerprint of this exact simulation. Same fingerprint means identical results, so any run can be audited or reproduced.",
    },
    notPrediction: {
      term: "Scenario output",
      definition:
        "These are simulated stress scenarios, not advice or a claim about what happens next. Use them to understand possible damage before making a decision.",
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
      term: "Stress coverage",
      definition:
        "A pre-cutoff check that the stress book was severe enough to cover later historical shocks. It is not episode replay.",
    },
    ddpm: {
      term: "DDPM",
      definition:
        "An experimental AI simulation model tested in research. It is not the shipped engine because the v9 stress bank is the production engine.",
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
        "El promedio del peor 5% de los resultados simulados. Responde: cuando sale mal, ¿qué tan mal sale? No afirma lo que va a pasar.",
    },
    var5: {
      term: "VaR 5%",
      definition:
        "La línea por encima de la cual queda el 95% de los resultados simulados. Es un piso para lo malo normal, no el peor caso.",
    },
    var1: {
      term: "VaR 1%",
      definition:
        "La línea por encima de la cual queda el 99% de los resultados simulados. Es un piso simulado severo, no una afirmación sobre lo que va a pasar.",
    },
    drawdown: {
      term: "Caída máxima",
      definition:
        "La caída más profunda desde un máximo antes de recuperarse. Una caída máxima de -10% significa que la cartera estuvo 10% bajo su punto más alto en algún momento.",
    },
    scenario: {
      term: "Escenario",
      definition:
        "Una versión simulada de los próximos días. Corremos miles para mapear el rango de resultados posibles; ninguno afirma lo que va a pasar.",
    },
    regime: {
      term: "Régimen",
      definition:
        "El clima de mercado que asume la simulación: calma, crisis, recuperación o shock de inflación. Elige contra qué clima quieres probar tu cartera.",
    },
    stressTest: {
      term: "Prueba de estrés",
      definition:
        "Simulaciones deliberadamente duras. Sirven para ver si la cartera resiste el mal clima, no para decir qué pasará después.",
    },
    tail: {
      term: "Cola",
      definition:
        "El peor tramo de los resultados simulados. Los focos de riesgo son las posiciones que más daño hacen en ese tramo.",
    },
    tailContributor: {
      term: "Foco de riesgo",
      definition:
        "Una posición que concentra las pérdidas en los peores escenarios simulados. Muestra qué duele más cuando la prueba se pone fea.",
    },
    probabilityLoss: {
      term: "Probabilidad de pérdida",
      definition:
        "La fracción de los escenarios simulados que termina en pérdida. Es una frecuencia simulada, no probabilidad de mercado.",
    },
    factor: {
      term: "Factor",
      definition:
        "Una fuerza común que mueve muchas acciones a la vez: el mercado, un sector, un estilo. El motor simula esas fuerzas y luego las traduce a tus posiciones.",
    },
    calibratedStressEngine: {
      term: "Motor FHS de estrés PIT",
      definition:
        "Un motor estadístico de estrés construido con historia de mercado point-in-time. Es el que usamos porque el libro de estrés v9 superó los baselines y cubrió los chequeos walk-forward.",
    },
    pointInTime: {
      term: "Datos point-in-time",
      definition:
        "Membresía histórica tal como existía en cada momento, no solo las empresas que sobreviven hoy. Reduce el sesgo de supervivencia en pruebas de estrés.",
    },
    conditionalVar: {
      term: "VaR condicional",
      definition:
        "Una línea diaria de riesgo que se actualiza con la volatilidad observable antes de ese día. Es el backtest correcto para VaR diario.",
    },
    christoffersen: {
      term: "Test de Christoffersen",
      definition:
        "Un backtest que revisa si las excepciones de VaR son independientes en vez de venir agrupadas. Complementa la prueba de número de excepciones.",
    },
    runFingerprint: {
      term: "Run ID y seed",
      definition:
        "La huella de esta simulación exacta. Misma huella, mismos resultados: cualquier corrida se puede auditar o reproducir después.",
    },
    notPrediction: {
      term: "Resultado de escenario",
      definition:
        "Son escenarios simulados de estrés, no asesoría ni una afirmación sobre lo que pasará después. Sirven para dimensionar el daño posible antes de decidir.",
    },
    mmd: {
      term: "MMD",
      definition:
        "Una prueba que mide si los resultados simulados se parecen a los datos reales de evaluación. Mientras más bajo, mejor.",
    },
    correlationFidelity: {
      term: "Fidelidad de correlación",
      definition:
        "Qué tan bien la simulación mantiene las relaciones esperadas entre posiciones. Mayor fidelidad significa que la cartera se mueve en conjunto como corresponde.",
    },
    distributionCoverage: {
      term: "Cobertura de distribución",
      definition:
        "Si los resultados simulados cubren el rango esperado en vez de concentrarse en una banda estrecha. Es un control de calidad, no una señal de inversión.",
    },
    endpointGate: {
      term: "Compuerta de despliegue",
      definition:
        "La regla que decide si un motor está listo para servirse a usuarios. Una compuerta cerrada mantiene los resultados de investigación fuera de producción.",
    },
    stressFloor: {
      term: "Cobertura de estrés",
      definition:
        "Un chequeo pre-corte de que el libro de estrés fue suficientemente severo para cubrir shocks históricos posteriores. No reproduce cada episodio.",
    },
    ddpm: {
      term: "DDPM",
      definition:
        "Un modelo experimental de simulación con IA, probado en investigación. No es el motor en uso porque el banco de estrés v9 es el motor de producción.",
    },
    score: {
      term: "Puntaje",
      definition:
        "Una señal compacta de orden construida con las reglas visibles en pantalla. Sirve para priorizar el análisis; no reemplaza el juicio.",
    },
  },
};

export function getGlossaryEntry(key, language = "en") {
  if (!key) return null;
  const normalizedLanguage = language === "es" ? "es" : "en";
  return GLOSSARY[normalizedLanguage]?.[key] || GLOSSARY.en[key] || null;
}
