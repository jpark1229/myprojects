# $1,000/Month for 20 Years — How Much Can You Make with SPY or QQQ?

## Key Message
If you invest $1,000 every month into SPY (S&P 500) or QQQ (Nasdaq-100) for 20 years, you can grow your money dramatically through the power of Dollar-Cost Averaging (DCA).

However, the drawdown analysis shows that a market crisis near your withdrawal date could cut your portfolio nearly in half — and take up to 4 years to recover. **You should rebalance your portfolio into safer assets approximately 5 years before you need the money.**

## What It Simulates
- Starting in May 2006, you put $1,000/month into QQQ (Nasdaq-100) and separately $1,000/month into SPY (S&P 500)
- By May 2026, you've invested a total of $242,000 in each
- It tracks every month: how many shares you bought, total shares held, portfolio value, and return

## The Answer It Found
- QQQ turned $242,000 → **$2,099,704** (767% return)
- SPY turned $242,000 → **$1,121,809** (363% return)
- QQQ nearly doubled SPY's outcome

## Main File
`QQQ_SPY_DCA_Chart.html` — the primary output. Open in a browser to view all charts and results.

## Supporting Data File
`QQQ_SPY_DCA_Analysis.xlsx` — raw data source with 6 sheets:

| Sheet | Description |
|-------|-------------|
| `QQQ DCA` | Month-by-month DCA simulation for QQQ |
| `SPY (SPX) DCA` | Month-by-month DCA simulation for SPY |
| `Comparison` | Side-by-side portfolio comparison |
| `Drawdown Analysis` | Max drawdown, peak/trough dates, recovery durations |
| `QQQ Daily` | Daily adjusted close prices for QQQ |
| `SPY Daily` | Daily adjusted close prices for SPY |

## Key Stats (May 2006 – May 2026, $242,000 total invested)

| Metric | QQQ | SPY |
|--------|-----|-----|
| Portfolio Value | $2,099,704 | $1,121,809 |
| Total Return | 767.65% | 363.56% |
| Max Portfolio Drawdown | -40.38% | -35.48% |
| Max Price Drawdown | -53.4% | -55.19% |

## Drawdown Analysis (Daily Adjusted Close)

### Portfolio Value Drawdown
| Metric | QQQ | SPY |
|--------|-----|-----|
| Max Drawdown | -40.38% | -35.48% |
| Peak Date | 2008-08-14 | 2008-09-02 |
| Trough Date | 2008-11-20 | 2008-11-20 |
| Peak → Trough | 98 calendar days | 79 calendar days |
| Recovery Date | 2009-05-01 | 2009-05-04 |
| Trough → Recovery | 162 calendar days | 165 calendar days |

### Price (Adj. Close) Drawdown
| Metric | QQQ | SPY |
|--------|-----|-----|
| Max Drawdown | -53.4% | -55.19% |
| Peak Date | 2007-10-31 | 2007-10-09 |
| Trough Date | 2008-11-20 | 2009-03-09 |
| Peak → Trough | 386 calendar days | 517 calendar days |
| Recovery Date | 2010-12-08 | 2012-08-16 |
| Trough → Recovery | 748 calendar days | 1,256 calendar days |

## Notes
- All prices use **adjusted close** (accounts for splits and dividends reinvested)
- Drawdown charts use **daily** data
- Peak/trough/recovery dates are exact trading days from daily price data
- Duration measured in **calendar days**
- Charts built with Chart.js v4
