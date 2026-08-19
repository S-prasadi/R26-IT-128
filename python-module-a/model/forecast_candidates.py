"""
Model Comparison Candidates (Phase 2)
---------------------------------------
Additional forecasting methods evaluated against the production ARIMA/ES
pipeline (`arima_es` in backtest.py) via the walk-forward backtest harness.

Every function here has the same signature as backtest.py's
forecast_at_origin()/naive_forecast():

    fn(train_series: list, horizon: int) -> (predictions: list[float], method: str)

so they can be registered directly as backtest.py candidates.

Candidates:
  holt_winters_full -- Exponential Smoothing run on every fold (not just the
                        <8-week fallback the production path uses it for).
  sarima             -- SARIMAX with a fixed, modest seasonal order. See
                        seasonality_check.py: no consistent seasonal signal
                        was found in this dataset, so this is an experiment
                        the review asked for, not a change backed by evidence.
  xgboost            -- Lag + rolling-stat features, recursive multi-step
                        forecasting. Needs materially more history than
                        ARIMA/ES to produce even one training row.
"""

import warnings

import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX
from xgboost import XGBRegressor

warnings.filterwarnings("ignore")


def _clamp_round(values) -> list:
    return [max(0, round(float(v), 2)) for v in values]


def _naive_tail(train_series: list, horizon: int) -> list:
    last = train_series[-1] if train_series else 0
    return [max(0, round(last, 2))] * horizon


# ── Holt-Winters (Exponential Smoothing) as a full candidate ───────────────────

def forecast_holt_winters_full(train_series: list, horizon: int):
    try:
        result = ExponentialSmoothing(
            train_series, trend="add", initialization_method="estimated"
        ).fit()
        return _clamp_round(result.forecast(steps=horizon)), "ES"
    except Exception:
        return _naive_tail(train_series, horizon), "ES-fallback"


# ── SARIMA ───────────────────────────────────────────────────────────────────

SARIMA_ORDER          = (1, 1, 1)
SARIMA_SEASONAL_ORDER = (1, 0, 0, 13)   # quarterly-ish; see seasonality_check.py
SARIMA_MIN_TRAIN      = 8               # same floor forecasting.py uses before attempting ARIMA(1,1,1) --
                                         # below this, order=(1,1,1) is unidentifiable and can explode.


def forecast_sarima(train_series: list, horizon: int):
    n = len(train_series)
    if n < SARIMA_MIN_TRAIN:
        return _naive_tail(train_series, horizon), "naive-fallback (insufficient history for order=(1,1,1))"

    # Below ~2x the seasonal period, the seasonal AR term isn't meaningfully
    # identifiable -- fit without a seasonal component instead of letting it fail.
    seasonal_order = SARIMA_SEASONAL_ORDER if n >= 2 * SARIMA_SEASONAL_ORDER[3] else (0, 0, 0, 0)
    label = "SARIMAX" if seasonal_order == SARIMA_SEASONAL_ORDER else "SARIMAX(no-season,short-history)"
    try:
        result = SARIMAX(
            train_series, order=SARIMA_ORDER, seasonal_order=seasonal_order,
            enforce_stationarity=False, enforce_invertibility=False,
        ).fit(disp=False)
        return _clamp_round(result.forecast(steps=horizon)), label
    except Exception:
        return _naive_tail(train_series, horizon), "naive-fallback"


# ── XGBoost ────────────────────────────────────────────────────────────────────

XGB_LAGS      = 8
XGB_MIN_TRAIN = XGB_LAGS + 1   # need at least one complete lagged row to fit anything


def _lag_feature_columns(lags: int = XGB_LAGS) -> list:
    return [f"lag_{i}" for i in range(1, lags + 1)] + ["roll_mean_4", "roll_std_4"]


def _build_lag_features(series: list, lags: int = XGB_LAGS) -> pd.DataFrame:
    s = pd.Series(series, dtype=float)
    feats = {f"lag_{i}": s.shift(i) for i in range(1, lags + 1)}
    feats["roll_mean_4"] = s.shift(1).rolling(4).mean()
    feats["roll_std_4"]  = s.shift(1).rolling(4).std()
    feats["target"]      = s
    return pd.DataFrame(feats).dropna()


def forecast_xgboost(train_series: list, horizon: int):
    n = len(train_series)
    if n < XGB_MIN_TRAIN:
        return _naive_tail(train_series, horizon), "naive-fallback (insufficient history for lag features)"

    feat_df = _build_lag_features(train_series)
    if feat_df.empty:
        return _naive_tail(train_series, horizon), "naive-fallback (insufficient history for lag features)"

    feature_cols = _lag_feature_columns()
    try:
        model = XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.1, verbosity=0)
        model.fit(feat_df[feature_cols], feat_df["target"])
    except Exception:
        return _naive_tail(train_series, horizon), "naive-fallback (fit failed)"

    history = list(train_series)
    preds = []
    for _ in range(horizon):
        s = pd.Series(history, dtype=float)
        row = {f"lag_{i}": s.iloc[-i] for i in range(1, XGB_LAGS + 1)}
        row["roll_mean_4"] = s.iloc[-4:].mean()
        row["roll_std_4"]  = s.iloc[-4:].std()
        x = pd.DataFrame([row])[feature_cols]
        pred = max(0, round(float(model.predict(x)[0]), 2))
        preds.append(pred)
        history.append(pred)

    return preds, "XGBoost"
