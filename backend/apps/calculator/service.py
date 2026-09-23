"""Qi efficiency model v1: preserve the original HTML's empirical formulas.

Units: rxL in µH, rxR/rxACR in mΩ, freq in kHz, power in W.
No request state is stored globally. Built-in curves are server-owned.
"""
import json
import math
from pathlib import Path

CURVES = json.loads(Path(__file__).with_name("curves.json").read_text(encoding="utf-8"))
MODEL_VERSION = "lqk-v1"


def number(value, field, minimum=0, maximum=1_000_000):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} 必須是數字")
    if not minimum <= value <= maximum or not math.isfinite(value):
        raise ValueError(f"{field} 必須介於 {minimum} 與 {maximum}")
    return value


def interpolate(points, x):
    if x <= points[0][0]:
        return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return points[-1][1]


def efficiency(s, kind, current, custom_curves):
    field = "rxIc" if kind == "rx" else "chargerIc"
    selected = s.get(field + "Select")
    if not isinstance(selected, str):
        raise ValueError(f"{field}Select 必須指定型號")
    if selected == "custom":
        return number(s.get(field + "Eff"), field + "Eff", 0, 100), "自訂效率"
    if selected in CURVES[kind + "Fixed"]:
        return CURVES[kind + "Fixed"][selected], "暫定效率，僅供佈局預估，不可作驗收依據。"
    curve = CURVES[kind].get(selected)
    if curve is None and selected.startswith("custom_"):
        curve = custom_curves.get(kind)
        if not isinstance(curve, dict) or curve.get("axis") not in ("power", "current"):
            raise ValueError(f"{kind} 自訂曲線 axis 必須是 power 或 current")
        points = curve.get("data")
        if not isinstance(points, list) or not 3 <= len(points) <= 1000:
            raise ValueError(f"{kind} 自訂曲線需有 3 至 1000 個資料點")
        previous = -1
        for point in points:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError(f"{kind} 曲線資料點必須為 [x, 效率]")
            x = number(point[0], "curve.x")
            number(point[1], "curve.efficiency", 0, 100)
            if x <= previous:
                raise ValueError(f"{kind} 曲線 X 值需遞增且不可重複")
            previous = x
    if curve is None:
        raise ValueError(f"未知的 {kind} 型號")
    # Preserve the original charger current lookup, regardless of digitizer axis.
    x = s["sysPower"] if kind == "rx" and curve["axis"] == "power" else current
    tip = f"依 {x:.2f}{'W' if kind == 'rx' and curve['axis'] == 'power' else 'A'} 查表"
    if x < curve["data"][0][0] or x > curve["data"][-1][0]:
        tip += "（超出取樣範圍，使用端點效率）"
    return interpolate(curve["data"], x), tip


def calculate(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("state"), dict):
        raise ValueError("請提供 state 參數物件")
    s = payload["state"].copy()
    for field in ("batCapacity", "batVoltage", "batMaxC", "sysPower", "rxL", "rxR", "freq", "qTx", "kVal"):
        minimum = 0.000001 if field in ("batCapacity", "batVoltage", "rxL", "rxR", "freq", "qTx") else 0
        s[field] = number(s.get(field), field, minimum, 1 if field == "kVal" else 1_000_000)
    if s.get("caseMaterial") not in ("pc_abs", "aluminum", "zinc"):
        raise ValueError("caseMaterial 不支援此材質")
    if s.get("ncWrap") not in ("yes", "no"):
        raise ValueError("ncWrap 必須是 yes 或 no")
    custom_curves = payload.get("customCurves", {})
    if not isinstance(custom_curves, dict):
        raise ValueError("customCurves 必須是物件")
    current = s["batCapacity"] / 1000 * s["batMaxC"]
    rx, rx_tip = efficiency(s, "rx", current, custom_curves)
    charger, charger_tip = efficiency(s, "charger", current, custom_curves)
    metal = s["caseMaterial"] in ("aluminum", "zinc")
    acr = s["rxR"] * (4.8 if metal else 1.8 if s["ncWrap"] == "yes" else 2.22)
    q_rx = 2 * math.pi * s["freq"] * 1000 * s["rxL"] * 1e-6 / (acr * 1e-3)
    k2qq = s["kVal"] ** 2 * s["qTx"] * q_rx
    coil_eff = k2qq / (1 + math.sqrt(1 + k2qq)) ** 2 * 100
    system_eff = coil_eff / 100 * rx / 100 * charger / 100
    p_out = s["sysPower"]
    p_in = p_out / system_eff if system_eff > 0 else (0 if p_out == 0 else None)
    total_loss = p_in - p_out if p_in is not None else None
    coil_loss = p_in - p_out / (rx / 100 * charger / 100) if p_in is not None and rx * charger > 0 else (0 if p_out == 0 else None)
    return {
        "modelVersion": MODEL_VERSION, "chargeCurrentA": current,
        "rxIcEff": rx, "chargerIcEff": charger, "rxTip": rx_tip, "chargerTip": charger_tip,
        "rxACR": acr, "Qrx": q_rx, "qVal": round(q_rx, 2), "isMetal": metal,
        "coilEff": coil_eff, "sysEffPct": system_eff * 100, "pOut": p_out,
        "pInTotal": p_in, "totalLoss": total_loss, "coilLoss": coil_loss,
        "icLoss": total_loss - coil_loss if total_loss is not None and coil_loss is not None else None,
        "warnings": ["效率為零，無法達成指定輸出功率。"] if p_in is None else [],
    }
