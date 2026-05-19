const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

async function fetchDCA(ticker) {
    const data = await yahooFinance.historical(ticker, {
        period1: '2006-05-01',
        period2: '2026-05-31',
        interval: '1mo',
    });

    let totalShares = 0, totalInvested = 0;
    const rows = [];

    for (const bar of data) {
        const price = bar.adjClose ?? bar.close;
        if (!price || price <= 0) continue;

        totalShares += 1000 / price;
        totalInvested += 1000;
        const portfolioValue = totalShares * price;
        const dateStr = `${bar.date.getFullYear()}-${String(bar.date.getMonth() + 1).padStart(2, '0')}`;

        rows.push({ dateStr, price, portfolioValue, totalInvested });
    }
    return rows;
}

function maxDrawdown(rows) {
    let peak = -Infinity;
    let peakDate = '';
    let maxDD = 0;
    let ddStart = '', ddTrough = '', ddRecovery = '';
    let inDrawdown = false;
    let troughValue = 0;
    let tempPeakDate = '', tempTroughDate = '', tempTroughValue = 0, tempDD = 0;

    // Also track price drawdown
    let pricePeak = -Infinity;
    let pricePeakDate = '';
    let maxPriceDD = 0;
    let pdStart = '', pdTrough = '', pdRecovery = '';
    let tempPricePeakDate = '', tempPriceTroughDate = '', tempPriceTroughValue = 0, tempPriceDD = 0;

    for (let i = 0; i < rows.length; i++) {
        const { dateStr, portfolioValue, price } = rows[i];

        // --- Portfolio drawdown ---
        if (portfolioValue > peak) {
            peak = portfolioValue;
            peakDate = dateStr;
        }
        const dd = (portfolioValue - peak) / peak;
        if (dd < maxDD) {
            maxDD = dd;
            ddStart = peakDate;
            ddTrough = dateStr;
            troughValue = portfolioValue;
        }

        // --- Price drawdown ---
        if (price > pricePeak) {
            pricePeak = price;
            pricePeakDate = dateStr;
        }
        const pdd = (price - pricePeak) / pricePeak;
        if (pdd < maxPriceDD) {
            maxPriceDD = pdd;
            pdStart = pricePeakDate;
            pdTrough = dateStr;
        }
    }

    // Find recovery dates (first month portfolio value returns to pre-drawdown peak)
    let peakAtTrough = 0;
    for (const row of rows) {
        if (row.dateStr === ddStart) peakAtTrough = row.portfolioValue;
    }
    let recoveryFound = false;
    for (const row of rows) {
        if (row.dateStr > ddTrough && row.portfolioValue >= peakAtTrough) {
            ddRecovery = row.dateStr;
            recoveryFound = true;
            break;
        }
    }

    let pricePeakVal = 0;
    for (const row of rows) {
        if (row.dateStr === pdStart) pricePeakVal = row.price;
    }
    let priceRecoveryFound = false;
    for (const row of rows) {
        if (row.dateStr > pdTrough && row.price >= pricePeakVal) {
            pdRecovery = row.dateStr;
            priceRecoveryFound = true;
            break;
        }
    }

    return {
        portfolio: {
            drawdown: maxDD,
            start: ddStart,
            trough: ddTrough,
            recovery: recoveryFound ? ddRecovery : 'Not yet recovered',
        },
        price: {
            drawdown: maxPriceDD,
            start: pdStart,
            trough: pdTrough,
            recovery: priceRecoveryFound ? pdRecovery : 'Not yet recovered',
        },
    };
}

async function main() {
    console.log('Calculating drawdowns for QQQ and SPY (May 2006 – May 2026)...\n');

    const [qqqRows, spyRows] = await Promise.all([fetchDCA('QQQ'), fetchDCA('SPY')]);

    for (const [ticker, rows] of [['QQQ', qqqRows], ['SPY', spyRows]]) {
        const { portfolio, price } = maxDrawdown(rows);

        console.log(`══════════════════════════════════════════════════`);
        console.log(`  ${ticker} — Maximum Drawdown Analysis`);
        console.log(`══════════════════════════════════════════════════`);
        console.log(`  [Portfolio Value]`);
        console.log(`    Max drawdown  : ${(portfolio.drawdown * 100).toFixed(1)}%`);
        console.log(`    Peak month    : ${portfolio.start}`);
        console.log(`    Trough month  : ${portfolio.trough}`);
        console.log(`    Duration      : ${monthDiff(portfolio.start, portfolio.trough)} months peak→trough`);
        console.log(`    Recovery      : ${portfolio.recovery}`);
        if (portfolio.recovery !== 'Not yet recovered') {
            console.log(`    Recovery time : ${monthDiff(portfolio.trough, portfolio.recovery)} months trough→recovery`);
        }
        console.log(`  [Price (Adj. Close)]`);
        console.log(`    Max drawdown  : ${(price.drawdown * 100).toFixed(1)}%`);
        console.log(`    Peak month    : ${price.start}`);
        console.log(`    Trough month  : ${price.trough}`);
        console.log(`    Duration      : ${monthDiff(price.start, price.trough)} months peak→trough`);
        console.log(`    Recovery      : ${price.recovery}`);
        if (price.recovery !== 'Not yet recovered') {
            console.log(`    Recovery time : ${monthDiff(price.trough, price.recovery)} months trough→recovery`);
        }
        console.log('');
    }
}

function monthDiff(a, b) {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (by - ay) * 12 + (bm - am);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
