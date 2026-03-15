__all__ = ["run_research", "run_tail_risk_pipeline"]


def run_research(*args, **kwargs):
    from .pipeline import run_research as _run_research

    return _run_research(*args, **kwargs)


def run_tail_risk_pipeline(*args, **kwargs):
    from .tail_risk import run_tail_risk_pipeline as _run_tail_risk_pipeline

    return _run_tail_risk_pipeline(*args, **kwargs)
