const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ── Monthly DCA rows (for portfolio tracking sheet) ───────────────────────────
async function fetchMonthlyDCA(ticker) {
    const data = await yahooFinance.historical(ticker, {
        period1: '2006-05-01',
        period2: '2026-05-31',
        interval: '1mo',
    });
    if (!data || data.length === 0) throw new Error(`No data for ${ticker}`);

    let totalShares = 0, totalInvested = 0;
    const rows = [];
    for (const bar of data) {
        const price = bar.adjClose ?? bar.close;
        if (!price || price <= 0) continue;
        const sharesBought = 1000 / price;
        totalShares += sharesBought;
        totalInvested += 1000;
        const portfolioValue = totalShares * price;
        const gainLoss = portfolioValue - totalInvested;
        const dateStr = `${bar.date.getFullYear()}-${String(bar.date.getMonth() + 1).padStart(2, '0')}`;
        rows.push({
            dateStr, price: +price.toFixed(2), investment: 1000,
            sharesBought: +sharesBought.toFixed(6), totalShares: +totalShares.toFixed(6),
            totalInvested, portfolioValue: +portfolioValue.toFixed(2),
            gainLoss: +gainLoss.toFixed(2),
            returnPct: +((gainLoss / totalInvested) * 100).toFixed(2),
        });
    }
    return rows;
}

// ── Daily DCA rows (buy on first trading day of each month) ───────────────────
async function fetchDailyDCA(ticker) {
    const data = await yahooFinance.historical(ticker, {
        period1: '2006-05-01',
        period2: '2026-05-31',
        interval: '1d',
    });
    if (!data || data.length === 0) throw new Error(`No daily data for ${ticker}`);
    data.sort((a, b) => a.date - b.date);

    let totalShares = 0, totalInvested = 0, lastBuyMonth = '';
    const rows = [];

    for (const bar of data) {
        const price = bar.adjClose ?? bar.close;
        if (!price || price <= 0) continue;
        const month = `${bar.date.getFullYear()}-${String(bar.date.getMonth() + 1).padStart(2, '0')}`;

        // Buy $1,000 on the first available trading day of each month
        if (month !== lastBuyMonth) {
            totalShares += 1000 / price;
            totalInvested += 1000;
            lastBuyMonth = month;
        }

        rows.push({
            dateStr: bar.date.toISOString().slice(0, 10),
            price: +price.toFixed(4),
            totalShares, totalInvested,
            portfolioValue: +(totalShares * price).toFixed(2),
        });
    }
    return rows;
}

// ── Drawdown on any series with .portfolioValue and .price ────────────────────
function calcDrawdowns(rows) {
    let portPeak = -Infinity, portPeakDate = '';
    let pricePeak = -Infinity, pricePeakDate = '';
    let maxPortDD = 0, maxPortStart = '', maxPortTrough = '';
    let maxPriceDD = 0, maxPriceStart = '', maxPriceTrough = '';

    for (const r of rows) {
        if (r.portfolioValue > portPeak)  { portPeak  = r.portfolioValue; portPeakDate  = r.dateStr; }
        r.portDrawdownPct = +((r.portfolioValue - portPeak) / portPeak * 100).toFixed(2);
        if (r.portDrawdownPct < maxPortDD)  { maxPortDD  = r.portDrawdownPct;  maxPortStart  = portPeakDate;  maxPortTrough  = r.dateStr; }

        if (r.price > pricePeak) { pricePeak = r.price; pricePeakDate = r.dateStr; }
        r.priceDrawdownPct = +((r.price - pricePeak) / pricePeak * 100).toFixed(2);
        if (r.priceDrawdownPct < maxPriceDD) { maxPriceDD = r.priceDrawdownPct; maxPriceStart = pricePeakDate; maxPriceTrough = r.dateStr; }
    }

    const portPeakVal  = rows.find(r => r.dateStr === maxPortStart)?.portfolioValue ?? 0;
    const pricePeakVal = rows.find(r => r.dateStr === maxPriceStart)?.price ?? 0;
    const portRecovery  = rows.find(r => r.dateStr > maxPortTrough  && r.portfolioValue >= portPeakVal)?.dateStr  ?? 'Not yet';
    const priceRecovery = rows.find(r => r.dateStr > maxPriceTrough && r.price >= pricePeakVal)?.dateStr ?? 'Not yet';

    return {
        rows,
        summary: {
            portfolio: {
                drawdown: maxPortDD, peak: maxPortStart, trough: maxPortTrough,
                recovery: portRecovery,
                peakToTrough:      dayDiff(maxPortStart, maxPortTrough),
                troughToRecovery:  portRecovery !== 'Not yet' ? dayDiff(maxPortTrough, portRecovery) : 'N/A',
            },
            price: {
                drawdown: maxPriceDD, peak: maxPriceStart, trough: maxPriceTrough,
                recovery: priceRecovery,
                peakToTrough:      dayDiff(maxPriceStart, maxPriceTrough),
                troughToRecovery:  priceRecovery !== 'Not yet' ? dayDiff(maxPriceTrough, priceRecovery) : 'N/A',
            },
        },
    };
}

function dayDiff(a, b) {
    if (!a || !b || b === 'Not yet') return 'N/A';
    return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ── Monthly drawdown helper (keep for sheet columns) ─────────────────────────
function addMonthlyDrawdowns(rows) {
    let portPeak = -Infinity, portPeakDate = '';
    let pricePeak = -Infinity, pricePeakDate = '';
    for (const r of rows) {
        if (r.portfolioValue > portPeak) { portPeak = r.portfolioValue; portPeakDate = r.dateStr; }
        r.portDrawdownPct = +((r.portfolioValue - portPeak) / portPeak * 100).toFixed(2);
        if (r.price > pricePeak) { pricePeak = r.price; pricePeakDate = r.dateStr; }
        r.priceDrawdownPct = +((r.price - pricePeak) / pricePeak * 100).toFixed(2);
    }
    return rows;
}

async function main() {
    console.log('Fetching monthly data for QQQ & SPY...');
    const [qqqMo, spyMo] = await Promise.all([fetchMonthlyDCA('QQQ'), fetchMonthlyDCA('SPY')]);
    addMonthlyDrawdowns(qqqMo);
    addMonthlyDrawdowns(spyMo);

    console.log('Fetching daily data for QQQ & SPY (this may take a moment)...');
    const [qqqDayRaw, spyDayRaw] = await Promise.all([fetchDailyDCA('QQQ'), fetchDailyDCA('SPY')]);

    const { rows: qqqDay, summary: qSum } = calcDrawdowns(qqqDayRaw);
    const { rows: spyDay, summary: sSum } = calcDrawdowns(spyDayRaw);

    console.log(`QQQ: ${qqqMo.length} monthly | ${qqqDay.length} daily`);
    console.log(`SPY: ${spyMo.length} monthly | ${spyDay.length} daily`);

    // ── Excel ──────────────────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    // DCA sheets (monthly)
    const dcaHeader = [
        'Month', 'Adj. Close ($)', 'Monthly Investment ($)', 'Shares Purchased',
        'Total Shares Held', 'Total Invested ($)', 'Portfolio Value ($)',
        'Gain / Loss ($)', 'Return (%)', 'Portfolio Drawdown (%)', 'Price Drawdown (%)',
    ];
    function makeDCASheet(rows) {
        const ws = XLSX.utils.aoa_to_sheet([dcaHeader, ...rows.map(r => [
            r.dateStr, r.price, r.investment, r.sharesBought, r.totalShares,
            r.totalInvested, r.portfolioValue, r.gainLoss, r.returnPct,
            r.portDrawdownPct, r.priceDrawdownPct,
        ])]);
        ws['!cols'] = [
            {wch:10},{wch:16},{wch:22},{wch:18},{wch:18},
            {wch:18},{wch:20},{wch:18},{wch:12},{wch:22},{wch:20},
        ];
        return ws;
    }
    XLSX.utils.book_append_sheet(wb, makeDCASheet(qqqMo), 'QQQ DCA');
    XLSX.utils.book_append_sheet(wb, makeDCASheet(spyMo), 'SPY (SPX) DCA');

    // Comparison sheet (monthly)
    const spyByDate = Object.fromEntries(spyMo.map(r => [r.dateStr, r]));
    const compWs = XLSX.utils.aoa_to_sheet([
        ['Month','QQQ Price ($)','QQQ Portfolio ($)','QQQ Return (%)','QQQ Port. DD (%)',
                 'SPY Price ($)','SPY Portfolio ($)','SPY Return (%)','SPY Port. DD (%)'],
        ...qqqMo.map(r => {
            const s = spyByDate[r.dateStr];
            return [r.dateStr, r.price, r.portfolioValue, r.returnPct, r.portDrawdownPct,
                    s?.price??'', s?.portfolioValue??'', s?.returnPct??'', s?.portDrawdownPct??''];
        }),
    ]);
    compWs['!cols'] = [{wch:10},{wch:14},{wch:18},{wch:14},{wch:16},{wch:14},{wch:18},{wch:14},{wch:16}];
    XLSX.utils.book_append_sheet(wb, compWs, 'Comparison');

    // Drawdown Analysis sheet (daily-based)
    const ddData = [
        ['Drawdown Analysis — Daily Adj. Close (QQQ vs SPY, May 2006 – May 2026)'],
        ['Note: Peak/trough/recovery dates are exact trading days from daily price data.'],
        ['Duration is in calendar days.'],
        [],
        ['', 'Metric', 'QQQ', 'SPY'],
        ['PORTFOLIO VALUE DRAWDOWN (daily)'],
        ['', 'Max Drawdown (%)',             `${qSum.portfolio.drawdown}%`,         `${sSum.portfolio.drawdown}%`],
        ['', 'Peak Date',                    qSum.portfolio.peak,                   sSum.portfolio.peak],
        ['', 'Trough Date',                  qSum.portfolio.trough,                 sSum.portfolio.trough],
        ['', 'Peak → Trough (calendar days)',qSum.portfolio.peakToTrough,           sSum.portfolio.peakToTrough],
        ['', 'Recovery Date',               qSum.portfolio.recovery,               sSum.portfolio.recovery],
        ['', 'Trough → Recovery (cal. days)',qSum.portfolio.troughToRecovery,       sSum.portfolio.troughToRecovery],
        [],
        ['PRICE (ADJ. CLOSE) DRAWDOWN (daily)'],
        ['', 'Max Drawdown (%)',             `${qSum.price.drawdown}%`,             `${sSum.price.drawdown}%`],
        ['', 'Peak Date',                    qSum.price.peak,                       sSum.price.peak],
        ['', 'Trough Date',                  qSum.price.trough,                     sSum.price.trough],
        ['', 'Peak → Trough (calendar days)',qSum.price.peakToTrough,               sSum.price.peakToTrough],
        ['', 'Recovery Date',               qSum.price.recovery,                   sSum.price.recovery],
        ['', 'Trough → Recovery (cal. days)',qSum.price.troughToRecovery,           sSum.price.troughToRecovery],
    ];
    const ddWs = XLSX.utils.aoa_to_sheet(ddData);
    ddWs['!cols'] = [{wch:38},{wch:32},{wch:18},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ddWs, 'Drawdown Analysis');

    // Daily data sheets
    const dailyHeader = [
        'Date', 'Adj. Close ($)', 'Total Shares Held', 'Total Invested ($)',
        'Portfolio Value ($)', 'Portfolio Drawdown (%)', 'Price Drawdown (%)',
    ];
    function makeDailySheet(rows) {
        const ws = XLSX.utils.aoa_to_sheet([dailyHeader, ...rows.map(r => [
            r.dateStr, r.price, r.totalShares, r.totalInvested,
            r.portfolioValue, r.portDrawdownPct, r.priceDrawdownPct,
        ])]);
        ws['!cols'] = [
            {wch:12},{wch:16},{wch:20},{wch:18},{wch:20},{wch:22},{wch:20},
        ];
        return ws;
    }
    XLSX.utils.book_append_sheet(wb, makeDailySheet(qqqDay), 'QQQ Daily');
    XLSX.utils.book_append_sheet(wb, makeDailySheet(spyDay), 'SPY Daily');

    const excelPath = path.join(__dirname, 'QQQ_SPY_DCA_Analysis.xlsx');
    XLSX.writeFile(wb, excelPath);
    console.log(`Excel saved → ${excelPath}`);

    // ── HTML Chart ─────────────────────────────────────────────────────────────
    // Monthly series for portfolio/price charts
    const moLabels      = qqqMo.map(r => r.dateStr);
    const qqqPortMo     = qqqMo.map(r => r.portfolioValue);
    const spyPortMo     = spyMo.map(r => r.portfolioValue);
    const investedMo    = qqqMo.map(r => r.totalInvested);
    const qqqPriceMo    = qqqMo.map(r => r.price);
    const spyPriceMo    = spyMo.map(r => r.price);

    // Daily series — downsample to every 5th point for chart perf (~1000 pts)
    const step = Math.max(1, Math.floor(qqqDay.length / 1200));
    const dayLabels  = qqqDay.filter((_,i) => i % step === 0).map(r => r.dateStr);
    const qqqPortDD  = qqqDay.filter((_,i) => i % step === 0).map(r => r.portDrawdownPct);
    const spyPortDD  = spyDay.filter((_,i) => i % step === 0).map(r => r.portDrawdownPct);
    const qqqPriceDD = qqqDay.filter((_,i) => i % step === 0).map(r => r.priceDrawdownPct);
    const spyPriceDD = spyDay.filter((_,i) => i % step === 0).map(r => r.priceDrawdownPct);

    const qLast = qqqMo[qqqMo.length - 1];
    const sLast = spyMo[spyMo.length - 1];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QQQ vs SPY DCA Analysis — May 2006 to May 2026</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #f0f2f5; margin: 0; padding: 24px; }
    h1 { text-align: center; color: #1a237e; margin-bottom: 6px; font-size: 22px; }
    p.sub { text-align: center; color: #555; margin-top: 0; margin-bottom: 20px; font-size: 13px; }
    .summary { display: flex; justify-content: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .group { background: white; border-radius: 12px; padding: 16px 24px;
             box-shadow: 0 2px 8px rgba(0,0,0,.1); display: flex; gap: 16px; flex-wrap: wrap; }
    .group h2 { width: 100%; margin: 0 0 8px; font-size: 15px; border-bottom: 2px solid; padding-bottom: 6px; }
    .group.qqq h2 { border-color: #1565c0; color: #1565c0; }
    .group.spy h2 { border-color: #c62828; color: #c62828; }
    .card { text-align: center; min-width: 110px; }
    .card .label { font-size: 11px; color: #888; margin-bottom: 4px; }
    .card .value { font-size: 18px; font-weight: bold; }
    .card .value.green { color: #2e7d32; }
    .card .value.red   { color: #b71c1c; }
    .chart-wrap { background: white; border-radius: 12px; padding: 20px;
                  box-shadow: 0 2px 8px rgba(0,0,0,.1); margin-bottom: 24px; }
    .note { font-size: 12px; color: #888; text-align: right; margin-top: 6px; }
    .dd-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    .dd-table th { background: #e8eaf6; padding: 8px 12px; text-align: left; }
    .dd-table td { padding: 7px 12px; border-bottom: 1px solid #eee; }
    .dd-table tr:last-child td { border-bottom: none; }
    .sect td { font-weight: bold; background: #f5f5f5; color: #333; }
  </style>
</head>
<body>
<h1>QQQ vs SPY (SPX) — Dollar-Cost Averaging $1,000/month</h1>
<p class="sub">May 2006 – May 2026 &nbsp;|&nbsp; Adjusted Close (dividends reinvested) &nbsp;|&nbsp;
  Total invested: $${qLast.totalInvested.toLocaleString()} &nbsp;|&nbsp;
  Drawdown charts use <strong>daily</strong> data</p>

<div class="summary">
  <div class="group qqq">
    <h2>QQQ (Nasdaq-100)</h2>
    <div class="card"><div class="label">Portfolio Value</div>
      <div class="value green">$${qLast.portfolioValue.toLocaleString()}</div></div>
    <div class="card"><div class="label">Total Return</div>
      <div class="value green">${qLast.returnPct}%</div></div>
    <div class="card"><div class="label">Max Port. Drawdown</div>
      <div class="value red">${qSum.portfolio.drawdown}%</div></div>
    <div class="card"><div class="label">Max Price Drawdown</div>
      <div class="value red">${qSum.price.drawdown}%</div></div>
  </div>
  <div class="group spy">
    <h2>SPY (S&amp;P 500)</h2>
    <div class="card"><div class="label">Portfolio Value</div>
      <div class="value green">$${sLast.portfolioValue.toLocaleString()}</div></div>
    <div class="card"><div class="label">Total Return</div>
      <div class="value green">${sLast.returnPct}%</div></div>
    <div class="card"><div class="label">Max Port. Drawdown</div>
      <div class="value red">${sSum.portfolio.drawdown}%</div></div>
    <div class="card"><div class="label">Max Price Drawdown</div>
      <div class="value red">${sSum.price.drawdown}%</div></div>
  </div>
</div>

<div class="chart-wrap">
  <canvas id="portfolioChart" height="75"></canvas>
</div>
<div class="chart-wrap">
  <canvas id="priceChart" height="60"></canvas>
</div>
<div class="chart-wrap">
  <canvas id="drawdownPortChart" height="55"></canvas>
  <p class="note">Based on daily adjusted close prices</p>
</div>
<div class="chart-wrap">
  <canvas id="drawdownPriceChart" height="55"></canvas>
  <p class="note">Based on daily adjusted close prices</p>
</div>

<div class="chart-wrap">
  <h3 style="margin:0 0 12px;color:#1a237e">Drawdown Summary — Daily Data</h3>
  <table class="dd-table">
    <thead><tr><th>Metric</th><th>QQQ</th><th>SPY</th></tr></thead>
    <tbody>
      <tr class="sect"><td colspan="3">Portfolio Value Drawdown</td></tr>
      <tr><td>Max Drawdown</td><td style="color:#b71c1c">${qSum.portfolio.drawdown}%</td><td style="color:#b71c1c">${sSum.portfolio.drawdown}%</td></tr>
      <tr><td>Peak Date</td><td>${qSum.portfolio.peak}</td><td>${sSum.portfolio.peak}</td></tr>
      <tr><td>Trough Date</td><td>${qSum.portfolio.trough}</td><td>${sSum.portfolio.trough}</td></tr>
      <tr><td>Peak → Trough</td><td>${qSum.portfolio.peakToTrough} calendar days</td><td>${sSum.portfolio.peakToTrough} calendar days</td></tr>
      <tr><td>Recovery Date</td><td>${qSum.portfolio.recovery}</td><td>${sSum.portfolio.recovery}</td></tr>
      <tr><td>Trough → Recovery</td><td>${qSum.portfolio.troughToRecovery === 'N/A' ? 'N/A' : qSum.portfolio.troughToRecovery + ' cal. days'}</td>
          <td>${sSum.portfolio.troughToRecovery === 'N/A' ? 'N/A' : sSum.portfolio.troughToRecovery + ' cal. days'}</td></tr>
      <tr class="sect"><td colspan="3">Price (Adj. Close) Drawdown</td></tr>
      <tr><td>Max Drawdown</td><td style="color:#b71c1c">${qSum.price.drawdown}%</td><td style="color:#b71c1c">${sSum.price.drawdown}%</td></tr>
      <tr><td>Peak Date</td><td>${qSum.price.peak}</td><td>${sSum.price.peak}</td></tr>
      <tr><td>Trough Date</td><td>${qSum.price.trough}</td><td>${sSum.price.trough}</td></tr>
      <tr><td>Peak → Trough</td><td>${qSum.price.peakToTrough} calendar days</td><td>${sSum.price.peakToTrough} calendar days</td></tr>
      <tr><td>Recovery Date</td><td>${qSum.price.recovery}</td><td>${sSum.price.recovery}</td></tr>
      <tr><td>Trough → Recovery</td><td>${qSum.price.troughToRecovery === 'N/A' ? 'N/A' : qSum.price.troughToRecovery + ' cal. days'}</td>
          <td>${sSum.price.troughToRecovery === 'N/A' ? 'N/A' : sSum.price.troughToRecovery + ' cal. days'}</td></tr>
    </tbody>
  </table>
</div>

<script>
const moLabels   = ${JSON.stringify(moLabels)};
const qqqPortMo  = ${JSON.stringify(qqqPortMo)};
const spyPortMo  = ${JSON.stringify(spyPortMo)};
const investedMo = ${JSON.stringify(investedMo)};
const qqqPriceMo = ${JSON.stringify(qqqPriceMo)};
const spyPriceMo = ${JSON.stringify(spyPriceMo)};
const dayLabels  = ${JSON.stringify(dayLabels)};
const qqqPortDD  = ${JSON.stringify(qqqPortDD)};
const spyPortDD  = ${JSON.stringify(spyPortDD)};
const qqqPriceDD = ${JSON.stringify(qqqPriceDD)};
const spyPriceDD = ${JSON.stringify(spyPriceDD)};

const fmt  = v => '$' + v.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});

new Chart(document.getElementById('portfolioChart'), {
  type: 'line',
  data: { labels: moLabels, datasets: [
    { label: 'QQQ Portfolio Value', data: qqqPortMo,
      borderColor: '#1565c0', backgroundColor: 'rgba(21,101,192,0.12)',
      fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
    { label: 'SPY Portfolio Value', data: spyPortMo,
      borderColor: '#c62828', backgroundColor: 'rgba(198,40,40,0.08)',
      fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
    { label: 'Total Invested', data: investedMo,
      borderColor: '#555', backgroundColor: 'rgba(0,0,0,0.04)',
      fill: true, tension: 0, pointRadius: 0, borderWidth: 1.5, borderDash: [6,3] },
  ]},
  options: {
    responsive: true, interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: true, text: 'Portfolio Value vs. Total Invested', font: { size: 16 } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmt(ctx.parsed.y) } }
    },
    scales: { y: { ticks: { callback: v => '$' + v.toLocaleString() } } }
  }
});

new Chart(document.getElementById('priceChart'), {
  type: 'line',
  data: { labels: moLabels, datasets: [
    { label: 'QQQ Adj. Close', data: qqqPriceMo,
      borderColor: '#1565c0', fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 },
    { label: 'SPY Adj. Close', data: spyPriceMo,
      borderColor: '#c62828', fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 },
  ]},
  options: {
    responsive: true, interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: true, text: 'Adj. Close Price (dividends reinvested)', font: { size: 16 } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': $' + ctx.parsed.y.toFixed(2) } }
    },
    scales: { y: { ticks: { callback: v => '$' + v.toLocaleString() } } }
  }
});

new Chart(document.getElementById('drawdownPortChart'), {
  type: 'line',
  data: { labels: dayLabels, datasets: [
    { label: 'QQQ Portfolio Drawdown', data: qqqPortDD,
      borderColor: '#1565c0', backgroundColor: 'rgba(21,101,192,0.15)',
      fill: true, tension: 0.2, pointRadius: 0, borderWidth: 1.5 },
    { label: 'SPY Portfolio Drawdown', data: spyPortDD,
      borderColor: '#c62828', backgroundColor: 'rgba(198,40,40,0.10)',
      fill: true, tension: 0.2, pointRadius: 0, borderWidth: 1.5 },
  ]},
  options: {
    responsive: true, interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: true, text: 'Portfolio Drawdown from Peak — Daily (%)', font: { size: 16 } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + '%' } }
    },
    scales: { y: { ticks: { callback: v => v + '%' } } }
  }
});

new Chart(document.getElementById('drawdownPriceChart'), {
  type: 'line',
  data: { labels: dayLabels, datasets: [
    { label: 'QQQ Price Drawdown', data: qqqPriceDD,
      borderColor: '#1565c0', backgroundColor: 'rgba(21,101,192,0.15)',
      fill: true, tension: 0.2, pointRadius: 0, borderWidth: 1.5 },
    { label: 'SPY Price Drawdown', data: spyPriceDD,
      borderColor: '#c62828', backgroundColor: 'rgba(198,40,40,0.10)',
      fill: true, tension: 0.2, pointRadius: 0, borderWidth: 1.5 },
  ]},
  options: {
    responsive: true, interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: true, text: 'Price Drawdown from Peak — Daily Adj. Close (%)', font: { size: 16 } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + '%' } }
    },
    scales: { y: { ticks: { callback: v => v + '%' } } }
  }
});
</script>
</body>
</html>`;

    const htmlPath = path.join(__dirname, 'QQQ_SPY_DCA_Chart.html');
    fs.writeFileSync(htmlPath, html);
    console.log(`Chart saved  → ${htmlPath}`);

    // ── Console summary ────────────────────────────────────────────────────────
    const qL = qqqMo[qqqMo.length - 1], sL = spyMo[spyMo.length - 1];
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  DCA Summary — $1,000/month | May 2006 – May 2026        ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Total invested                  : $${qL.totalInvested.toLocaleString().padEnd(19)}║`);
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  QQQ portfolio value             : $${qL.portfolioValue.toLocaleString().padEnd(19)}║`);
    console.log(`║  QQQ return                      : ${(qL.returnPct+'%').padEnd(20)}║`);
    console.log(`║  QQQ max port. drawdown (daily)  : ${(qSum.portfolio.drawdown+'%').padEnd(20)}║`);
    console.log(`║  QQQ max price drawdown (daily)  : ${(qSum.price.drawdown+'%').padEnd(20)}║`);
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  SPY portfolio value             : $${sL.portfolioValue.toLocaleString().padEnd(19)}║`);
    console.log(`║  SPY return                      : ${(sL.returnPct+'%').padEnd(20)}║`);
    console.log(`║  SPY max port. drawdown (daily)  : ${(sSum.portfolio.drawdown+'%').padEnd(20)}║`);
    console.log(`║  SPY max price drawdown (daily)  : ${(sSum.price.drawdown+'%').padEnd(20)}║`);
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('QQQ Portfolio Drawdown (daily):');
    console.log(`  Peak: ${qSum.portfolio.peak}  Trough: ${qSum.portfolio.trough}  Recovery: ${qSum.portfolio.recovery}`);
    console.log(`  Peak→Trough: ${qSum.portfolio.peakToTrough} days  |  Trough→Recovery: ${qSum.portfolio.troughToRecovery} days\n`);
    console.log('QQQ Price Drawdown (daily):');
    console.log(`  Peak: ${qSum.price.peak}  Trough: ${qSum.price.trough}  Recovery: ${qSum.price.recovery}`);
    console.log(`  Peak→Trough: ${qSum.price.peakToTrough} days  |  Trough→Recovery: ${qSum.price.troughToRecovery} days\n`);
    console.log('SPY Portfolio Drawdown (daily):');
    console.log(`  Peak: ${sSum.portfolio.peak}  Trough: ${sSum.portfolio.trough}  Recovery: ${sSum.portfolio.recovery}`);
    console.log(`  Peak→Trough: ${sSum.portfolio.peakToTrough} days  |  Trough→Recovery: ${sSum.portfolio.troughToRecovery} days\n`);
    console.log('SPY Price Drawdown (daily):');
    console.log(`  Peak: ${sSum.price.peak}  Trough: ${sSum.price.trough}  Recovery: ${sSum.price.recovery}`);
    console.log(`  Peak→Trough: ${sSum.price.peakToTrough} days  |  Trough→Recovery: ${sSum.price.troughToRecovery} days\n`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
