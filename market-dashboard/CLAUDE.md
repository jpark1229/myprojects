# Market Dashboard

Weekly/monthly multi-asset dashboard. Tracks 17 instruments across Equities, Volatility, Rates, Commodities, and Crypto.

## Assets
S&P 500, Nasdaq 100, Russell 2000, Euro STOXX 50, Nikkei 225, Hang Seng, KOSPI, FTSE 100, VIX,
US 2Y/10Y/30Y yields, Natural Gas, Crude Oil WTI, Gold, Silver, Bitcoin.

## Metrics
1D change · 1D % · WTD % · MTD % · QTD % · YTD % · 1Y · 3Y · 5Y · 10Y total return · 52W range

## Design choices
- Equity 1Y–10Y = total return via ETF proxies (SPY/QQQ/IWM/FEZ/EWJ/EWH/EWY/EWU, adjusted close)
- Rates columns = basis points (bps), not %; US 2Y via FRED DGS2
- VIX = short-term % change only; 1Y–10Y shown as N/A
- Data cached 15 min; auto-refresh countdown in browser

## How to run
```
cd C:\Users\jpark\myprojects\market-dashboard
pip install -r requirements.txt
python app.py
# Open http://localhost:5000
```

## Files
- `fetch_data.py` — data fetching (yfinance + FRED) and metric calculation
- `app.py` — Flask server with 15-min in-memory cache
- `templates/index.html` — Bloomberg-style dark dashboard
