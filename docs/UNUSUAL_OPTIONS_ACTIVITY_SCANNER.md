# Unusual Options Activity Scanner

The anomaly scanner detects unusual far-OTM (out-of-the-money) weekly options activity by comparing the current week's volume, trade sizes, and price behavior against the prior 3 weeks.

## How It Works

### Data Collection

The scanner (`/api/analyze/[symbol]`) takes a stock ticker and:

1. Fetches the current stock price via the previous-day close
2. Determines 4 weekly expirations (current Friday + 3 prior Fridays)
3. For each week, builds OTM option tickers at **10%, 15%, 20%, 30%, and 40% OTM** for both calls and puts
4. Fetches daily OHLCV bars for each option contract from the Massive API
5. Compares the current week's activity against the 3 prior weeks to generate signals

Strike prices are snapped to standard increments via `roundStrike()`:
- Price >= $50: rounds to nearest $5
- Price >= $10: rounds to nearest $1
- Price < $10: rounds to nearest $0.50

Option tickers follow OCC format: `O:{SYMBOL}{YYMMDD}{C|P}{00000000}` (strike * 1000, zero-padded to 8 digits).

### Signal Types

The scanner produces four types of signals, each targeting a different kind of unusual activity:

#### 1. Weekly Volume Anomaly (`weekly_volume`)

Compares the current week's **daily average volume** against the average daily volume across the 3 prior weeks at the same OTM level.

- **Trigger**: current daily avg >= 2x historical daily avg
- **Severity**: 3x = medium, 5x = high, 10x = extreme
- **What it catches**: Sustained buildup of interest in a specific strike over multiple days

#### 2. Daily Spike (`daily_spike`)

Compares the **last 2 trading days** of the current week against the last 2 trading days of each prior week, then averages.

- **Trigger**: last 2 days avg >= 2x historical last-2-days avg, AND last 2 days avg > 10 contracts/day
- **Severity**: same scale as weekly volume (3x/5x/10x)
- **What it catches**: Late-week surges that could indicate pre-event positioning (e.g., before earnings, FDA decisions)

#### 3. Block Trade Detection (`block_trade`)

Examines average trade size (volume / number of trades) per day in the current week, compared to historical average trade sizes.

- **Trigger**: avg trade size >= 3x historical avg trade size, AND avg size >= 10 contracts
- **Severity**: same scale (3x/5x/10x)
- **What it catches**: Institutional or large-player activity — few trades but large sizes suggest a single entity placing big bets

#### 4. Price Divergence (`price_divergence`)

Compares the **direction** of option price movement vs stock price movement over the last 2 trading days.

- **For calls**: triggers when option price rises > 5% while stock drops > 1%
- **For puts**: triggers when option price rises > 5% while stock rises > 1%
- **Severity**: always "high"
- **What it catches**: Classic informed flow — someone buying options aggressively enough to push premiums up despite the stock moving against the option's directional thesis

### Signal Ranking

Signals are sorted by:
1. Severity (extreme > high > medium > low)
2. Multiplier (higher first) within the same severity

Signals with severity "low" are separated into `normalSignals` and excluded from the primary `signals` array.

## API Response

`GET /api/analyze/{SYMBOL}` returns:

```json
{
  "ticker": "TSLA",
  "currentPrice": 175.50,
  "currentExpiration": "2026-03-20",
  "analyzedExpirations": ["2026-03-20", "2026-03-13", "2026-03-06", "2026-02-27"],
  "hasAnomaly": true,
  "signalCount": 3,
  "signals": [
    {
      "id": "weekly_call_20",
      "signalType": "weekly_volume",
      "type": "call",
      "otmPercent": 20,
      "strike": 210,
      "ticker": "O:TSLA260320C00210000",
      "severity": "high",
      "multiplier": 6.2,
      "title": "Weekly volume 6.2x normal",
      "description": "CALL $210 (20% OTM) averaging 1,520/day vs historical 245/day",
      "evidence": {
        "currentDailyAvg": 1520,
        "historicalDailyAvg": 245
      },
      "weeklyBreakdown": [
        { "expiration": "2026-03-20", "strike": 210, "totalVolume": 7600, "dailyAvgVolume": 1520 },
        { "expiration": "2026-03-13", "strike": 210, "totalVolume": 1225, "dailyAvgVolume": 245 }
      ]
    }
  ],
  "normalSignals": [],
  "weeklyData": []
}
```

## Frontend (`/analyze`)

The analyze page provides:

- **Ticker input** with quick-select buttons for popular tickers (NBIS, HIMS, TSLA, NVDA, AAPL, AMD, PLTR, SMCI)
- **Signal cards** with expandable details:
  - Severity badge (color-coded: red=extreme, orange=high, yellow=medium)
  - Signal type badge (blue=weekly volume, purple=daily spike, amber=block trade, rose=price divergence)
  - Call/put indicator, strike price, OTM percentage, multiplier
  - Expandable evidence panel with raw numbers
  - Weekly comparison table with bar chart visualization
- **Filter pills** to filter by signal type
- **Full Volume Grid** showing calls and puts side-by-side across all 4 weeks
- **Below-threshold signals** collapsed in a details element
- **Methodology footer** explaining each signal type

## Architecture

```
/api/analyze/[symbol]/route.ts   — Signal generation engine (self-contained, no Prisma)
/api/options/[symbol]/route.ts   — Options chain lookup (snapshot or contracts reference)
/api/stocks/route.ts             — Stock search
/api/stocks/[symbol]/route.ts    — Stock details + price bars
/app/analyze/page.tsx            — Anomaly scanner UI
/app/page.tsx                    — Main stock viewer (links to scanner)
/lib/massive.ts                  — Massive API client wrapper
/lib/prisma.ts                   — Prisma client singleton
```

The analyze endpoint is fully self-contained — it constructs API calls directly rather than using the shared `massive.ts` client, since it needs fine-grained control over option ticker construction and parallel fetching.

## Environment

Requires `MASSIVE_API_KEY` environment variable for the Massive market data API.
