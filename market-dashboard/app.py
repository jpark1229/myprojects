import threading
import time
from datetime import datetime, date
from flask import Flask, render_template, redirect, url_for, request
from fetch_data import get_dashboard_data, get_vol_term_structure

app = Flask(__name__)
app.jinja_env.globals['enumerate'] = enumerate

_cache = {}   # {date_str: {"data": ..., "ts": float}}
_lock = threading.Lock()
CACHE_TTL = 15 * 60  # 15 min TTL for today only; historical dates cached indefinitely


def parse_date(date_str):
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
        return min(d, date.today())   # clamp to today
    except Exception:
        return date.today()


def get_data(as_of_str=None, force=False):
    if not as_of_str:
        as_of_str = str(date.today())

    with _lock:
        cached = _cache.get(as_of_str)
        is_today = (as_of_str == str(date.today()))
        stale = cached is None or (is_today and (time.time() - cached["ts"]) > CACHE_TTL)

        if force or stale:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Fetching data for {as_of_str}...")
            _cache[as_of_str] = {
                "data": get_dashboard_data(as_of=parse_date(as_of_str)),
                "ts": time.time(),
            }
            print("Done.\n")

        return _cache[as_of_str]["data"]


@app.template_filter("fmt_chg")
def fmt_chg(val):
    if val is None:
        return "—"
    sign = "+" if val >= 0 else ""
    a = abs(val)
    if a >= 1000:
        return f"{sign}{val:,.0f}"
    if a >= 10:
        return f"{sign}{val:.2f}"
    if a >= 0.0001:
        return f"{sign}{val:.4f}"
    return f"{sign}{val:.6f}"


@app.route("/")
def index():
    as_of = request.args.get("date", str(date.today()))
    data = get_data(as_of)
    return render_template("index.html", data=data, today=str(date.today()))


@app.route("/refresh")
def refresh():
    as_of = request.args.get("date", str(date.today()))
    get_data(as_of, force=True)
    return redirect(url_for("index", date=as_of))


_vol_cache = {}

def get_vol_data(as_of_str=None, force=False):
    if not as_of_str:
        as_of_str = str(date.today())
    with _lock:
        cached = _vol_cache.get(as_of_str)
        is_today = (as_of_str == str(date.today()))
        stale = cached is None or (is_today and (time.time() - cached["ts"]) > CACHE_TTL)
        if force or stale:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Fetching vol term structure for {as_of_str}...")
            _vol_cache[as_of_str] = {
                "data": get_vol_term_structure(as_of=parse_date(as_of_str)),
                "ts": time.time(),
            }
            print("Done.\n")
        return _vol_cache[as_of_str]["data"]


@app.route("/vol")
def vol():
    as_of = request.args.get("date", str(date.today()))
    data = get_vol_data(as_of)
    return render_template("vol.html", data=data, today=str(date.today()))


@app.route("/vol/refresh")
def vol_refresh():
    as_of = request.args.get("date", str(date.today()))
    get_vol_data(as_of, force=True)
    return redirect(url_for("vol", date=as_of))


if __name__ == "__main__":
    app.run(debug=False, port=5000)
