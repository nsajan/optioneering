"use client";

import { useState, useEffect } from "react";

interface Stock {
  id: string;
  symbol: string;
  name: string | null;
  sector: string | null;
  quotes: { price: number; date: string }[];
}

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/stocks")
      .then((res) => res.json())
      .then(setStocks);
  }, []);

  const addStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) return;
    setLoading(true);
    const res = await fetch("/api/stocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: symbol.toUpperCase() }),
    });
    const stock = await res.json();
    setStocks((prev) => [...prev.filter((s) => s.id !== stock.id), stock]);
    setSymbol("");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <header className="max-w-4xl mx-auto mb-12">
        <h1 className="text-4xl font-bold tracking-tight">Optioneering</h1>
        <p className="text-zinc-400 mt-2">Stock & options research platform</p>
      </header>

      <main className="max-w-4xl mx-auto">
        <form onSubmit={addStock} className="flex gap-3 mb-8">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Enter stock symbol (e.g. AAPL)"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? "Adding..." : "Add Stock"}
          </button>
        </form>

        {stocks.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <p className="text-lg">No stocks tracked yet.</p>
            <p className="text-sm mt-1">Add a symbol above to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stocks.map((stock) => (
              <div
                key={stock.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"
              >
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">{stock.symbol}</h2>
                  {stock.quotes[0] && (
                    <span className="text-lg font-mono text-green-400">
                      ${stock.quotes[0].price.toFixed(2)}
                    </span>
                  )}
                </div>
                {stock.name && (
                  <p className="text-zinc-400 text-sm mt-1">{stock.name}</p>
                )}
                {stock.sector && (
                  <span className="inline-block mt-2 text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded">
                    {stock.sector}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
