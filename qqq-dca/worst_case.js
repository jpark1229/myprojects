const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

async function fetchMonthly(ticker) {
    const data = await yahooFinance.historical(ticker, {
        period1: '1996-01-01',
        period2: '2026-06-01',
        interval: '1mo',
    });
    if (!data || data.length === 0) throw new Error('No data for ' + ticker);
    data.sort((a, b) => a.date - b.date);
    return data
        .map(bar => ({
            dateStr: bar.date.getFullYear() + '-' + String(bar.date.getMonth() + 1).padStart(2, '0'),
            price: +(bar.adjClose ?? bar.close),
        }))
        .filter(r => r.price > 0);
}

function simulateAndTrack(prices) {
    let totalShares = 0, totalInvested = 0;
    let peak = -Infinity, maxDD = 0;
    const rows = [];

    let pricePeak = -Infinity, maxPriceDD = 0;

    for (const { dateStr, price } of prices) {
        const sharesBought = 1000 / price;
        totalShares += sharesBought;
        totalInvested += 1000;
        const pv = +(totalShares * price).toFixed(2);
        if (pv > peak) peak = pv;
        const dd = +((pv - peak) / peak * 100).toFixed(2);
        if (dd < maxDD) maxDD = dd;
        const gainLoss = +(pv - totalInvested).toFixed(2);
        const returnPct = +((gainLoss / totalInvested) * 100).toFixed(2);
        if (price > pricePeak) pricePeak = price;
        const priceDD = +((price - pricePeak) / pricePeak * 100).toFixed(2);
        if (priceDD < maxPriceDD) maxPriceDD = priceDD;
        rows.push({
            dateStr, price: +price.toFixed(2),
            investment: 1000,
            sharesBought: +sharesBought.toFixed(6),
            totalShares: +totalShares.toFixed(6),
            totalInvested,
            portfolioValue: pv,
            gainLoss,
            returnPct,
            drawdownPct: dd,
            priceDrawdownPct: priceDD,
        });
    }

    return { rows, maxDrawdown: +maxDD.toFixed(2), maxPriceDrawdown: +maxPriceDD.toFixed(2) };
}

async function main() {
    console.log('Fetching QQQ monthly data...');
    const allPrices = await fetchMonthly('QQQ');
    console.log('Available: ' + allPrices[0].dateStr + ' → ' + allPrices[allPrices.length - 1].dateStr);

    const WINDOW = 240;
    let worstIdx = 0, worstVal = Infinity;

    for (let i = 0; i <= allPrices.length - WINDOW; i++) {
        const slice = allPrices.slice(i, i + WINDOW);
        let totalShares = 0;
        for (const { price } of slice) totalShares += 1000 / price;
        const finalValue = totalShares * slice[WINDOW - 1].price;
        if (finalValue < worstVal) { worstVal = finalValue; worstIdx = i; }
    }

    const worstSlice = allPrices.slice(worstIdx, worstIdx + WINDOW);
    const { rows, maxDrawdown, maxPriceDrawdown } = simulateAndTrack(worstSlice);

    const startDate = worstSlice[0].dateStr;
    const endDate   = worstSlice[WINDOW - 1].dateStr;
    const last      = rows[rows.length - 1];
    const returnPct = +((last.portfolioValue - last.totalInvested) / last.totalInvested * 100).toFixed(2);

    console.log('Worst window: ' + startDate + ' → ' + endDate);
    console.log('Final value: $' + Math.round(last.portfolioValue).toLocaleString() +
                ' | Max DD: ' + maxDrawdown + '% | Return: ' + returnPct + '%');

    const html = buildHTML(rows, startDate, endDate, maxDrawdown, maxPriceDrawdown, returnPct);
    const htmlPath = path.join(__dirname, 'QQQ_WorstCase_Chart.html');
    fs.writeFileSync(htmlPath, html);
    console.log('Saved → ' + htmlPath);

    saveExcel(rows, startDate, endDate, maxDrawdown, maxPriceDrawdown, returnPct);
}

function saveExcel(rows, startDate, endDate, maxDrawdown, maxPriceDrawdown, returnPct) {
    const wb = XLSX.utils.book_new();

    // ── DCA sheet ────────────────────────────────────────────────────────────────
    const header = [
        'Month', 'Adj. Close ($)', 'Monthly Investment ($)', 'Shares Purchased',
        'Total Shares Held', 'Total Invested ($)', 'Portfolio Value ($)',
        'Gain / Loss ($)', 'Return (%)', 'Portfolio Drawdown (%)', 'Price Drawdown (%)',
    ];
    const dcaWs = XLSX.utils.aoa_to_sheet([
        header,
        ...rows.map(r => [
            r.dateStr, r.price, r.investment, r.sharesBought, r.totalShares,
            r.totalInvested, r.portfolioValue, r.gainLoss, r.returnPct,
            r.drawdownPct, r.priceDrawdownPct,
        ]),
    ]);
    dcaWs['!cols'] = [
        {wch:10},{wch:16},{wch:22},{wch:18},{wch:18},
        {wch:18},{wch:20},{wch:18},{wch:12},{wch:22},{wch:20},
    ];
    XLSX.utils.book_append_sheet(wb, dcaWs, 'QQQ DCA (Worst Case)');

    // ── Summary sheet ─────────────────────────────────────────────────────────
    const last = rows[rows.length - 1];
    const summaryWs = XLSX.utils.aoa_to_sheet([
        ['QQQ Worst-Case 20-Year DCA Window'],
        [],
        ['Metric', 'Value'],
        ['Window Start',                startDate],
        ['Window End',                  endDate],
        ['Total Invested ($)',           last.totalInvested],
        ['Final Portfolio Value ($)',    last.portfolioValue],
        ['Total Return (%)',             returnPct],
        ['Gain / Loss ($)',              last.gainLoss],
        ['Max Portfolio Drawdown (%)',   maxDrawdown],
        ['Max Price Drawdown (%)',       maxPriceDrawdown],
    ]);
    summaryWs['!cols'] = [{wch:28},{wch:20}];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    const xlsxPath = path.join(__dirname, 'QQQ_WorstCase_Analysis.xlsx');
    XLSX.writeFile(wb, xlsxPath);
    console.log('Saved → ' + xlsxPath);
}

function buildHTML(rows, startDate, endDate, maxDrawdown, maxPriceDrawdown, returnPct) {
    const labels          = rows.map(r => r.dateStr);
    const portfolioValues = rows.map(r => r.portfolioValue);
    const investedValues  = rows.map(r => r.totalInvested);
    const prices          = rows.map(r => r.price);
    const drawdowns       = rows.map(r => r.drawdownPct);
    const priceDrawdowns  = rows.map(r => r.priceDrawdownPct);

    const last         = rows[rows.length - 1];
    const finalValue   = last.portfolioValue;
    const totalInvested = last.totalInvested;
    const fmt = v => '$' + Math.round(v).toLocaleString('en-US');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QQQ Worst-Case 20-Year DCA Window</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f0f2f5; padding: 24px; }
    h1 { text-align: center; color: #b71c1c; font-size: 22px; margin-bottom: 6px; }
    .sub { text-align: center; color: #555; font-size: 13px; margin-bottom: 24px; }
    .chart-wrap { background: white; border-radius: 12px; padding: 24px;
                  box-shadow: 0 2px 8px rgba(0,0,0,.1); margin-bottom: 24px; }
    .stats { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin-bottom: 24px; }
    .card { background: white; border-radius: 12px; padding: 14px 22px;
            box-shadow: 0 2px 8px rgba(0,0,0,.1); text-align: center; min-width: 140px; }
    .card .lbl { font-size: 11px; color: #888; margin-bottom: 4px; }
    .card .val { font-size: 20px; font-weight: bold; }
    .green { color: #2e7d32; } .red { color: #b71c1c; } .blue { color: #1565c0; }
    .note { font-size: 12px; color: #888; text-align: right; margin-top: 6px; }
  </style>
</head>
<body>

<h1>QQQ — Worst-Case 20-Year DCA Window</h1>
<p class="sub">${startDate} → ${endDate} &nbsp;|&nbsp; $1,000/month &nbsp;|&nbsp; Total invested: ${fmt(totalInvested)}</p>

<div class="stats">
  <div class="card">
    <div class="lbl">Final Portfolio Value</div>
    <div class="val green">${fmt(finalValue)}</div>
  </div>
  <div class="card">
    <div class="lbl">Total Invested</div>
    <div class="val blue">${fmt(totalInvested)}</div>
  </div>
  <div class="card">
    <div class="lbl">Total Return</div>
    <div class="val green">${returnPct}%</div>
  </div>
  <div class="card">
    <div class="lbl">Max Portfolio Drawdown</div>
    <div class="val red">${maxDrawdown}%</div>
  </div>
  <div class="card">
    <div class="lbl">Max Price Drawdown</div>
    <div class="val red">${maxPriceDrawdown}%</div>
  </div>
</div>

<div class="chart-wrap">
  <canvas id="portfolioChart" height="75"></canvas>
</div>

<div class="chart-wrap">
  <canvas id="priceChart" height="60"></canvas>
  <p class="note">Monthly adjusted close (dividends reinvested)</p>
</div>

<div class="chart-wrap">
  <canvas id="drawdownChart" height="55"></canvas>
</div>

<div class="chart-wrap">
  <canvas id="priceDrawdownChart" height="55"></canvas>
  <p class="note">Based on monthly adjusted close prices</p>
</div>

<script>
const labels          = ${JSON.stringify(labels)};
const portfolioValues = ${JSON.stringify(portfolioValues)};
const investedValues  = ${JSON.stringify(investedValues)};
const prices          = ${JSON.stringify(prices)};
const drawdowns       = ${JSON.stringify(drawdowns)};
const priceDrawdowns  = ${JSON.stringify(priceDrawdowns)};

const fmt = v => '$' + Math.round(v).toLocaleString('en-US');

new Chart(document.getElementById('portfolioChart'), {
  type: 'line',
  data: { labels, datasets: [
    { label: 'Portfolio Value', data: portfolioValues,
      borderColor: '#1565c0', backgroundColor: 'rgba(21,101,192,0.12)',
      fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
    { label: 'Total Invested', data: investedValues,
      borderColor: '#555', backgroundColor: 'rgba(0,0,0,0.04)',
      fill: true, tension: 0, pointRadius: 0, borderWidth: 1.5, borderDash: [6,3] },
  ]},
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: true, text: 'Portfolio Value vs Total Invested', font: { size: 15 }, color: '#1a237e' },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmt(ctx.parsed.y) } },
    },
    scales: { y: { ticks: { callback: v => '$' + v.toLocaleString() } } }
  }
});

new Chart(document.getElementById('priceChart'), {
  type: 'line',
  data: { labels, datasets: [
    { label: 'QQQ Adj. Close', data: prices,
      borderColor: '#6a1b9a', backgroundColor: 'rgba(106,27,154,0.10)',
      fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
  ]},
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: true, text: 'QQQ Adjusted Close Price', font: { size: 15 }, color: '#1a237e' },
      tooltip: { callbacks: { label: ctx => ' QQQ: $' + ctx.parsed.y.toFixed(2) } },
    },
    scales: { y: { ticks: { callback: v => '$' + v.toFixed(0) } } }
  }
});

new Chart(document.getElementById('drawdownChart'), {
  type: 'line',
  data: { labels, datasets: [
    { label: 'Portfolio Drawdown', data: drawdowns,
      borderColor: '#c62828', backgroundColor: 'rgba(198,40,40,0.15)',
      fill: true, tension: 0.2, pointRadius: 0, borderWidth: 1.5 },
  ]},
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: true, text: 'Portfolio Drawdown from Peak (%)', font: { size: 15 }, color: '#1a237e' },
      tooltip: { callbacks: { label: ctx => ' Drawdown: ' + ctx.parsed.y.toFixed(2) + '%' } },
    },
    scales: { y: { ticks: { callback: v => v + '%' } } }
  }
});

new Chart(document.getElementById('priceDrawdownChart'), {
  type: 'line',
  data: { labels, datasets: [
    { label: 'Price Drawdown', data: priceDrawdowns,
      borderColor: '#e65100', backgroundColor: 'rgba(230,81,0,0.15)',
      fill: true, tension: 0.2, pointRadius: 0, borderWidth: 1.5 },
  ]},
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: true, text: 'Price Drawdown from Peak — Adj. Close (%)', font: { size: 15 }, color: '#1a237e' },
      tooltip: { callbacks: { label: ctx => ' Price DD: ' + ctx.parsed.y.toFixed(2) + '%' } },
    },
    scales: { y: { ticks: { callback: v => v + '%' } } }
  }
});
<\/script>
</body>
</html>`;
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
