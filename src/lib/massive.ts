const BASE_URL = "https://api.massive.com";

function apiUrl(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("apikey", process.env.MASSIVE_API_KEY!);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const res = await fetch(apiUrl(path, params));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Massive API error ${res.status}: ${body.message || res.statusText}`);
  }
  return res.json();
}

// --- Ticker Reference ---

export interface TickerDetails {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
  market_cap?: number;
  description?: string;
  homepage_url?: string;
  total_employees?: number;
  sic_code?: string;
  sic_description?: string;
}

export async function getTickerDetails(symbol: string) {
  return get<{ results: TickerDetails }>(`/v3/reference/tickers/${symbol}`);
}

export async function searchTickers(query: string, limit = 10) {
  return get<{ results: TickerDetails[] }>("/v3/reference/tickers", {
    search: query,
    market: "stocks",
    active: "true" as unknown as string,
    limit,
  });
}

// --- Price Bars (OHLCV) ---

export interface Bar {
  v: number;   // volume
  vw: number;  // volume weighted avg price
  o: number;   // open
  c: number;   // close
  h: number;   // high
  l: number;   // low
  t: number;   // timestamp (ms)
  n: number;   // number of trades
}

export async function getPreviousDayBar(symbol: string) {
  return get<{ results: Bar[] }>(`/v2/aggs/ticker/${symbol}/prev`);
}

export async function getAggregateBars(
  symbol: string,
  from: string,
  to: string,
  timespan: "minute" | "hour" | "day" | "week" | "month" = "day",
  multiplier = 1
) {
  return get<{ results: Bar[]; resultsCount: number }>(
    `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`
  );
}

// --- Options Contracts ---

export interface OptionContract {
  ticker: string;
  underlying_ticker: string;
  contract_type: "call" | "put";
  exercise_style: string;
  expiration_date: string;
  strike_price: number;
  shares_per_contract: number;
  primary_exchange: string;
}

export async function getOptionContracts(
  underlyingTicker: string,
  params?: {
    contract_type?: "call" | "put";
    expiration_date?: string;
    "expiration_date.gte"?: string;
    "expiration_date.lte"?: string;
    "strike_price.gte"?: number;
    "strike_price.lte"?: number;
    limit?: number;
    order?: "asc" | "desc";
    sort?: string;
  }
) {
  return get<{ results: OptionContract[]; next_url?: string }>(
    "/v3/reference/options/contracts",
    { underlying_ticker: underlyingTicker, limit: 250, ...params } as Record<string, string | number>
  );
}

// --- Options Chain Snapshot (requires higher plan) ---

export interface OptionSnapshot {
  break_even_price: number;
  implied_volatility: number;
  open_interest: number;
  details: {
    contract_type: string;
    exercise_style: string;
    expiration_date: string;
    strike_price: number;
    ticker: string;
  };
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  last_quote?: {
    ask: number;
    bid: number;
    midpoint: number;
  };
  underlying_asset?: {
    price: number;
    ticker: string;
  };
}

export async function getOptionChainSnapshot(
  underlyingAsset: string,
  params?: {
    strike_price?: number;
    expiration_date?: string;
    contract_type?: string;
    "strike_price.gte"?: number;
    "strike_price.lte"?: number;
    "expiration_date.gte"?: string;
    "expiration_date.lte"?: string;
    limit?: number;
  }
) {
  return get<{ results: OptionSnapshot[] }>(
    `/v3/snapshot/options/${underlyingAsset}`,
    params as Record<string, string | number>
  );
}
