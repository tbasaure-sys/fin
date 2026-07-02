import fs from "node:fs";
import path from "node:path";

const defaultInput = "C:/Users/T14 Ultra 7/Downloads/ddpm_market_simulator_factor_pro_v7_deployment_contract_colab (1).ipynb";
const inputPath = process.argv[2] || defaultInput;
const outputPath = process.argv[3] || "notebooks/ddpm_market_simulator_factor_pro_v8_hardened_colab.ipynb";

function source(cell) {
  return Array.isArray(cell.source) ? cell.source.join("") : String(cell.source || "");
}

function setSource(cell, text) {
  cell.source = String(text).split(/(?<=\n)/);
  if (cell.cell_type === "code") {
    cell.execution_count = null;
    cell.outputs = [];
  }
}

function markdown(text) {
  return {
    cell_type: "markdown",
    metadata: {},
    source: String(text).split(/(?<=\n)/),
  };
}

function replaceOnce(text, needle, replacement, label) {
  if (!text.includes(needle)) {
    throw new Error(`Could not find ${label || needle.slice(0, 80)}`);
  }
  return text.replace(needle, replacement);
}

const notebook = JSON.parse(fs.readFileSync(inputPath, "utf8"));
notebook.cells.forEach((cell) => {
  if (cell.cell_type === "code") {
    cell.execution_count = null;
    cell.outputs = [];
  }
});

setSource(notebook.cells[0], "# Factor-DDPM Market Simulator Colab V8\n");
notebook.cells.splice(
  1,
  0,
  markdown(String.raw`## V8 hardening contract

This notebook is the methodological break from v7. It keeps the v7 factor-DDPM spine, but removes the two behaviors that made the old stress book too easy to pass:

- no deterministic full-window severe clamp;
- no default q0.001/q0.999 tail winsorization;
- no checkpoint selection on noise MSE alone;
- no promotion unless DDPM beats Gaussian, same-stack Gaussian, t-copula, filtered historical simulation, and bootstrap baselines on tail/correlation gates;
- no overlapping-window MMD headline;
- factor scenario bank export is first-class, so the endpoint can serve real sampled factors without a GPU.
`),
);

let config = source(notebook.cells[7]);
config = config.replace('MODEL_FAMILY = "factor_ddpm_v7_deployment_contract"', 'MODEL_FAMILY = "factor_ddpm_v8_tail_hardened_factor_bank"');
config = config.replace("FACTOR_PCA_COMPONENTS = 96", "FACTOR_PCA_COMPONENTS = 32");
config = config.replace("FACTOR_CALIBRATION_ALPHA = 0.90", "FACTOR_CALIBRATION_ALPHA = 0.45");
config = config.replace("FACTOR_CALIBRATION_SHRINKAGE = 0.10", "FACTOR_CALIBRATION_SHRINKAGE = 0.20");
config = config.replace("CHOLESKY_CALIBRATION_ALPHA = 0.95", "CHOLESKY_CALIBRATION_ALPHA = 0.40");
config = config.replace("CHOLESKY_SHRINKAGE = 0.04", "CHOLESKY_SHRINKAGE = 0.10");
config = config.replace("MMD_RATIO_MAX_RESEARCH = 2.00", "MMD_RATIO_MAX_RESEARCH = 1.05");
config = replaceOnce(
  config,
  'ENDPOINT_SMALL_REQUEST_POLICY = "reject_or_aggregate"\n',
  String.raw`ENDPOINT_SMALL_REQUEST_POLICY = "reject_or_aggregate"

# V8 methodology hardening.
RETURN_CLIP_MODE = "bad_print_only"  #@param ["none", "bad_print_only", "wide_quantile"]
RETURN_CLIP_LOWER_Q = 0.0001
RETURN_CLIP_UPPER_Q = 0.9999
BAD_PRINT_ABS_RETURN_LIMIT = 0.80
EVAL_WINDOW_STRIDE = WINDOW_SIZE
CHECKPOINT_SELECTION_METRIC = "valid_tail_composite"
VALID_SELECTION_MAX_BATCHES = 30
STRESS_SHOCK_MODE = "sparse_distribution_shift"  # no full-window deterministic floor
SEVERE_SHOCK_MIN_DAYS = 2
SEVERE_SHOCK_MAX_DAYS = 5
SEVERE_MARKET_LOCATION_SHIFT_Q = 0.01
SEVERE_MARKET_SCALE_BOOST = 1.35
BASELINE_T_COPULA_DF = 5
FHS_EWMA_LAMBDA = 0.94
PORTFOLIO_TEST_COUNT = 32
PORTFOLIO_CONCENTRATION_LEVELS = "0.25,0.40,0.60"
EXPORT_FACTOR_SCENARIO_BANK = True
FACTOR_BANK_DTYPE = "float16"
FACTOR_BANK_REGIME_NAME = "crisis"
SURVIVORSHIP_DISCLOSURE = "current_sp500_constituents_only_unless_pit_universe_supplied"
`,
  "endpoint policy block",
);
config = replaceOnce(
  config,
  "    endpoint_small_request_policy=ENDPOINT_SMALL_REQUEST_POLICY,\n",
  String.raw`    endpoint_small_request_policy=ENDPOINT_SMALL_REQUEST_POLICY,
    return_clip_mode=RETURN_CLIP_MODE,
    return_clip_lower_q=RETURN_CLIP_LOWER_Q,
    return_clip_upper_q=RETURN_CLIP_UPPER_Q,
    bad_print_abs_return_limit=BAD_PRINT_ABS_RETURN_LIMIT,
    eval_window_stride=EVAL_WINDOW_STRIDE,
    checkpoint_selection_metric=CHECKPOINT_SELECTION_METRIC,
    valid_selection_max_batches=VALID_SELECTION_MAX_BATCHES,
    stress_shock_mode=STRESS_SHOCK_MODE,
    severe_shock_min_days=SEVERE_SHOCK_MIN_DAYS,
    severe_shock_max_days=SEVERE_SHOCK_MAX_DAYS,
    severe_market_location_shift_q=SEVERE_MARKET_LOCATION_SHIFT_Q,
    severe_market_scale_boost=SEVERE_MARKET_SCALE_BOOST,
    baseline_t_copula_df=BASELINE_T_COPULA_DF,
    fhs_ewma_lambda=FHS_EWMA_LAMBDA,
    portfolio_test_count=PORTFOLIO_TEST_COUNT,
    portfolio_concentration_levels=PORTFOLIO_CONCENTRATION_LEVELS,
    export_factor_scenario_bank=EXPORT_FACTOR_SCENARIO_BANK,
    factor_bank_dtype=FACTOR_BANK_DTYPE,
    factor_bank_regime_name=FACTOR_BANK_REGIME_NAME,
    survivorship_disclosure=SURVIVORSHIP_DISCLOSURE,
`,
  "CONFIG v8 fields",
);
setSource(notebook.cells[7], config);

let returnsCell = source(notebook.cells[13]);
returnsCell = replaceOnce(
  returnsCell,
  String.raw`    returns = returns[keep].ffill(limit=5).dropna(axis=0, how="any")
    lower = returns.quantile(0.001)
    upper = returns.quantile(0.999)
    returns = returns.clip(lower=lower, upper=upper, axis=1)
    returns = returns.astype("float32")
`,
  String.raw`    returns = returns[keep].ffill(limit=5).dropna(axis=0, how="any")

    # V8: preserve real crash tails by default. Only obvious bad prints are neutralized.
    tail_audit = {
        "mode": RETURN_CLIP_MODE,
        "pre_clip_min": float(np.nanmin(returns.values)),
        "pre_clip_max": float(np.nanmax(returns.values)),
        "bad_print_abs_limit": float(BAD_PRINT_ABS_RETURN_LIMIT),
    }
    if RETURN_CLIP_MODE == "wide_quantile":
        lower = returns.quantile(RETURN_CLIP_LOWER_Q)
        upper = returns.quantile(RETURN_CLIP_UPPER_Q)
        returns = returns.clip(lower=lower, upper=upper, axis=1)
        tail_audit["quantile_clip"] = [float(RETURN_CLIP_LOWER_Q), float(RETURN_CLIP_UPPER_Q)]
    elif RETURN_CLIP_MODE == "bad_print_only":
        bad_print_mask = returns.abs() > BAD_PRINT_ABS_RETURN_LIMIT
        tail_audit["bad_print_values_replaced"] = int(bad_print_mask.sum().sum())
        returns = returns.mask(bad_print_mask).ffill(limit=1).dropna(axis=0, how="any")
    elif RETURN_CLIP_MODE != "none":
        raise ValueError(f"Unknown RETURN_CLIP_MODE={RETURN_CLIP_MODE}")
    tail_audit["post_clip_min"] = float(np.nanmin(returns.values))
    tail_audit["post_clip_max"] = float(np.nanmax(returns.values))
    CONFIG["tail_preservation_audit"] = tail_audit
    returns = returns.astype("float32")
`,
  "return clipping block",
);
returnsCell += '\nprint("Tail preservation audit:", json.dumps(CONFIG.get("tail_preservation_audit", {}), indent=2))\n';
setSource(notebook.cells[13], returnsCell);

let trainCell = source(notebook.cells[23]);
trainCell = replaceOnce(
  trainCell,
  String.raw`@torch.no_grad()
def eval_loss(loader, use_ema=True, max_batches=30):
    net = ema_model if use_ema else model
    net.eval()
    losses = []
    for i, (x0, macro, regime) in enumerate(loader):
        if i >= max_batches:
            break
        x0 = x0.to(DEVICE)
        macro = macro.to(DEVICE)
        regime = regime.to(DEVICE)
        batch = x0.shape[0]
        t = torch.randint(0, N_TIMESTEPS, (batch,), device=DEVICE).long()
        noise = torch.randn_like(x0)
        x_t = q_sample(x0, t, noise)
        pred = net(x_t, t, regime, macro)
        loss = ((pred - noise) ** 2).mean()
        if torch.isfinite(loss):
            losses.append(float(loss.cpu()))
    return float(np.mean(losses)) if losses else np.nan
`,
  String.raw`@torch.no_grad()
def eval_validation_metrics(loader, use_ema=True, max_batches=VALID_SELECTION_MAX_BATCHES):
    net = ema_model if use_ema else model
    net.eval()
    rows = []
    for i, (x0, macro, regime) in enumerate(loader):
        if i >= max_batches:
            break
        x0 = x0.to(DEVICE)
        macro = macro.to(DEVICE)
        regime = regime.to(DEVICE)
        batch = x0.shape[0]
        t = torch.randint(0, N_TIMESTEPS, (batch,), device=DEVICE).long()
        noise = torch.randn_like(x0)
        x_t = q_sample(x0, t, noise)
        pred = net(x_t, t, regime, macro)
        loss_noise = ((pred - noise) ** 2).mean()
        pred_x0 = (x_t - extract(SCHEDULE["sqrt_one_minus_alphas_cumprod"], t, x_t.shape) * pred) / extract(SCHEDULE["sqrt_alphas_cumprod"], t, x_t.shape).clamp_min(1e-5)
        pred_x0 = pred_x0.clamp(-12, 12)
        asset_pred = factor_norm_to_asset_mean_torch(pred_x0)
        asset_true = factor_norm_to_asset_mean_torch(x0)
        loss_factor_corr = F.mse_loss(batch_corr(pred_x0), batch_corr(x0))
        loss_asset_corr = projected_asset_corr_loss(asset_pred, asset_true)
        loss_tail = portfolio_tail_loss(asset_pred, asset_true)
        selection = (
            loss_noise.float()
            + FACTOR_CORR_LOSS_WEIGHT * loss_factor_corr.float()
            + ASSET_CORR_LOSS_WEIGHT * loss_asset_corr.float()
            + PORTFOLIO_TAIL_LOSS_WEIGHT * loss_tail.float()
        )
        if torch.isfinite(selection):
            rows.append({
                "valid_noise_mse": float(loss_noise.cpu()),
                "valid_factor_corr_loss": float(loss_factor_corr.cpu()),
                "valid_asset_corr_loss": float(loss_asset_corr.cpu()),
                "valid_portfolio_tail_loss": float(loss_tail.cpu()),
                "valid_tail_composite": float(selection.cpu()),
            })
    if not rows:
        return {
            "valid_noise_mse": np.nan,
            "valid_factor_corr_loss": np.nan,
            "valid_asset_corr_loss": np.nan,
            "valid_portfolio_tail_loss": np.nan,
            "valid_tail_composite": np.nan,
        }
    return {key: float(np.mean([row[key] for row in rows])) for key in rows[0]}
`,
  "eval_loss function",
);
trainCell = replaceOnce(
  trainCell,
  "    valid = eval_loss(valid_loader, use_ema=True)\n",
  '    valid_metrics = eval_validation_metrics(valid_loader, use_ema=True)\n    valid = valid_metrics[CHECKPOINT_SELECTION_METRIC]\n',
  "valid selection call",
);
trainCell = replaceOnce(
  trainCell,
  '        "valid_noise_mse": valid,\n',
  String.raw`        "valid_selection_metric": CHECKPOINT_SELECTION_METRIC,
        "valid_selection_score": valid,
        "valid_noise_mse": valid_metrics.get("valid_noise_mse", np.nan),
        "valid_factor_corr_loss": valid_metrics.get("valid_factor_corr_loss", np.nan),
        "valid_asset_corr_loss": valid_metrics.get("valid_asset_corr_loss", np.nan),
        "valid_portfolio_tail_loss": valid_metrics.get("valid_portfolio_tail_loss", np.nan),
        "valid_tail_composite": valid_metrics.get("valid_tail_composite", np.nan),
`,
  "row validation metrics",
);
trainCell = trainCell.replace('"best_valid": best_valid,', '"best_valid": best_valid,\n            "best_selection_metric": CHECKPOINT_SELECTION_METRIC,');
setSource(notebook.cells[23], trainCell);

let samplerCell = source(notebook.cells[26]);
samplerCell = replaceOnce(
  samplerCell,
  String.raw`def macro_condition_window(ds, target_regime, seed=SEED):
    idxs = [i for i in range(len(ds)) if int(ds[i][2]) == int(target_regime)]
    if len(idxs) < 16:
        idxs = list(range(len(ds)))
    rng = np.random.default_rng(seed)
    if len(idxs) > 512:
        idxs = rng.choice(idxs, size=512, replace=False).tolist()
    macro = torch.stack([ds[i][1] for i in idxs])
    return macro.mean(dim=0)
`,
  String.raw`def macro_condition_window(ds, target_regime, seed=SEED):
    # V8: sample a real macro trajectory instead of averaging dynamic windows into a static template.
    idxs = [i for i in range(len(ds)) if int(ds[i][2]) == int(target_regime)]
    if len(idxs) < 16:
        idxs = list(range(len(ds)))
    rng = np.random.default_rng(seed)
    chosen = int(rng.choice(idxs))
    CONFIG["macro_condition_source"] = "sampled_train_macro_window"
    CONFIG["macro_condition_window_end"] = str(ds.window_end_dates[chosen]) if hasattr(ds, "window_end_dates") else None
    return ds[chosen][1]
`,
  "macro condition function",
);
samplerCell = replaceOnce(
  samplerCell,
  String.raw`    # Crisis capsule: only the most severe sleeve gets a train-only left-tail market shock.
    # This does not use validation/COVID labels; it extrapolates from the pre-cutoff crisis regime.
    severe = m >= float(np.max(multipliers))
    if severe.any():
        train_market = train_factor.iloc[:, 0].astype(np.float32).values
        q001, q005 = np.quantile(train_market, [0.001, 0.005])
        shock_floor = min(float(q001), float(q005) * 1.35)
        f[severe, :, 0] = np.minimum(f[severe, :, 0], shock_floor).astype(np.float32)
    return f, m
`,
  String.raw`    # V8 crisis capsule: sparse location/scale stress, never a full-window deterministic floor.
    severe = m >= float(np.max(multipliers))
    if severe.any():
        rng = np.random.default_rng(seed + 999)
        train_market = train_factor.iloc[:, 0].astype(np.float32).values
        q_shift = float(np.quantile(train_market, SEVERE_MARKET_LOCATION_SHIFT_Q))
        for row in np.where(severe)[0]:
            n_days = int(rng.integers(SEVERE_SHOCK_MIN_DAYS, SEVERE_SHOCK_MAX_DAYS + 1))
            n_days = int(np.clip(n_days, 1, f.shape[1]))
            shock_days = rng.choice(f.shape[1], size=n_days, replace=False)
            local = f[row, shock_days, 0]
            centered = local - np.median(train_market)
            f[row, shock_days, 0] = q_shift + centered * SEVERE_MARKET_SCALE_BOOST
    CONFIG["stress_full_window_floor_applied"] = False
    CONFIG["stress_shock_mode_applied"] = STRESS_SHOCK_MODE
    return f, m
`,
  "severe stress clamp",
);
setSource(notebook.cells[26], samplerCell);

let evalCell = source(notebook.cells[28]);
evalCell = replaceOnce(
  evalCell,
  String.raw`def historical_bootstrap_windows(reference, n_samples, seed=SEED):
    arr = to_numpy(reference)
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(arr), size=n_samples, replace=True)
    return arr[idx]
`,
  String.raw`def historical_bootstrap_windows(reference, n_samples, seed=SEED):
    arr = to_numpy(reference)
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(arr), size=n_samples, replace=True)
    return arr[idx]

def strided_windows_np(windows, stride=WINDOW_SIZE):
    arr = to_numpy(windows)
    stride = max(1, int(stride))
    return arr[::stride]
`,
  "historical bootstrap insertion",
);
evalCell = replaceOnce(
  evalCell,
  String.raw`def gaussian_cov_from_windows(reference, n_samples, window_size, seed=SEED):
    rng = np.random.default_rng(seed)
    ref = to_numpy(reference).astype(np.float32)
    X = ref.reshape(-1, ref.shape[-1])
    mu = X.mean(axis=0)
    cov = np.cov(X.T)
    diag = np.diag(np.diag(cov))
    cov = 0.95 * cov + 0.05 * diag
    jitter = 1e-6 * np.eye(cov.shape[0])
    L = np.linalg.cholesky(cov + jitter)
    z = rng.normal(size=(n_samples, window_size, ref.shape[-1])).astype(np.float32)
    return z @ L.T + mu
`,
  String.raw`def gaussian_cov_from_windows(reference, n_samples, window_size, seed=SEED):
    rng = np.random.default_rng(seed)
    ref = to_numpy(reference).astype(np.float32)
    X = ref.reshape(-1, ref.shape[-1])
    mu = X.mean(axis=0)
    cov = np.cov(X.T)
    diag = np.diag(np.diag(cov))
    cov = 0.95 * cov + 0.05 * diag
    jitter = 1e-6 * np.eye(cov.shape[0])
    L = np.linalg.cholesky(cov + jitter)
    z = rng.normal(size=(n_samples, window_size, ref.shape[-1])).astype(np.float32)
    return z @ L.T + mu

def t_copula_from_windows(reference, n_samples, window_size, df=BASELINE_T_COPULA_DF, seed=SEED):
    rng = np.random.default_rng(seed)
    ref = to_numpy(reference).astype(np.float32)
    X = ref.reshape(-1, ref.shape[-1])
    mu = X.mean(axis=0)
    cov = np.cov(X.T)
    diag = np.diag(np.diag(cov))
    cov = 0.95 * cov + 0.05 * diag
    L = np.linalg.cholesky(cov + 1e-6 * np.eye(cov.shape[0]))
    z = rng.normal(size=(n_samples, window_size, ref.shape[-1])).astype(np.float32)
    chi = rng.chisquare(df, size=(n_samples, window_size, 1)).astype(np.float32)
    return (z @ L.T) / np.sqrt(np.maximum(chi / df, 1e-6)) + mu

def filtered_historical_simulation(reference, n_samples, seed=SEED):
    rng = np.random.default_rng(seed)
    ref = to_numpy(reference).astype(np.float32)
    flat = ref.reshape(-1, ref.shape[-1])
    lam = float(FHS_EWMA_LAMBDA)
    vol = np.zeros_like(flat)
    vol[0] = np.nanstd(flat, axis=0) + 1e-6
    for i in range(1, len(flat)):
        vol[i] = np.sqrt(lam * vol[i - 1] ** 2 + (1 - lam) * flat[i - 1] ** 2) + 1e-6
    resid = flat / vol
    idx = rng.choice(len(resid), size=n_samples * ref.shape[1], replace=True)
    sampled = resid[idx].reshape(n_samples, ref.shape[1], ref.shape[2])
    vol_idx = rng.choice(len(vol), size=n_samples * ref.shape[1], replace=True)
    sampled_vol = vol[vol_idx].reshape(n_samples, ref.shape[1], ref.shape[2])
    return sampled * sampled_vol

def gaussian_factor_same_stack(n_samples, seed=SEED):
    raw = np.asarray(target_factor_raw, dtype=np.float32)
    flat = raw.reshape(-1, raw.shape[-1])
    rng = np.random.default_rng(seed)
    mu = flat.mean(axis=0)
    cov = np.cov(flat.T)
    diag = np.diag(np.diag(cov))
    cov = 0.95 * cov + 0.05 * diag
    L = np.linalg.cholesky(cov + 1e-6 * np.eye(cov.shape[0]))
    z = rng.normal(size=(n_samples, WINDOW_SIZE, raw.shape[-1])).astype(np.float32)
    factor_raw = z @ L.T + mu
    factor_raw = calibrate_factor_windows(factor_raw, target_factor_raw)
    returns, _ = reconstruct_asset_windows_from_factors(factor_raw, add_residual=True, stress=False, seed=seed + 17)
    return to_numpy(returns)
`,
  "baseline functions",
);
evalCell = replaceOnce(
  evalCell,
  String.raw`if len(real_valid_target_returns) >= 64:
    real_eval_returns = real_valid_target_returns
    eval_reference_name = "valid_target_regime"
    baseline_train_reference = train_target_reference
else:
    real_eval_returns = real_valid_returns
    eval_reference_name = "valid_all_regimes_fallback"
    baseline_train_reference = train_all_reference

n_base = min(BASELINE_SCENARIOS, len(real_eval_returns), len(synthetic_returns), len(synthetic_returns_base), len(baseline_train_reference))
`,
  String.raw`if len(real_valid_target_returns) >= 64:
    real_eval_returns = real_valid_target_returns
    eval_reference_name = "valid_target_regime"
    baseline_train_reference = train_target_reference
else:
    real_eval_returns = real_valid_returns
    eval_reference_name = "valid_all_regimes_fallback"
    baseline_train_reference = train_all_reference

MIN_ROBUST_EVAL_WINDOWS = 64
ABS_MIN_EVAL_WINDOWS = 16
strict_nonoverlap_eval = strided_windows_np(real_eval_returns, WINDOW_SIZE)
CONFIG["eval_nonoverlap_windows_available"] = int(len(strict_nonoverlap_eval))
CONFIG["eval_nonoverlap_min_required"] = int(MIN_ROBUST_EVAL_WINDOWS)
CONFIG["eval_nonoverlap_gate_ok"] = bool(len(strict_nonoverlap_eval) >= MIN_ROBUST_EVAL_WINDOWS)

real_eval_returns_for_metrics = strided_windows_np(real_eval_returns, EVAL_WINDOW_STRIDE)
metric_stride = int(EVAL_WINDOW_STRIDE)
if len(real_eval_returns_for_metrics) < MIN_ROBUST_EVAL_WINDOWS:
    stride_candidates = [
        max(1, WINDOW_SIZE // 2),
        max(1, WINDOW_SIZE // 3),
        max(1, WINDOW_SIZE // 5),
        max(1, WINDOW_SIZE // 10),
        1,
    ]
    best_stride = metric_stride
    best_reference = real_eval_returns_for_metrics
    for candidate_stride in stride_candidates:
        candidate_reference = strided_windows_np(real_eval_returns, candidate_stride)
        if len(candidate_reference) > len(best_reference):
            best_stride = int(candidate_stride)
            best_reference = candidate_reference
        if len(candidate_reference) >= MIN_ROBUST_EVAL_WINDOWS:
            break
    real_eval_returns_for_metrics = best_reference
    metric_stride = best_stride

CONFIG["eval_window_stride_applied"] = int(metric_stride)
CONFIG["eval_windows_are_overlapping"] = bool(metric_stride < WINDOW_SIZE)
CONFIG["eval_metric_windows_available"] = int(len(real_eval_returns_for_metrics))
CONFIG["eval_metric_reference_note"] = (
    "non_overlapping_headline"
    if metric_stride >= WINDOW_SIZE
    else "adaptive_stride_diagnostics_only_nonoverlap_gate_fails"
)
n_base = min(BASELINE_SCENARIOS, len(real_eval_returns_for_metrics), len(synthetic_returns), len(synthetic_returns_base), len(baseline_train_reference))
CONFIG["eval_metric_windows_used"] = int(n_base)
CONFIG["eval_metric_sample_size_ok"] = bool(n_base >= MIN_ROBUST_EVAL_WINDOWS)
`,
  "eval reference stride",
);
evalCell = replaceOnce(
  evalCell,
  String.raw`if n_base < 64:
    raise RuntimeError(f"Too few evaluation windows for robust metrics: {n_base}")
`,
  String.raw`if n_base < ABS_MIN_EVAL_WINDOWS:
    raise RuntimeError(f"Too few evaluation windows even for diagnostic metrics: {n_base}")
if n_base < MIN_ROBUST_EVAL_WINDOWS:
    print(f"WARNING: only {n_base} eval windows available. Continuing for diagnostics; endpoint promotion gate must fail.")
`,
  "low eval window guard",
);
evalCell = replaceOnce(
  evalCell,
  String.raw`bootstrap_returns = historical_bootstrap_windows(baseline_train_reference, n_base, seed=SEED + 7)
gaussian_returns = gaussian_cov_from_windows(baseline_train_reference, n_base, WINDOW_SIZE, seed=SEED + 11)

model_samples = {
    "factor_ddpm_stress": sample_windows_np(synthetic_returns, n_base, PRIMARY_EVAL_SUBSAMPLE_SEED),
    "factor_ddpm_base": sample_windows_np(synthetic_returns_base, n_base, PRIMARY_EVAL_SUBSAMPLE_SEED),
    "historical_bootstrap_train": bootstrap_returns,
    "gaussian_cov_train": gaussian_returns,
}
`,
  String.raw`bootstrap_returns = historical_bootstrap_windows(baseline_train_reference, n_base, seed=SEED + 7)
gaussian_returns = gaussian_cov_from_windows(baseline_train_reference, n_base, WINDOW_SIZE, seed=SEED + 11)
t_copula_returns = t_copula_from_windows(baseline_train_reference, n_base, WINDOW_SIZE, seed=SEED + 13)
fhs_returns = filtered_historical_simulation(baseline_train_reference, n_base, seed=SEED + 19)
same_stack_gaussian_returns = gaussian_factor_same_stack(n_base, seed=SEED + 23)

model_samples = {
    "factor_ddpm_stress": sample_windows_np(synthetic_returns, n_base, PRIMARY_EVAL_SUBSAMPLE_SEED),
    "factor_ddpm_base": sample_windows_np(synthetic_returns_base, n_base, PRIMARY_EVAL_SUBSAMPLE_SEED),
    "historical_bootstrap_train": bootstrap_returns,
    "gaussian_cov_train": gaussian_returns,
    "t_copula_train": t_copula_returns,
    "filtered_historical_simulation_train": fhs_returns,
    "gaussian_factor_same_calibration_stack": same_stack_gaussian_returns,
}
`,
  "baseline model samples",
);
evalCell = evalCell.replaceAll("real_eval_returns[:n_base]", "real_eval_returns_for_metrics[:n_base]");
evalCell = replaceOnce(
  evalCell,
  "display(metrics_table.T)\n",
  String.raw`display(metrics_table)

def make_portfolio_weight_suite(n_assets, seed=SEED):
    rng = np.random.default_rng(seed)
    rows = [("equal_weight", np.ones(n_assets) / n_assets)]
    for i in range(PORTFOLIO_TEST_COUNT):
        rows.append((f"random_dirichlet_{i+1:02d}", rng.dirichlet(np.ones(n_assets))))
    for level in parse_float_list(PORTFOLIO_CONCENTRATION_LEVELS):
        w = np.ones(n_assets) * ((1 - level) / max(n_assets - 1, 1))
        w[int(rng.integers(0, n_assets))] = level
        rows.append((f"single_name_{float(level):.0%}", w / w.sum()))
    return rows

portfolio_suite_rows = []
for portfolio_name, portfolio_weights in make_portfolio_weight_suite(N_ASSETS_ACTUAL):
    for model_name, samples in model_samples.items():
        port, daily = portfolio_terminal_returns(samples, portfolio_weights)
        var5_suite = np.quantile(port, 0.05)
        var1_suite = np.quantile(port, 0.01)
        portfolio_suite_rows.append({
            "portfolio": portfolio_name,
            "model": model_name,
            "var5": float(var5_suite),
            "var1": float(var1_suite),
            "cvar5": float(port[port <= var5_suite].mean()),
            "probability_drawdown_10pct": float((max_drawdown(daily) <= -0.10).mean()),
        })
portfolio_suite_table = pd.DataFrame(portfolio_suite_rows)
display(portfolio_suite_table.head(20))
display(metrics_table.T)
`,
  "portfolio suite display",
);
setSource(notebook.cells[28], evalCell);

let gateCell = source(notebook.cells[29]);
gateCell = gateCell.replace(
  '"beats_gaussian_corr": bool(metrics_table.loc[candidate_model, "corr_mae"] < metrics_table.loc["gaussian_cov_train", "corr_mae"]),',
  String.raw`"beats_gaussian_corr": bool(metrics_table.loc[candidate_model, "corr_mae"] < metrics_table.loc["gaussian_cov_train", "corr_mae"]),
    "beats_t_copula_mmd": bool(metrics_table.loc[candidate_model, "mmd_rbf_projected_multi_mean"] < metrics_table.loc["t_copula_train", "mmd_rbf_projected_multi_mean"]),
    "beats_fhs_mmd": bool(metrics_table.loc[candidate_model, "mmd_rbf_projected_multi_mean"] < metrics_table.loc["filtered_historical_simulation_train", "mmd_rbf_projected_multi_mean"]),
    "beats_same_stack_gaussian_mmd": bool(metrics_table.loc[candidate_model, "mmd_rbf_projected_multi_mean"] < metrics_table.loc["gaussian_factor_same_calibration_stack", "mmd_rbf_projected_multi_mean"]),`,
);
gateCell = gateCell.replace(
  '"no_validation_used_for_guidance_or_cholesky": bool(not CONFIG.get("guidance_uses_validation", True) and not CONFIG.get("cholesky_uses_validation", True)),',
  String.raw`"no_validation_used_for_guidance_or_cholesky": bool(not CONFIG.get("guidance_uses_validation", True) and not CONFIG.get("cholesky_uses_validation", True)),
    "no_full_window_stress_floor": bool(CONFIG.get("stress_full_window_floor_applied") is False),
    "non_overlapping_eval_windows": bool(CONFIG.get("eval_nonoverlap_gate_ok", False)),
    "eval_metric_sample_size_ok": bool(CONFIG.get("eval_metric_sample_size_ok", False)),`,
);
gateCell = gateCell.replace(
  String.raw`scorecard["research_champion"] = bool(
    scorecard["mmd_ratio_within_research_gate"]
    and scorecard["corr_near_gaussian"]
    and scorecard["corr_fidelity_ge_0_80"]`,
  String.raw`scorecard["research_champion"] = bool(
    scorecard["mmd_ratio_within_research_gate"]
    and scorecard["beats_gaussian_mmd_multi"]
    and scorecard["beats_t_copula_mmd"]
    and scorecard["beats_fhs_mmd"]
    and scorecard["beats_same_stack_gaussian_mmd"]
    and scorecard["corr_near_gaussian"]
    and scorecard["corr_fidelity_ge_0_80"]
    and scorecard["no_full_window_stress_floor"]
    and scorecard["non_overlapping_eval_windows"]
    and scorecard["eval_metric_sample_size_ok"]`,
);
setSource(notebook.cells[29], gateCell);

let saveCell = source(notebook.cells[31]);
saveCell = replaceOnce(
  saveCell,
  "if \"synthetic_subsample_sensitivity\" in globals():\n    synthetic_subsample_sensitivity.to_csv(run_dir / \"synthetic_subsample_sensitivity.csv\", index=False)\n",
  String.raw`if "synthetic_subsample_sensitivity" in globals():
    synthetic_subsample_sensitivity.to_csv(run_dir / "synthetic_subsample_sensitivity.csv", index=False)
if "portfolio_suite_table" in globals():
    portfolio_suite_table.to_csv(run_dir / "portfolio_suite_table.csv", index=False)
`,
  "portfolio suite save",
);
saveCell = replaceOnce(
  saveCell,
  String.raw`np.savez_compressed(run_dir / "synthetic_scenarios.npz", **scenario_payload)
`,
  String.raw`np.savez_compressed(run_dir / "synthetic_scenarios.npz", **scenario_payload)

factor_bank_path = None
if EXPORT_FACTOR_SCENARIO_BANK:
    bank_dtype = np.float16 if FACTOR_BANK_DTYPE == "float16" else np.float32
    factor_bank_payload = {
        "factor_paths_base": np.asarray(synthetic_factor_raw, dtype=bank_dtype),
        "factor_paths_stress": np.asarray(synthetic_factor_raw, dtype=bank_dtype),
        "stress_multipliers": np.asarray(stress_multipliers, dtype=np.float32),
        "factor_columns": np.array(FACTOR_COLUMNS),
        "window_size": np.array([WINDOW_SIZE]),
        "target_regime": np.array([TARGET_REGIME]),
        "run_id": np.array([run_id]),
        "shock_mode": np.array([STRESS_SHOCK_MODE]),
    }
    factor_bank_path = run_dir / "factor_scenario_bank_fp16.npz"
    np.savez_compressed(factor_bank_path, **factor_bank_payload)
`,
  "factor bank save",
);
saveCell = replaceOnce(
  saveCell,
  '    "endpoint_contract_path": str(run_dir / "endpoint_contract.json"),\n',
  '    "endpoint_contract_path": str(run_dir / "endpoint_contract.json"),\n    "factor_scenario_bank_path": str(factor_bank_path) if factor_bank_path else None,\n    "endpoint_serving_strategy": "static_factor_bank_projection",\n',
  "api manifest factor bank",
);
saveCell = replaceOnce(
  saveCell,
  '    "cholesky_calibration_target_source": CONFIG.get("cholesky_calibration_target_source", "unknown"),\n',
  '    "cholesky_calibration_target_source": CONFIG.get("cholesky_calibration_target_source", "unknown"),\n    "stress_shock_mode": CONFIG.get("stress_shock_mode_applied", STRESS_SHOCK_MODE),\n    "stress_full_window_floor_applied": bool(CONFIG.get("stress_full_window_floor_applied", False)),\n    "survivorship_disclosure": SURVIVORSHIP_DISCLOSURE,\n',
  "factor package v8 fields",
);
setSource(notebook.cells[31], saveCell);

notebook.cells.push(markdown(String.raw`## V8 interpretation rule

If the same-stack Gaussian, t-copula, FHS, or bootstrap baselines beat the DDPM on the gated metrics, do not promote the DDPM. The honest product in that case is a calibrated factor stress engine, and the diffusion model remains an offline research candidate.
`));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(notebook, null, 1));
console.log(JSON.stringify({ inputPath, outputPath, cells: notebook.cells.length }, null, 2));
