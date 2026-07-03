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
        "El promedio del peor 5% de los resultados simulados. Responde: cuando sale mal, \u00bfqu\u00e9 tan mal sale? No afirma lo que va a pasar.",
    },
    var5: {
      term: "VaR 5%",
      definition:
        "La l\u00ednea por encima de la cual queda el 95% de los resultados simulados. Es un piso para lo malo normal, no el peor caso.",
    },
    var1: {
      term: "VaR 1%",
      definition:
        "La l\u00ednea por encima de la cual queda el 99% de los resultados simulados. Es un piso simulado severo, no una afirmaci\u00f3n sobre lo que va a pasar.",
    },
    drawdown: {
      term: "Ca\u00edda m\u00e1xima",
      definition:
        "La ca\u00edda m\u00e1s profunda desde un m\u00e1ximo antes de recuperarse. Una ca\u00edda m\u00e1xima de -10% significa que la cartera estuvo 10% bajo su punto m\u00e1s alto en alg\u00fan momento.",
    },
    scenario: {
      term: "Escenario",
      definition:
        "Una versi\u00f3n simulada de los pr\u00f3ximos d\u00edas. Corremos miles para mapear el rango de resultados posibles; ninguno afirma lo que va a pasar.",
    },
    regime: {
      term: "R\u00e9gimen",
      definition:
        "El clima de mercado que asume la simulaci\u00f3n: calma, crisis, recuperaci\u00f3n o shock de inflaci\u00f3n. Elige contra qu\u00e9 clima quieres probar tu cartera.",
    },
    stressTest: {
      term: "Prueba de estr\u00e9s",
      definition:
        "Simulaciones deliberadamente duras. Sirven para ver si la cartera resiste el mal clima, no para decir qu\u00e9 pasar\u00e1 despu\u00e9s.",
    },
    tail: {
      term: "Cola",
      definition:
        "El peor tramo de los resultados simulados. Los focos de riesgo son las posiciones que m\u00e1s da\u00f1o hacen en ese tramo.",
    },
    tailContributor: {
      term: "Foco de riesgo",
      definition:
        "Una posici\u00f3n que concentra las p\u00e9rdidas en los peores escenarios simulados. Muestra qu\u00e9 duele m\u00e1s cuando la prueba se pone fea.",
    },
    probabilityLoss: {
      term: "Probabilidad de p\u00e9rdida",
      definition:
        "La fracci\u00f3n de los escenarios simulados que termina en p\u00e9rdida. Es una frecuencia simulada, no probabilidad de mercado.",
    },
    factor: {
      term: "Factor",
      definition:
        "Una fuerza com\u00fan que mueve muchas acciones a la vez: el mercado, un sector, un estilo. El motor simula esas fuerzas y luego las traduce a tus posiciones.",
    },
    calibratedStressEngine: {
      term: "Motor FHS de estr\u00e9s PIT",
      definition:
        "Un motor estad\u00edstico de estr\u00e9s construido con historia de mercado point-in-time. Es el que usamos porque el libro de estr\u00e9s v9 super\u00f3 los baselines y cubri\u00f3 los chequeos walk-forward.",
    },
    pointInTime: {
      term: "Datos point-in-time",
      definition:
        "Membres\u00eda hist\u00f3rica tal como exist\u00eda en cada momento, no solo las empresas que sobreviven hoy. Reduce el sesgo de supervivencia en pruebas de estr\u00e9s.",
    },
    conditionalVar: {
      term: "VaR condicional",
      definition:
        "Una l\u00ednea diaria de riesgo que se actualiza con la volatilidad observable antes de ese d\u00eda. Es el backtest correcto para VaR diario.",
    },
    christoffersen: {
      term: "Test de Christoffersen",
      definition:
        "Un backtest que revisa si las excepciones de VaR son independientes en vez de venir agrupadas. Complementa la prueba de n\u00famero de excepciones.",
    },
    runFingerprint: {
      term: "Run ID y seed",
      definition:
        "La huella de esta simulaci\u00f3n exacta. Misma huella, mismos resultados: cualquier corrida se puede auditar o reproducir despu\u00e9s.",
    },
    notPrediction: {
      term: "Resultado de escenario",
      definition:
        "Son escenarios simulados de estr\u00e9s, no asesor\u00eda ni una afirmaci\u00f3n sobre lo que pasar\u00e1 despu\u00e9s. Sirven para dimensionar el da\u00f1o posible antes de decidir.",
    },
    mmd: {
      term: "MMD",
      definition:
        "Una prueba que mide si los resultados simulados se parecen a los datos reales de evaluaci\u00f3n. Mientras m\u00e1s bajo, mejor.",
    },
    correlationFidelity: {
      term: "Fidelidad de correlaci\u00f3n",
      definition:
        "Qu\u00e9 tan bien la simulaci\u00f3n mantiene las relaciones esperadas entre posiciones. Mayor fidelidad significa que la cartera se mueve en conjunto como corresponde.",
    },
    distributionCoverage: {
      term: "Cobertura de distribuci\u00f3n",
      definition:
        "Si los resultados simulados cubren el rango esperado en vez de concentrarse en una banda estrecha. Es un control de calidad, no una se\u00f1al de inversi\u00f3n.",
    },
    endpointGate: {
      term: "Compuerta de despliegue",
      definition:
        "La regla que decide si un motor est\u00e1 listo para servirse a usuarios. Una compuerta cerrada mantiene los resultados de investigaci\u00f3n fuera de producci\u00f3n.",
    },
    stressFloor: {
      term: "Cobertura de estr\u00e9s",
      definition:
        "Un chequeo pre-corte de que el libro de estr\u00e9s fue suficientemente severo para cubrir shocks hist\u00f3ricos posteriores. No reproduce cada episodio.",
    },
    ddpm: {
      term: "DDPM",
      definition:
        "Un modelo experimental de simulaci\u00f3n con IA, probado en investigaci\u00f3n. No es el motor en uso porque el banco de estr\u00e9s v9 es el motor de producci\u00f3n.",
    },
    score: {
      term: "Puntaje",
      definition:
        "Una se\u00f1al compacta de orden construida con las reglas visibles en pantalla. Sirve para priorizar el an\u00e1lisis; no reemplaza el juicio.",
    },
  },
};

export function getGlossaryEntry(key, language = "en") {
  if (!key) return null;
  const normalizedLanguage = language === "es" ? "es" : "en";
  return GLOSSARY[normalizedLanguage]?.[key] || GLOSSARY.en[key] || null;
}
