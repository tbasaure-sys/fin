# AURORA Evidence Signal Extractor v1

The Belief Compiler expects structured evidence. The Evidence Signal Extractor is the deterministic bridge from raw text snippets to that structure.

It reads filings, transcripts, news snippets, research notes, or manually pasted text and emits:

- `pricingPower`
- `demandVisibility`
- `capacityConstraint`
- `marginPressure`
- `accountingTrust`
- `customerConcentration`
- `regulatoryRisk`
- `capitalDiscipline`
- structured `claims`
- `riskFlags`
- `sourceLineage`
- evidence `quality`

## Why It Exists

AURORA should not let a valuation memo quietly assume "pricing power" or "bottleneck" because the user feels it. Those claims need a structured evidence layer with provenance.

This v1 is intentionally deterministic and auditable. It uses explicit signal dictionaries, source weighting, excerpts, and risk flags. Later versions can add embeddings, SEC item parsing, transcript chunking, and LLM extraction, but this layer gives us a stable contract now.

## CLI

Full extraction:

```bash
node scripts/run_aurora_evidence_extractor.mjs --input evidence.json --output evidence-signals.json
```

Compiler-ready shape:

```bash
node scripts/run_aurora_evidence_extractor.mjs --input evidence.json --compiler --output compiler-evidence.json
```

Summary:

```bash
node scripts/run_aurora_evidence_extractor.mjs --input evidence.json --summary
```

Input:

```json
{
  "documents": [
    {
      "id": "asml-call",
      "type": "earnings call",
      "source": "company transcript",
      "text": "Management described multi-year demand visibility supported by backlog. The company remains capacity constrained and customers accepted disciplined pricing actions."
    }
  ]
}
```

## Integration

Use:

```js
import { evidenceForBeliefCompiler } from "./lib/aurora-evidence-extractor.js";
import { compileAuroraBeliefObject } from "./lib/aurora-belief-compiler.js";

const evidence = evidenceForBeliefCompiler({ documents });
const compiled = compileAuroraBeliefObject({ company, market, macro, financials, evidence });
```

This creates the current isolated stack:

1. Evidence text -> structured evidence signals.
2. Structured evidence + financial data -> audited drivers.
3. Drivers -> priced belief object.
4. Priced belief object -> falsifiers, lens legitimacy, monitoring plan, and memo.

## Current Limits

- It is lexicon-based, not semantic.
- It does not yet do point-in-time SEC item routing.
- It does not yet compare management claims against realized financials.
- It should be treated as an evidence compiler, not a truth oracle.

That is fine for v1. The point is to prevent invisible assumptions and make every qualitative claim inspectable.
