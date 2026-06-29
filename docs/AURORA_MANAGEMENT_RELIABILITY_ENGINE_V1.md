# AURORA Management Reliability Engine v1

This layer implements the guide's quantitative management model.

It does not create a vague "management quality score." It builds an observable reliability distribution from guidance history.

## Function

`buildAuroraManagementReliabilityEngine(input, options)` accepts:

- `managementGuidance`
- `guidanceRecords`
- `guidance`
- `management.guidance`

Each record can include:

- `date`
- `kpi`
- `low`
- `high`
- `midpoint`
- `horizon`
- `explanation`
- `revisionDirection`
- `actual`
- `actualDate`
- `regime`
- `team`

## Formula

For scored guidance:

```text
GuidanceError = (Actual - MidpointGuidance) / Scale
```

Scale defaults to the largest useful denominator among midpoint, actual, or guidance-range width.

## Outputs

The engine reports:

- guidance hit rate
- bias
- mean absolute error
- precision
- underpromise / overpromise rate
- revision frequency
- downward revision share
- downturn behavior
- calibration by KPI
- calibration by team
- credibility posterior
- adjustment recommendations

## Posterior Use

The management posterior can inform:

- forecast distribution width
- probability haircut on guidance-driven scenarios
- acquisition execution prior
- buyback discipline prior
- dilution risk adjustment

This follows the guide's instruction that management reliability should affect probability and uncertainty, not become a decorative score.

## Decisions

- `management_reliability_pending`: no scored guidance outcomes yet.
- `management_reliability_usable`: guidance history is accurate enough to use.
- `management_reliability_mixed`: use guidance with haircuts.
- `management_reliability_poor`: guidance history requires review and probability haircut.

## Pipeline Role

The belief pipeline includes management reliability but keeps it non-blocking unless supplied history is poor. In that case it can emit:

```text
management_reliability_review
```

