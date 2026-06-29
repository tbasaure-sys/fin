# AURORA Source Governance Engine v1

This layer implements section 15 of `valuation_idea.txt`.

It answers:

```text
Is this source allowed to influence valuation, or only allowed to support a memo?
```

## Function

`buildAuroraSourceGovernanceEngine(input, options)` accepts:

- `sources`
- `sourceLedger`
- `dataSources`
- pipeline inputs with `documents`

It returns:

- normalized source records
- source class
- point-in-time status
- missing controls
- trust score
- valuation-use permission
- source-level warnings
- aggregate source governance decision

## Source Classes

The engine recognizes:

- `primary_disclosure`: SEC EDGAR, XBRL, 10-K, 10-Q, regulatory filings.
- `normalized_vendor`: FMP, yfinance, and normalized market-data vendors.
- `macro_point_in_time`: ALFRED or explicit vintage macro data.
- `macro_public`: FRED, BLS, EIA, Treasury, or macro sources without explicit vintage metadata.
- `company_ir`: investor relations, presentations, earnings releases.
- `management_transcript`: earnings calls and management transcripts.
- `news_narrative`: news and event narrative feeds.
- `alternative_data`: patents, imports/exports, web traffic, app rankings, hiring, tenders, Common Crawl, GDELT, scraped prices, and similar sources.
- `manual_or_unknown`: undefined or manual sources.

## Alternative Data Rule

The guide is explicit:

```text
Never allow an alternative source to directly feed valuation without:
1. economic definition
2. history
3. availability date
4. methodology-change control
5. validation against real outcomes
```

This engine enforces that rule.

If an alternative source is used for valuation and lacks any required control, it becomes:

```text
valuationUse: restricted
decision: source_governance_restricted
```

The belief pipeline then emits:

```text
source_governance_review
```

## Point-In-Time Macro

Macro data without vintage metadata is not automatically rejected, but it is marked:

```text
valuationUse: allowed_with_vintage_warning
```

The warning exists because backtests can leak revised data if macro observations are not point-in-time.

## Decisions

- `source_governance_pending`: no source records supplied.
- `source_governance_usable`: no restricted valuation sources.
- `source_governance_watch`: weak point-in-time coverage or low average trust.
- `source_governance_restricted`: at least one valuation source lacks required controls.

## Pipeline Role

Source Governance runs before evidence extraction affects the rest of the pipeline.

It does not stop SEC, FMP, IR, or transcript evidence from being useful when metadata is incomplete. Instead, it records caveats.

It is strict where the guide is strict: alternative data cannot directly affect valuation without definition, history, availability date, methodology controls, and validation.

## Why This Layer Matters

AURORA can become more ambitious only if it becomes more disciplined about sources.

The product should be able to use alternative data eventually, but not as magic dust. A source must earn the right to influence valuation.
