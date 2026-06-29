# AURORA Valuation Ensemble v1

This layer implements the valuation-ensemble section of `valuation_idea.txt`.

The Bayesian Forecast Engine answers:

```text
What economic futures are plausible?
```

The Valuation Ensemble answers:

```text
What is each future worth under several economically distinct valuation lenses?
```

## Function

`buildAuroraValuationEnsemble(input, options)` accepts a belief-pipeline output or a compiled object with:

- `forecast`
- `accounting`
- `beliefObject`
- `equilibrium`
- `driverGraph`

It returns:

- lens-level values
- scenario-level values per lens
- lens weights
- weighted fair value
- expected return
- disagreement / dispersion
- method-count and leading lens
- decision label

## Lenses

The current v1 includes:

- `fcffDcf`
- `roicFade`
- `residualIncome`
- `assetValue`
- `apv`
- `realOptions`
- `bottleneck`
- `unitEconomics`
- `capitalCycle`
- `reverseDcf`

Reverse DCF is intentionally treated as a market-implied benchmark, not as intrinsic value. It tells AURORA what the market is asking the company to prove; it does not get blended into the intrinsic consensus.

## Weighting

Weights depend on:

- sector archetype
- lens legitimacy from the priced belief object
- accounting quality
- forecast uncertainty
- whether the lens can actually produce a value

This follows the original guide's instruction that model weights should not be manual decorations. They should depend on economic relevance, data quality, sector, stability, horizon, and evidence.

## Decisions

- `ensemble_usable`: lens disagreement is tolerable.
- `ensemble_wide_range_use_caution`: lenses disagree enough that the output should be read as a range.
- `ensemble_requires_review`: method disagreement is too high for clean underwriting.
- `ensemble_waits_for_forecast_review`: forecast posterior must be repaired first.
- `ensemble_insufficient`: not enough usable valuation lenses.

## Why This Layer Matters

AURORA should not be a DCF spreadsheet with more steps. Different businesses deserve different lenses:

- banks need residual income and book-capital logic
- asset-heavy cyclicals need asset value and capital-cycle logic
- software and marketplaces need unit economics and optionality
- bottleneck businesses need scarcity and ROIC persistence

This layer gives the pipeline a structured way to let those methods disagree before a decision engine turns the distribution into IRR and risk.

