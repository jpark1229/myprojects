"""Auto-generate a short market commentary paragraph from dashboard data."""


SHORT = {
    "S&P 500":       "SPX",
    "Nasdaq 100":    "Nasdaq",
    "Russell 2000":  "Russell 2K",
    "Euro STOXX 50": "Euro Stoxx",
    "FTSE 100":      "FTSE",
    "Nikkei 225":    "Nikkei",
    "Hang Seng":     "Hang Seng",
    "KOSPI":         "KOSPI",
    "US 2Y Yield":   "2Y",
    "US 10Y Yield":  "10Y",
    "US 30Y Yield":  "30Y",
    "Natural Gas":   "Nat Gas",
    "Crude Oil WTI": "Oil",
    "Gold":          "Gold",
    "Silver":        "Silver",
    "Bitcoin":       "BTC",
}

REGIONS = {
    "US":     ["S&P 500", "Nasdaq 100", "Russell 2000"],
    "Europe": ["Euro STOXX 50", "FTSE 100"],
    "Asia":   ["Nikkei 225", "Hang Seng", "KOSPI"],
}


def _sgn(v):
    return "+" if v >= 0 else ""


def _fmt_pct(v, d=1):
    return f"{_sgn(v)}{v:.{d}f}%"


def _avg(vals):
    v = [x for x in vals if x is not None]
    return sum(v) / len(v) if v else None


def _direction(avg, low=0.2, high=0.2):
    if avg is None:
        return "little changed"
    if avg > high:
        return "up"
    if avg < -low:
        return "down"
    return "little changed"


def _detail(names, row_map, field="col_wtd"):
    parts = []
    for name in names:
        row = row_map.get(name)
        if row is None:
            continue
        v = row.get(field)
        if v is None:
            continue
        parts.append(f"{SHORT[name]} {_fmt_pct(v)}")
    return ", ".join(parts)


def _equity_sentence(row_map):
    region_dirs = {}
    region_details = {}
    for region, names in REGIONS.items():
        vals = [row_map[n]["col_wtd"] for n in names if n in row_map and row_map[n].get("col_wtd") is not None]
        avg = _avg(vals)
        region_dirs[region] = _direction(avg)
        region_details[region] = _detail(names, row_map)

    up   = [r for r, d in region_dirs.items() if d == "up"]
    down = [r for r, d in region_dirs.items() if d == "down"]
    flat = [r for r, d in region_dirs.items() if d == "little changed"]

    def region_str(regions):
        return " / ".join(
            f"{r} ({region_details[r]})" for r in regions if region_details[r]
        )

    if up and down:
        parts = []
        if up:
            parts.append(f"up in {region_str(up)}")
        if down:
            parts.append(f"down in {region_str(down)}")
        if flat:
            parts.append(f"little changed in {' / '.join(flat)}")
        return "Equities were " + " but ".join(parts) + " on the week."

    if up:
        all_detail = _detail(sum(REGIONS.values(), []), row_map)
        return f"Equities were broadly higher on the week ({all_detail})."

    if down:
        all_detail = _detail(sum(REGIONS.values(), []), row_map)
        return f"Equities sold off on the week ({all_detail})."

    return "Equities were little changed on the week."


def _vix_sentence(row_map):
    row = row_map.get("VIX")
    if row is None:
        return ""
    level = row.get("price")
    wtd = row.get("col_wtd")
    if level is None:
        return ""
    if wtd is None or abs(wtd) < 0.5:
        return f"VIX was little changed at {level}."
    direction = "lower" if wtd < 0 else "higher"
    return f"VIX was {direction} at {level} ({_fmt_pct(wtd)})."


def _rates_sentence(row_map):
    rows_10y = row_map.get("US 10Y Yield")
    rows_30y = row_map.get("US 30Y Yield")
    rows_2y  = row_map.get("US 2Y Yield")

    if rows_10y is None:
        return ""

    bps_10y = rows_10y.get("col_wtd")
    bps_30y = rows_30y.get("col_wtd") if rows_30y else None
    level_10y = rows_10y.get("price")
    level_30y = rows_30y.get("price") if rows_30y else None
    level_2y  = rows_2y.get("price")  if rows_2y  else None

    if bps_10y is None:
        return ""

    threshold = 3
    if abs(bps_10y) < threshold:
        direction = "were little changed"
    elif bps_10y > 0:
        direction = "rose"
    else:
        direction = "fell"

    parts = []
    if level_10y:
        change_str = f"{_sgn(bps_10y)}{bps_10y:.0f} bps" if bps_10y is not None else ""
        parts.append(f"10Y at {level_10y}% ({change_str})")
    if level_30y and bps_30y is not None:
        parts.append(f"30Y at {level_30y}% ({_sgn(bps_30y)}{bps_30y:.0f} bps)")
    if level_2y:
        bps_2y = rows_2y.get("col_wtd") if rows_2y else None
        if bps_2y is not None:
            parts.append(f"2Y at {level_2y}% ({_sgn(bps_2y)}{bps_2y:.0f} bps)")

    detail = ", ".join(parts)
    sentence = f"Rates {direction} on the week"
    if detail:
        sentence += f", with {detail}"
    return sentence + "."


def _commodity_sentence(row_map):
    parts = []

    oil = row_map.get("Crude Oil WTI")
    if oil:
        price = oil.get("price")
        wtd   = oil.get("col_wtd")
        if price and wtd is not None:
            direction = "rose" if wtd > 1 else "fell" if wtd < -1 else "was little changed"
            parts.append(f"Oil {direction} at ${price} ({_fmt_pct(wtd)})")

    gold = row_map.get("Gold")
    if gold:
        price = gold.get("price")
        wtd   = gold.get("col_wtd")
        if price and wtd is not None:
            direction = "rose" if wtd > 1 else "fell" if wtd < -1 else "was little changed"
            parts.append(f"Gold {direction} at ${price} ({_fmt_pct(wtd)})")

    btc = row_map.get("Bitcoin")
    if btc:
        price = btc.get("price")
        wtd   = btc.get("col_wtd")
        if price and wtd is not None and abs(wtd) >= 3:
            direction = "rallied" if wtd > 0 else "sold off"
            parts.append(f"BTC {direction} ({_fmt_pct(wtd)}) to {price}")

    if not parts:
        return ""
    return ". ".join(parts) + "."


def generate(data):
    rows = data.get("rows", [])
    row_map = {r["name"]: r for r in rows}

    sentences = [
        _equity_sentence(row_map),
        _vix_sentence(row_map),
        _rates_sentence(row_map),
        _commodity_sentence(row_map),
    ]

    return " ".join(s for s in sentences if s)
