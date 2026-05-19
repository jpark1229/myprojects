const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });
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

function simulateWindow(prices) {
    let totalShares = 0, totalInvested = 0;
    let peak = -Infinity, maxDD = 0;

    for (const { price } of prices) {
        totalShares += 1000 / price;
        totalInvested += 1000;
        const pv = totalShares * price;
        if (pv > peak) peak = pv;
        const dd = (pv - peak) / peak * 100;
        if (dd < maxDD) maxDD = dd;
    }

    const finalValue = +(totalShares * prices[prices.length - 1].price).toFixed(2);
    return {
        finalValue,
        maxDrawdown: +maxDD.toFixed(2),
        totalInvested,
        returnPct: +((finalValue - totalInvested) / totalInvested * 100).toFixed(2),
    };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function toColor(t) {
    // low return → red/orange, high return → blue
    const r = Math.round(lerp(196, 21, t));
    const g = Math.round(lerp(50, 101, t));
    const b = Math.round(lerp(50, 192, t));
    return 'rgba(' + r + ',' + g + ',' + b + ',0.8)';
}

async function main() {
    console.log('Fetching QQQ monthly data (1996–2026)...');
    const prices = await fetchMonthly('QQQ');
    console.log('Available: ' + prices[0].dateStr + ' → ' + prices[prices.length - 1].dateStr + ' (' + prices.length + ' months)');

    const WINDOW = 240; // 20 years × 12 months
    const results = [];

    for (let i = 0; i <= prices.length - WINDOW; i++) {
        const slice = prices.slice(i, i + WINDOW);
        const sim = simulateWindow(slice);
        results.push({
            startDate: slice[0].dateStr,
            endDate: slice[WINDOW - 1].dateStr,
            ...sim,
        });
    }

    console.log('Computed ' + results.length + ' rolling 20-year windows');

    const returns = results.map(r => r.returnPct);
    const minReturn = Math.min(...returns);
    const maxReturn = Math.max(...returns);

    const best   = results.reduce((a, b) => a.finalValue > b.finalValue ? a : b);
    const worst  = results.reduce((a, b) => a.finalValue < b.finalValue ? a : b);
    const sortedByVal = [...results].sort((a, b) => a.finalValue - b.finalValue);
    const median = sortedByVal[Math.floor(sortedByVal.length / 2)];
    const avgVal = +(results.reduce((s, r) => s + r.finalValue, 0) / results.length).toFixed(2);
    const avgDD  = +(results.reduce((s, r) => s + r.maxDrawdown, 0) / results.length).toFixed(2);

    const scatterData = results.map(r => ({
        x: r.finalValue,
        y: r.maxDrawdown,
        startDate: r.startDate,
        endDate: r.endDate,
        returnPct: r.returnPct,
        totalInvested: r.totalInvested,
    }));

    const colors = results.map(r => toColor((r.returnPct - minReturn) / (maxReturn - minReturn)));

    const html = buildHTML(scatterData, colors, best, worst, median, avgVal, avgDD, results.length);
    const outPath = path.join(__dirname, 'QQQ_DCA_Scatter.html');
    fs.writeFileSync(outPath, html);
    console.log('\nSaved → ' + outPath);

    console.log('\n  Best:   ' + best.startDate + ' → ' + best.endDate +
                ' | $' + best.finalValue.toLocaleString() + ' | DD: ' + best.maxDrawdown + '% | Return: ' + best.returnPct + '%');
    console.log('  Worst:  ' + worst.startDate + ' → ' + worst.endDate +
                ' | $' + worst.finalValue.toLocaleString() + ' | DD: ' + worst.maxDrawdown + '% | Return: ' + worst.returnPct + '%');
    console.log('  Median: ' + median.startDate + ' → ' + median.endDate +
                ' | $' + median.finalValue.toLocaleString() + ' | DD: ' + median.maxDrawdown + '% | Return: ' + median.returnPct + '%');
    console.log('  Avg final value: $' + Math.round(avgVal).toLocaleString() + ' | Avg max DD: ' + avgDD + '%\n');
}

function buildHTML(scatterData, colors, best, worst, median, avgVal, avgDD, windowCount) {
    const fmt = v => '$' + Math.round(v).toLocaleString('en-US');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QQQ DCA — Rolling 20-Year Windows</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f0f2f5; padding: 24px; }
    h1 { text-align: center; color: #1a237e; font-size: 22px; margin-bottom: 6px; }
    .sub { text-align: center; color: #555; font-size: 13px; margin-bottom: 24px; }
    .chart-wrap { background: white; border-radius: 12px; padding: 24px;
                  box-shadow: 0 2px 8px rgba(0,0,0,.1); margin-bottom: 24px; }
    .stats { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin-bottom: 24px; }
    .card { background: white; border-radius: 12px; padding: 14px 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,.1); text-align: center; min-width: 130px; }
    .card .lbl { font-size: 11px; color: #888; margin-bottom: 4px; }
    .card .val { font-size: 19px; font-weight: bold; }
    .card .dt  { font-size: 11px; color: #aaa; margin-top: 3px; }
    .green { color: #2e7d32; } .red { color: #b71c1c; } .blue { color: #1565c0; }
    .legend { display: flex; align-items: center; justify-content: flex-end;
              gap: 8px; margin-bottom: 10px; font-size: 12px; color: #666; }
    .legend-bar { width: 130px; height: 12px; border-radius: 6px;
                  background: linear-gradient(to right, rgba(196,50,50,0.85), rgba(21,101,192,0.85)); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #e8eaf6; padding: 9px 14px; text-align: left; color: #1a237e; }
    td { padding: 8px 14px; border-bottom: 1px solid #eee; }
    tr:last-child td { border-bottom: none; }
    .hl { background: #fffde7; }
  </style>
</head>
<body>

<h1>QQQ — $1,000/Month DCA: All Rolling 20-Year Windows</h1>
<p class="sub">Each dot = one 20-year window starting on a different month &nbsp;|&nbsp;
  $240,000 total invested &nbsp;|&nbsp; ${windowCount} windows plotted &nbsp;|&nbsp;
  Color: red = low return &rarr; blue = high return</p>

<div class="stats">
  <div class="card">
    <div class="lbl">Windows Analyzed</div>
    <div class="val blue">${windowCount}</div>
    <div class="dt">rolling 20-yr periods</div>
  </div>
  <div class="card">
    <div class="lbl">Best Final Value</div>
    <div class="val green">${fmt(best.finalValue)}</div>
    <div class="dt">${best.startDate} → ${best.endDate}</div>
  </div>
  <div class="card">
    <div class="lbl">Worst Final Value</div>
    <div class="val red">${fmt(worst.finalValue)}</div>
    <div class="dt">${worst.startDate} → ${worst.endDate}</div>
  </div>
  <div class="card">
    <div class="lbl">Median Final Value</div>
    <div class="val">${fmt(median.finalValue)}</div>
    <div class="dt">${median.startDate} → ${median.endDate}</div>
  </div>
  <div class="card">
    <div class="lbl">Avg Final Value</div>
    <div class="val">${fmt(avgVal)}</div>
    <div class="dt">across all windows</div>
  </div>
  <div class="card">
    <div class="lbl">Avg Max Drawdown</div>
    <div class="val red">${avgDD}%</div>
    <div class="dt">portfolio value</div>
  </div>
</div>

<div class="chart-wrap">
  <div class="legend">
    <span>Low return</span>
    <div class="legend-bar"></div>
    <span>High return</span>
  </div>
  <canvas id="scatter" height="65"></canvas>
</div>

<div class="chart-wrap">
  <h3 style="color:#1a237e;margin-bottom:14px">Window Highlights</h3>
  <table>
    <thead>
      <tr><th></th><th>Start → End</th><th>Final Value</th><th>Total Return</th><th>Max Drawdown</th></tr>
    </thead>
    <tbody>
      <tr class="hl">
        <td><strong>Best</strong></td>
        <td>${best.startDate} → ${best.endDate}</td>
        <td class="green"><strong>${fmt(best.finalValue)}</strong></td>
        <td class="green">${best.returnPct}%</td>
        <td class="red">${best.maxDrawdown}%</td>
      </tr>
      <tr>
        <td><strong>Median</strong></td>
        <td>${median.startDate} → ${median.endDate}</td>
        <td><strong>${fmt(median.finalValue)}</strong></td>
        <td>${median.returnPct}%</td>
        <td class="red">${median.maxDrawdown}%</td>
      </tr>
      <tr class="hl">
        <td><strong>Worst</strong></td>
        <td>${worst.startDate} → ${worst.endDate}</td>
        <td class="red"><strong>${fmt(worst.finalValue)}</strong></td>
        <td class="red">${worst.returnPct}%</td>
        <td class="red">${worst.maxDrawdown}%</td>
      </tr>
    </tbody>
  </table>
</div>

<script>
const scatterData = ${JSON.stringify(scatterData)};
const pointColors = ${JSON.stringify(colors)};

new Chart(document.getElementById('scatter'), {
  type: 'scatter',
  data: {
    datasets: [{
      label: 'QQQ 20-Year Window',
      data: scatterData,
      backgroundColor: pointColors,
      borderColor: pointColors,
      pointRadius: 7,
      pointHoverRadius: 10,
      borderWidth: 1,
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: 'QQQ DCA: Max Portfolio Drawdown vs Final Portfolio Value — All Rolling 20-Year Windows',
        font: { size: 15 },
        color: '#1a237e',
        padding: { bottom: 16 },
      },
      tooltip: {
        callbacks: {
          title: () => '',
          label: function(ctx) {
            const p = ctx.dataset.data[ctx.dataIndex];
            const f = function(v) { return '$' + Math.round(v).toLocaleString('en-US'); };
            return [
              'Period: ' + p.startDate + ' → ' + p.endDate,
              'Final Value: ' + f(p.x),
              'Total Return: ' + p.returnPct + '%',
              'Max Drawdown: ' + p.y + '%',
              'Total Invested: ' + f(p.totalInvested),
            ];
          }
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Final Portfolio Value ($)', font: { size: 13 } },
        ticks: { callback: function(v) { return '$' + (v / 1000000).toFixed(2) + 'M'; } },
        grid: { color: '#eee' },
      },
      y: {
        title: { display: true, text: 'Max Portfolio Drawdown (%)', font: { size: 13 } },
        ticks: { callback: function(v) { return v + '%'; } },
        grid: { color: '#eee' },
      }
    }
  }
});
<\/script>
</body>
</html>`;
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
