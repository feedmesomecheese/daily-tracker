"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ConfigRow = {
  metric_id: string;
  metric_name: string | null;
  type: string;
  active: boolean;
};

type SearchResult = {
  date: string;
  metric_id: string;
  value_text: string;
};

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <mark className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">{match}</mark>
      {after}
    </>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [selectedMetric, setSelectedMetric] = useState<string>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Load text metrics
  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/config", { headers });
        const data = await res.json();

        if (!res.ok) throw new Error(data?.error || "Failed to load config");

        // Filter to only active text metrics
        const textMetrics = (data as ConfigRow[]).filter(
          (m) => m.type === "text" && m.active
        );
        setMetrics(textMetrics);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setSearching(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ q: query.trim() });
      if (selectedMetric !== "all") {
        params.set("metric_id", selectedMetric);
      }

      const res = await fetch(`/api/search?${params}`, { headers });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Search failed");

      setResults(data);
      setHasSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }, [query, selectedMetric]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const goToDate = (date: string) => {
    // Navigate to main page with the date
    router.push(`/?date=${date}`);
  };

  // Get metric name by ID
  const getMetricName = (metricId: string): string => {
    const metric = metrics.find((m) => m.metric_id === metricId);
    return metric?.metric_name || metricId;
  };

  if (loading) {
    return (
      <main className="min-h-screen p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Search Text Notes</h1>
          <Button variant="outline" size="sm" onClick={() => router.push("/")}>
            Back to Today
          </Button>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Search</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Enter search term..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
              </div>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="w-full sm:w-48 h-10 px-3 border rounded-md bg-background text-sm"
              >
                <option value="all">All text fields</option>
                {metrics.map((m) => (
                  <option key={m.metric_id} value={m.metric_id}>
                    {m.metric_name || m.metric_id}
                  </option>
                ))}
              </select>
              <Button onClick={handleSearch} disabled={searching || !query.trim()}>
                {searching ? "Searching..." : "Search"}
              </Button>
            </div>

            {metrics.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No text metrics found. Add a text-type metric to start taking notes.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {hasSearched && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Results {results.length > 0 && `(${results.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No results found for &quot;{query}&quot;
                </p>
              ) : (
                <div className="space-y-3">
                  {results.map((r, i) => (
                    <div
                      key={`${r.date}-${r.metric_id}-${i}`}
                      className="border rounded-lg p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              onClick={() => goToDate(r.date)}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              {formatDate(r.date)}
                            </button>
                            {selectedMetric === "all" && (
                              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {getMetricName(r.metric_id)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {highlightMatch(r.value_text, query)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
