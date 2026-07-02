# V8 DDPM Run Evidence

Source zip:

`C:\Users\T14 Ultra 7\Downloads\factor_ddpm_run_20260702_035744-20260702T160156Z-3-001.zip`

This folder preserves the small, reviewable artifacts from the July 2, 2026 v8 Colab run. Large `.npz` payloads are intentionally excluded from git:

- `factor_scenario_bank_fp16.npz` is a 25 MB DDPM factor bank.
- `synthetic_scenarios.npz` is a 1 GB DDPM scenario bank.

The exported manifest marks the DDPM candidate as:

- `research_champion: false`
- `ready_for_endpoint: false`

The zip does not contain a same-stack Gaussian champion scenario bank or reconstruction coefficients. It therefore should not replace the served v8 calibrated factor stress-engine contract.
