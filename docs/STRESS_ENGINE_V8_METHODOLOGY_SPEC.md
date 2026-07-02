# Stress Engine V8 Methodology Spec

Purpose: convert the v7 Factor-DDPM research notebook into a defensible v8 stress engine. V7 remains reproducible, but its stress replay is no longer treated as validation because the severe sleeve used a deterministic full-window market-factor floor.

Result: the v8 run rejected DDPM promotion. `gaussian_factor_same_calibration_stack`, filtered historical simulation, and Student-t copula all beat DDPM on multi-seed MMD. The shipped module should therefore use the calibrated factor stress-engine framing, with DDPM retained only as a research challenger.

## Non-Negotiable Fixes

1. Remove default tail winsorization.
   - Default: `RETURN_CLIP_MODE = "bad_print_only"`.
   - Preserve genuine crash observations.
   - Only neutralize obvious bad prints with `BAD_PRINT_ABS_RETURN_LIMIT`.

2. Remove the full-window severe clamp.
   - Replace `np.minimum(f[severe, :, 0], shock_floor)` with sparse shock days and market-factor location/scale shifts.
   - Gate requires `stress_full_window_floor_applied == false`.

3. Prove whether DDPM adds value.
   - Add `gaussian_factor_same_calibration_stack`.
   - This runs Gaussian factor noise through the same calibration, reconstruction, and residual-bootstrap stack.
   - If this matches or beats DDPM, the honest product is calibrated factor bootstrap, not DDPM.

4. Evaluate non-overlapping windows.
   - Use `EVAL_WINDOW_STRIDE = WINDOW_SIZE` for MMD and headline gates.
   - Overlapping-window diagnostics can remain secondary.

5. Add quant baselines.
   - Gaussian covariance.
   - Historical bootstrap.
   - Student-t copula.
   - Filtered historical simulation.
   - Same-stack Gaussian factor ablation.

6. Select checkpoints on tail/composite validation.
   - Selection metric: `valid_tail_composite`.
   - Components: noise MSE, factor correlation, asset correlation, and portfolio tail loss.
   - Noise MSE alone is not a promotion metric.

7. Test more than equal-weight.
   - Random Dirichlet portfolios.
   - Concentrated single-name portfolios.
   - Equal-weight portfolio remains a smoke test only.

8. Export a factor scenario bank.
   - `factor_scenario_bank_fp16.npz`.
   - Endpoint path should project stored factor paths through user-specific loadings instead of serving a JavaScript Gaussian proxy.

## Promotion Rule

V8 is not endpoint-ready unless all are true:

- no full-window stress floor;
- non-overlapping eval windows;
- DDPM beats Gaussian covariance on multi-seed MMD;
- DDPM beats Student-t copula on multi-seed MMD;
- DDPM beats filtered historical simulation on multi-seed MMD;
- DDPM beats same-stack Gaussian calibration ablation;
- correlation MAE is near or better than Gaussian;
- tail metrics pass random and concentrated portfolio suites;
- VaR exception tests are added and pass.

If these fail, the correct product label is `Stress Engine`, not `Factor-DDPM`.

In the current v8 run, these failed. The endpoint/product contract has been updated to `v8_calibrated_factor_stress_engine`.

## Generated Notebook

`notebooks/ddpm_market_simulator_factor_pro_v8_hardened_colab.ipynb`

Generated from the v7 notebook using:

```bash
node scripts/build_ddpm_v8_notebook.mjs
```

The generator preserves v7 structure and applies targeted methodology hardening.
