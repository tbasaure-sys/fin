from __future__ import annotations

import torch
from torch import nn
import torch.nn.functional as F


class ResidualBlock(nn.Module):
    def __init__(self, dim: int, hidden: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.LayerNorm(dim),
            nn.Linear(dim, hidden),
            nn.GELU(),
            nn.Dropout(0.08),
            nn.Linear(hidden, dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.net(x)


class AURORAOmega(nn.Module):
    """Compact local v0 of the AURORA Omega valuation foundation model.

    This is intentionally small enough for local/Colab iteration while keeping
    the right shape: temporal encoder, latent business state, differentiable
    lens experts, question/regime heads, sparse lens router, and uncertainty.
    """

    def __init__(
        self,
        n_features: int,
        n_lenses: int,
        n_regimes: int,
        n_questions: int,
        d_model: int = 128,
        n_heads: int = 4,
        n_layers: int = 2,
    ) -> None:
        super().__init__()
        self.n_lenses = n_lenses
        self.input_proj = nn.Sequential(
            nn.Linear(n_features, d_model),
            nn.GELU(),
            ResidualBlock(d_model, d_model * 2),
        )
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=d_model * 4,
            dropout=0.08,
            batch_first=True,
            activation="gelu",
        )
        self.temporal_encoder = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)
        self.fusion = nn.Sequential(
            nn.LayerNorm(d_model * 2),
            nn.Linear(d_model * 2, d_model),
            nn.GELU(),
            ResidualBlock(d_model, d_model * 2),
            ResidualBlock(d_model, d_model * 2),
        )
        self.latent_state = nn.Sequential(nn.LayerNorm(d_model), nn.Linear(d_model, d_model), nn.Tanh())

        self.lens_experts = nn.ModuleList(
            [
                nn.Sequential(
                    nn.LayerNorm(d_model),
                    nn.Linear(d_model, d_model // 2),
                    nn.GELU(),
                    nn.Linear(d_model // 2, 1),
                )
                for _ in range(n_lenses)
            ]
        )
        self.regime_head = nn.Linear(d_model, n_regimes)
        self.question_head = nn.Linear(d_model, n_questions)
        self.scalar_head = nn.Sequential(nn.LayerNorm(d_model), nn.Linear(d_model, 3), nn.Sigmoid())
        self.return_head = nn.Linear(d_model, 2)
        self.router_head = nn.Linear(d_model, n_lenses)
        self.uncertainty_head = nn.Sequential(nn.LayerNorm(d_model), nn.Linear(d_model, 4), nn.Softplus())

    def forward(self, current_x: torch.Tensor, seq_x: torch.Tensor, top_k: int | None = None) -> dict[str, torch.Tensor]:
        current_h = self.input_proj(current_x)
        seq_h = self.input_proj(seq_x)
        temporal_h = self.temporal_encoder(seq_h)[:, -1, :]
        z = self.latent_state(self.fusion(torch.cat([current_h, temporal_h], dim=-1)))
        lens_outputs = torch.cat([expert(z) for expert in self.lens_experts], dim=-1)
        router_logits = self.router_head(z)
        if top_k is not None and top_k < self.n_lenses:
            threshold = torch.topk(router_logits, k=top_k, dim=-1).values[:, -1:]
            router_logits = torch.where(router_logits >= threshold, router_logits, torch.full_like(router_logits, -1e9))
        lens_weights = F.softmax(router_logits, dim=-1)
        return_outputs = torch.tanh(self.return_head(z)) * 0.60
        omega_return = torch.sum(lens_outputs * lens_weights, dim=-1, keepdim=True)
        return {
            "latent_state": z,
            "lens_outputs": lens_outputs,
            "lens_weights": lens_weights,
            "regime_logits": self.regime_head(z),
            "question_logits": self.question_head(z),
            "scalar_outputs": self.scalar_head(z),
            "return_outputs": return_outputs,
            "omega_return": omega_return.squeeze(-1),
            "uncertainty": self.uncertainty_head(z),
        }
