import yfinance as yf
import pandas as pd
import requests
from datetime import datetime, date, timedelta
from io import StringIO
import warnings

warnings.filterwarnings("ignore")

# (category, display_name, yf_ticker, etf_proxy_for_total_return, is_yield)
ASSETS = [
    ("Equity",     "S&P 500",       "^GSPC",     "SPY",  False),
    ("Equity",     "Nasdaq 100",    "^NDX",      "QQQ",  False),
    ("Equity",     "Russell 2000",  "^RUT",      "IWM",  False),
    ("Equity",     "Euro STOXX 50", "^STOXX50E", "FEZ",  False),
    ("Equity",     "FTSE 100",      "^FTSE",     "EWU",  False),
    ("Equity",     "Nikkei 225",    "^N225",     "EWJ",  False),
    ("Equity",     "Hang Seng",     "^HSI",      "EWH",  False),
    ("Equity",     "KOSPI",         "^KS11",     "EWY",  False),
    ("Volatility", "VIX",           "^VIX",      None,   False),
    ("Rates",      "US 2Y Yield",   "FRED_DGS2", None,   True),
    ("Rates",      "US 10Y Yield",  "^TNX",      None,   True),
    ("Rates",      "US 30Y Yield",  "^TYX",      None,   True),
    ("Commodity",  "Natural Gas",   "NG=F",      None,   False),
    ("Commodity",  "Crude Oil WTI", "CL=F",      None,   False),
    ("Commodity",  "Gold",          "GC=F",      None,   False),
    ("Commodity",  "Silver",        "SI=F",      None,   False),
    ("Crypto",     "Bitcoin",       "BTC-USD",   None,   False),
]

START_DATE = "2013-01-01"

VOL_TENORS = [
    ("1D",  "^VIX1D"),
    ("9D",  "^VIX9D"),
    ("1M",  "^VIX"),
    ("3M",  "^VIX3M"),
    ("6M",  "^VIX6M"),
    ("1Y",  "^VIX1Y"),
]


def strip_tz(s):
    if hasattr(s.index, "tz") and s.index.tz is not None:
        s.index = s.index.tz_localize(None)
    return s



def fetch_fred(series_id):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        df = pd.read_csv(StringIO(r.text))
        date_col = df.columns[0]  # 'observation_date' or 'DATE'
        df[date_col] = pd.to_datetime(df[date_col])
        df = df.set_index(date_col)
        s = pd.to_numeric(df.iloc[:, 0], errors="coerce").dropna()
        s.index = pd.DatetimeIndex(s.index)
        return s
    except Exception as e:
        print(f"  FRED error ({series_id}): {e}")
        return None


def closest_before(s, target):
    if s is None or len(s) == 0:
        return None
    ts = pd.Timestamp(target)
    mask = s.index <= ts
    if not mask.any():
        return None
    return float(s[mask].iloc[-1])


def pct(curr, base):
    if curr is None or base is None or base == 0:
        return None
    return round((curr / base - 1) * 100, 2)


def bps(curr, base):
    if curr is None or base is None:
        return None
    return round((curr - base) * 100, 1)


def ref_dates(today):
    t = today

    ytd = date(t.year - 1, 12, 31)

    m = t.month
    if m <= 3:   qtd = date(t.year - 1, 12, 31)
    elif m <= 6: qtd = date(t.year, 3, 31)
    elif m <= 9: qtd = date(t.year, 6, 30)
    else:        qtd = date(t.year, 9, 30)

    mtd = date(t.year, t.month, 1) - timedelta(days=1)

    wd = t.weekday()  # 0=Mon … 6=Sun
    if wd == 4:   days_back = 7
    elif wd == 5: days_back = 1
    elif wd == 6: days_back = 2
    else:         days_back = wd + 3
    wtd = t - timedelta(days=days_back)

    def yago(n):
        try:
            return date(t.year - n, t.month, t.day)
        except ValueError:
            return date(t.year - n, t.month, 28)

    return wtd, mtd, qtd, ytd, yago(1), yago(3), yago(5), yago(10)


def w52_range(s, as_of):
    as_of_ts = pd.Timestamp(as_of)
    cutoff = as_of_ts - pd.Timedelta(days=365)
    w = s[(s.index >= cutoff) & (s.index <= as_of_ts)]
    if len(w) == 0:
        return None, None, None
    curr = closest_before(s, as_of)
    if curr is None:
        return None, None, None
    lo, hi = float(w.min()), float(w.max())
    pos = round((curr - lo) / (hi - lo) * 100, 1) if hi != lo else 50.0
    return lo, hi, pos


def fmt_price(val, is_yield):
    if is_yield:
        return f"{val:.3f}"
    if val >= 10000:
        return f"{val:,.0f}"
    if val >= 1000:
        return f"{val:,.2f}"
    if val >= 10:
        return f"{val:.2f}"
    if val >= 1:
        return f"{val:.4f}"
    return f"{val:.6f}"


def fmt_range_val(val, is_yield):
    if is_yield:
        return f"{val:.2f}"
    if val >= 1000:
        return f"{val:,.0f}"
    return f"{val:.2f}"


def fetch_all_yf(tickers):
    """Batch-download adjusted close prices for all tickers in one request."""
    print(f"Fetching {len(tickers)} tickers from Yahoo Finance (batch)...")
    try:
        raw = yf.download(tickers, start=START_DATE, auto_adjust=True, progress=False)
    except Exception as e:
        print(f"  Batch download error: {e}")
        return {}

    result = {}
    if isinstance(raw.columns, pd.MultiIndex):
        # Multi-ticker: columns are (metric, ticker)
        if "Close" in raw.columns.get_level_values(0):
            close = raw["Close"]
            for t in tickers:
                if t in close.columns:
                    s = close[t].dropna()
                    result[t] = strip_tz(s)
    else:
        # Single ticker fallback
        if "Close" in raw.columns and len(tickers) == 1:
            result[tickers[0]] = strip_tz(raw["Close"].dropna())

    print(f"  Got data for {len(result)}/{len(tickers)} tickers.")
    return result


def get_dashboard_data(as_of=None):
    as_of = as_of or date.today()
    wtd, mtd, qtd, ytd, y1, y3, y5, y10 = ref_dates(as_of)

    # Collect all unique YF tickers
    yf_ticker_list = []
    for _, _, ticker, proxy, _ in ASSETS:
        if not ticker.startswith("FRED_") and ticker not in yf_ticker_list:
            yf_ticker_list.append(ticker)
        if proxy and proxy not in yf_ticker_list:
            yf_ticker_list.append(proxy)

    all_data = fetch_all_yf(yf_ticker_list)

    print("Fetching FRED DGS2 (US 2Y yield)...")
    fred_2y = fetch_fred("DGS2")

    rows = []
    for cat, name, ticker, proxy, is_yield in ASSETS:
        is_vix = ticker == "^VIX"

        price_s = fred_2y if ticker.startswith("FRED_") else all_data.get(ticker)
        if price_s is None or len(price_s) < 2:
            print(f"  Skipping {name}: no data")
            continue

        # Current price = last available on or before as_of
        as_of_ts = pd.Timestamp(as_of)
        curr_mask = price_s.index <= as_of_ts
        if not curr_mask.any():
            continue
        curr_ts = price_s[curr_mask].index[-1]
        curr = float(price_s[curr_mask].iloc[-1])
        last_dt = str(curr_ts.date())

        # Previous trading day
        prev_mask = price_s.index < curr_ts
        prev = float(price_s[prev_mask].iloc[-1]) if prev_mask.any() else None

        chg_1d = round(curr - prev, 6) if prev is not None else None
        lo, hi, w52pos = w52_range(price_s, as_of)

        if is_yield:
            row = {
                "category": cat, "name": name,
                "price": fmt_price(curr, True),
                "last_date": last_dt,
                "change_1d": round(chg_1d * 100, 1) if chg_1d is not None else None,
                "col_1d":   round(chg_1d * 100, 1) if chg_1d is not None else None,
                "col_wtd": bps(curr, closest_before(price_s, wtd)),
                "col_mtd": bps(curr, closest_before(price_s, mtd)),
                "col_qtd": bps(curr, closest_before(price_s, qtd)),
                "col_ytd": bps(curr, closest_before(price_s, ytd)),
                "ret_1y":  bps(curr, closest_before(price_s, y1)),
                "ret_3y":  bps(curr, closest_before(price_s, y3)),
                "ret_5y":  bps(curr, closest_before(price_s, y5)),
                "ret_10y": bps(curr, closest_before(price_s, y10)),
                "w52_lo": fmt_range_val(lo, True) if lo else None,
                "w52_hi": fmt_range_val(hi, True) if hi else None,
                "w52_pos": w52pos,
                "is_yield": True, "is_vix": False,
            }
        else:
            pct_1d = pct(curr, prev)
            proxy_s = all_data.get(proxy) if proxy else None
            ret_s = proxy_s if proxy_s is not None else price_s
            ret_curr = closest_before(ret_s, as_of) if ret_s is not None else None

            def tr(ref_d):
                if is_vix or ret_s is None:
                    return None
                return pct(ret_curr, closest_before(ret_s, ref_d))

            row = {
                "category": cat, "name": name,
                "price": fmt_price(curr, False),
                "last_date": last_dt,
                "change_1d": chg_1d,
                "col_1d":   pct_1d,
                "col_wtd":  pct(curr, closest_before(price_s, wtd)),
                "col_mtd":  pct(curr, closest_before(price_s, mtd)),
                "col_qtd":  pct(curr, closest_before(price_s, qtd)),
                "col_ytd":  pct(curr, closest_before(price_s, ytd)),
                "ret_1y":   tr(y1),
                "ret_3y":   tr(y3),
                "ret_5y":   tr(y5),
                "ret_10y":  tr(y10),
                "w52_lo": fmt_range_val(lo, False) if lo else None,
                "w52_hi": fmt_range_val(hi, False) if hi else None,
                "w52_pos": w52pos,
                "is_yield": False, "is_vix": is_vix,
                "proxy": proxy,
            }
        rows.append(row)

    return {
        "rows": rows,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "as_of": str(as_of),
        "refs": {
            "wtd": str(wtd), "mtd": str(mtd),
            "qtd": str(qtd), "ytd": str(ytd),
        },
    }


def get_vol_term_structure(as_of=None):
    as_of = as_of or date.today()
    w1 = as_of - timedelta(days=7)
    m1 = as_of - timedelta(days=30)

    tickers = [t for _, t in VOL_TENORS]
    print("Fetching VIX term structure tickers (batch)...")
    data = fetch_all_yf(tickers)

    labels = [label for label, _ in VOL_TENORS]
    dates = [as_of, w1, m1]

    series = []
    for d in dates:
        values = []
        for _, ticker in VOL_TENORS:
            s = data.get(ticker)
            v = closest_before(s, d) if s is not None else None
            values.append(round(v, 2) if v is not None else None)
        # Find the actual trading date used (from ^VIX as reference)
        ref_s = data.get("^VIX")
        actual_date = str(ref_s[ref_s.index <= pd.Timestamp(d)].index[-1].date()) if ref_s is not None else str(d)
        series.append({"date": str(d), "actual_date": actual_date, "values": values})

    return {
        "as_of": str(as_of),
        "labels": labels,
        "series": series,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
