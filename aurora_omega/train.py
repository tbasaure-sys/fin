from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import json
import numpy as np
import torch
from sklearn.metrics import mean_absolute_error
from torch import nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

from .data import LENS_NAMES, OmegaBundle
from .model import AURORAOmega


@dataclass
class TrainConfig:
    epochs: int = 40
    batch_size: int = 256
    lr: float = 1e-3
    d_model: int = 128
    device: str = "auto"
    seed: int = 7


def _device(name: str) -> torch.device:
    if name == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return torch.device(name)


def omega_loss(out: dict[str, torch.Tensor], batch: dict[str, torch.Tensor]) -> tuple[torch.Tensor, dict[str, float]]:
    lens_loss = F.smooth_l1_loss(out["lens_outputs"], batch["lens_targets"])
    return_error = F.smooth_l1_loss(out["return_outputs"], batch["return_targets"], reduction="none")
    return_loss = (return_error * batch["return_mask"]).sum() / batch["return_mask"].sum().clamp_min(1.0)
    omega_3y_error = F.smooth_l1_loss(out["omega_return"], batch["return_targets"][:, 1], reduction="none")
    omega_3y_loss = (omega_3y_error * batch["return_mask"][:, 1]).sum() / batch["return_mask"][:, 1].sum().clamp_min(1.0)
    regime_loss = F.cross_entropy(out["regime_logits"], batch["regime_y"])
    question_loss = F.cross_entropy(out["question_logits"], batch["question_y"])
    scalar_loss = F.mse_loss(out["scalar_outputs"], batch["scalar_targets"])
    entropy = -(out["lens_weights"] * torch.log(out["lens_weights"].clamp_min(1e-8))).sum(dim=-1).mean()
    uncertainty_reg = out["uncertainty"].mean() * 0.002
    loss = (
        0.80 * lens_loss
        + 0.90 * return_loss
        + 0.45 * omega_3y_loss
        + 0.30 * regime_loss
        + 0.30 * question_loss
        + 0.45 * scalar_loss
        - 0.015 * entropy
        + uncertainty_reg
    )
    return loss, {
        "loss": float(loss.detach().cpu()),
        "lens_loss": float(lens_loss.detach().cpu()),
        "return_loss": float(return_loss.detach().cpu()),
        "omega_3y_loss": float(omega_3y_loss.detach().cpu()),
        "regime_loss": float(regime_loss.detach().cpu()),
        "question_loss": float(question_loss.detach().cpu()),
        "scalar_loss": float(scalar_loss.detach().cpu()),
        "router_entropy": float(entropy.detach().cpu()),
    }


def train_omega(bundle: OmegaBundle, cfg: TrainConfig, artifact_dir: Path) -> tuple[AURORAOmega, dict[str, Any]]:
    torch.manual_seed(cfg.seed)
    np.random.seed(cfg.seed)
    device = _device(cfg.device)
    model = AURORAOmega(
        n_features=len(bundle.feature_cols),
        n_lenses=len(bundle.lens_cols),
        n_regimes=len(bundle.regimes),
        n_questions=len(bundle.questions),
        d_model=cfg.d_model,
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=1e-4)
    train_loader = DataLoader(bundle.train, batch_size=cfg.batch_size, shuffle=True)
    history: list[dict[str, float]] = []

    for epoch in range(cfg.epochs):
        model.train()
        epoch_metrics: dict[str, list[float]] = {}
        for batch in train_loader:
            batch = {key: value.to(device) for key, value in batch.items()}
            optimizer.zero_grad(set_to_none=True)
            out = model(batch["current_x"], batch["seq_x"], top_k=3)
            loss, metrics = omega_loss(out, batch)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            for key, value in metrics.items():
                epoch_metrics.setdefault(key, []).append(value)
        row = {"epoch": float(epoch)}
        row.update({key: float(np.mean(values)) for key, values in epoch_metrics.items()})
        history.append(row)

    artifact_dir.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), artifact_dir / "omega_model.pt")
    (artifact_dir / "training_history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")
    return model, {"device": str(device), "epochs": cfg.epochs, "history_tail": history[-5:]}


@torch.no_grad()
def evaluate_omega(model: AURORAOmega, bundle: OmegaBundle, cfg: TrainConfig) -> dict[str, Any]:
    device = _device(cfg.device)
    model.eval().to(device)
    loader = DataLoader(bundle.val, batch_size=cfg.batch_size, shuffle=False)
    preds: list[np.ndarray] = []
    omega_returns: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    masks: list[np.ndarray] = []
    lens_w: list[np.ndarray] = []
    regimes: list[np.ndarray] = []
    questions: list[np.ndarray] = []
    row_index: list[np.ndarray] = []
    for batch in loader:
        b = {key: value.to(device) for key, value in batch.items()}
        out = model(b["current_x"], b["seq_x"], top_k=3)
        preds.append(out["return_outputs"].cpu().numpy())
        omega_returns.append(out["omega_return"].cpu().numpy())
        targets.append(batch["return_targets"].numpy())
        masks.append(batch["return_mask"].numpy())
        lens_w.append(out["lens_weights"].cpu().numpy())
        regimes.append(out["regime_logits"].argmax(dim=-1).cpu().numpy())
        questions.append(out["question_logits"].argmax(dim=-1).cpu().numpy())
        row_index.append(batch["row_index"].numpy())
    pred = np.vstack(preds)
    omega_pred = np.concatenate(omega_returns)
    target = np.vstack(targets)
    mask = np.vstack(masks)
    metrics: dict[str, Any] = {}
    for idx, name in enumerate(["1y", "3y"]):
        ok = mask[:, idx] > 0
        metrics[f"mae_{name}"] = float(mean_absolute_error(target[ok, idx], pred[ok, idx])) if ok.any() else None
    ok_3y = mask[:, 1] > 0
    metrics["mae_omega_moe_3y"] = float(mean_absolute_error(target[ok_3y, 1], omega_pred[ok_3y])) if ok_3y.any() else None
    weights = np.vstack(lens_w)
    metrics["mean_lens_weights"] = {name: float(weights[:, i].mean()) for i, name in enumerate(LENS_NAMES)}
    metrics["max_mean_lens_weight"] = float(weights.mean(axis=0).max())
    return {
        "metrics": metrics,
        "pred_returns": pred,
        "omega_return": omega_pred,
        "lens_weights": weights,
        "regime_pred": np.concatenate(regimes),
        "question_pred": np.concatenate(questions),
        "row_index": np.concatenate(row_index),
    }
