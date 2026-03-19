const MASSIVE_BASE_URL = "https://api.massive.com"; // Update with actual Massive API base URL

export async function fetchStockQuote(symbol: string) {
  const res = await fetch(`${MASSIVE_BASE_URL}/stocks/${symbol}/quote`, {
    headers: {
      Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch quote for ${symbol}: ${res.statusText}`);
  return res.json();
}

export async function fetchOptionChain(symbol: string, expiration?: string) {
  const params = new URLSearchParams();
  if (expiration) params.set("expiration", expiration);

  const res = await fetch(`${MASSIVE_BASE_URL}/stocks/${symbol}/options?${params}`, {
    headers: {
      Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch options for ${symbol}: ${res.statusText}`);
  return res.json();
}
