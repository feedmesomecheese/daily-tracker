"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Stats = {
  overview: {
    total: number;
    completed: number;
    reading: number;
    toRead: number;
    dnf: number;
  };
  pages: {
    total: number;
    average: number;
    thisYear: number;
  };
  ratings: {
    average: number | null;
    ratedCount: number;
  };
  thisYear: {
    books: number;
    pages: number;
  };
  yearlyStats: { year: number; books: number; pages: number; physical: number; ebook: number; audio: number }[];
  monthlyStats: { month: number; books: number; physical: number; ebook: number; audio: number }[];
  genreYearlyStats: { year: number; [genre: string]: number }[];
  allGenres: string[];
  pagesPerDay: { year: number; pagesPerDay: number }[];
  byFormat: Record<string, number>;
  bySource: Record<string, number>;
  topGenres: { genre: string; count: number }[];
  rereads: number;
  wouldReread: number;
  avgTimeToRead: number | null;
  avgTimeToListen: number | null;
  longestBook: { title: string; author: string; pages: number } | null;
  shortestBook: { title: string; author: string; pages: number } | null;
  mostProlificMonth: { month: string; count: number } | null;
  topAuthors: { author: string; count: number }[];
  ratingDistribution: { rating: number; count: number }[];
  fastestRead: { title: string; pagesPerDay: number } | null;
};

const FORMAT_COLORS = {
  ebook: "#f59e0b",    // Yellow/amber
  physical: "#ef4444", // Red
  audio: "#3b82f6",    // Blue
};

const GENRE_COLORS = [
  "#3b82f6", // blue - fiction
  "#22c55e", // green - non fiction
  "#f59e0b", // amber - personal development
  "#ef4444", // red - sci-fi
  "#8b5cf6", // purple - memoir
  "#06b6d4", // cyan - finance
  "#ec4899", // pink - health
  "#84cc16", // lime - biography
  "#f97316", // orange
  "#6366f1", // indigo
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Custom tooltip that shows total
function CustomBarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; fill: string }>; label?: string }) {
  if (!active || !payload) return null;
  const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0);
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-2 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.fill }}>
          {entry.name}: {entry.value}
        </p>
      ))}
      <p className="font-medium border-t mt-1 pt-1">Total: {total}</p>
    </div>
  );
}

export default function BooksStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const headers = await getAuthHeaders();
        const res = await fetch("/api/books/stats", { headers });
        const json = await res.json();

        if (!res.ok) throw new Error(json?.error || "Failed to load stats");
        setStats(json);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Navigation helpers
  const navigateToLibrary = (params: Record<string, string>) => {
    const searchParams = new URLSearchParams(params);
    router.push(`/books?${searchParams.toString()}`);
  };

  const handleYearClick = (year: number, format?: string) => {
    const params: Record<string, string> = {
      status: "completed",
      finishedYear: year.toString(),
      sortBy: "finished_at",
      sortDir: "desc",
    };
    if (format) params.format = format;
    navigateToLibrary(params);
  };

  const handleMonthClick = (month: number, format?: string) => {
    const params: Record<string, string> = {
      status: "completed",
      finishedMonth: month.toString(),
      sortBy: "finished_at",
      sortDir: "desc",
    };
    if (format) params.format = format;
    navigateToLibrary(params);
  };

  const handleGenreClick = (genre: string, year?: number) => {
    const params: Record<string, string> = {
      status: "completed",
      genre,
      sortBy: "finished_at",
      sortDir: "desc",
    };
    if (year) params.finishedYear = year.toString();
    navigateToLibrary(params);
  };

  const handleAuthorClick = (author: string) => {
    navigateToLibrary({
      status: "completed",
      author,
      sortBy: "finished_at",
      sortDir: "desc",
    });
  };

  const handleRatingClick = (rating: number) => {
    navigateToLibrary({
      status: "completed",
      rating: rating.toString(),
      sortBy: "rating",
      sortDir: "desc",
    });
  };

  // Genre data for pie chart
  const genreData = useMemo(() => {
    if (!stats?.topGenres) return [];
    return stats.topGenres.map((g) => ({
      name: g.genre,
      value: g.count,
    }));
  }, [stats]);

  if (loading) {
    return (
      <main className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Book Stats</h1>
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Book Stats</h1>
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">{error}</div>
      </main>
    );
  }

  if (!stats) return null;

  return (
    <main className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Book Stats</h1>

      {/* Top Row: Summary + Books per Year */}
      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        {/* Left: Summary Stats */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-sm text-muted-foreground">Total Books Read</span>
                <span className="text-2xl font-bold">{stats.overview.completed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Average Rating</span>
                <span className="text-2xl font-bold">{stats.ratings.average?.toFixed(2) || "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Category</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-1">
                {stats.topGenres.map((g, i) => (
                  <button
                    key={g.genre}
                    onClick={() => handleGenreClick(g.genre)}
                    className="flex justify-between text-sm w-full hover:bg-accent rounded px-1 py-0.5 -mx-1 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length] }}
                      />
                      {g.genre}
                    </span>
                    <span className="font-medium">{g.count}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Books Read per Year */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Books Read per Year</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.yearlyStats}
                  onClick={(data) => {
                    if (data?.activeLabel) {
                      handleYearClick(Number(data.activeLabel));
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="ebook"
                    stackId="a"
                    fill={FORMAT_COLORS.ebook}
                    name="E-Book"
                    onClick={(data, _, e) => {
                      e.stopPropagation();
                      handleYearClick(data.year, "ebook");
                    }}
                  />
                  <Bar
                    dataKey="physical"
                    stackId="a"
                    fill={FORMAT_COLORS.physical}
                    name="Physical"
                    onClick={(data, _, e) => {
                      e.stopPropagation();
                      handleYearClick(data.year, "physical");
                    }}
                  />
                  <Bar
                    dataKey="audio"
                    stackId="a"
                    fill={FORMAT_COLORS.audio}
                    name="Audiobook"
                    onClick={(data, _, e) => {
                      e.stopPropagation();
                      handleYearClick(data.year, "audio");
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second Row: Genre per Year + Books per Month */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Genre per Year */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Genre per Year</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.genreYearlyStats}
                  onClick={(data) => {
                    if (data?.activeLabel) {
                      handleYearClick(Number(data.activeLabel));
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {stats.allGenres.slice(0, 10).map((genre, i) => (
                    <Bar
                      key={genre}
                      dataKey={genre}
                      stackId="a"
                      fill={GENRE_COLORS[i % GENRE_COLORS.length]}
                      name={genre}
                      onClick={(data, _, e) => {
                        e.stopPropagation();
                        handleGenreClick(genre, data.year);
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Books Read per Month (all time) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Books Read per Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.monthlyStats.map((m) => ({
                    ...m,
                    monthName: MONTH_NAMES[m.month - 1],
                    monthNum: m.month,
                  }))}
                  onClick={(data) => {
                    if (data?.activeLabel) {
                      const monthIndex = MONTH_NAMES.indexOf(data.activeLabel as string);
                      if (monthIndex >= 0) {
                        handleMonthClick(monthIndex + 1);
                      }
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="monthName" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="ebook"
                    stackId="a"
                    fill={FORMAT_COLORS.ebook}
                    name="E-Book"
                    onClick={(data, _, e) => {
                      e.stopPropagation();
                      handleMonthClick(data.monthNum, "ebook");
                    }}
                  />
                  <Bar
                    dataKey="physical"
                    stackId="a"
                    fill={FORMAT_COLORS.physical}
                    name="Physical"
                    onClick={(data, _, e) => {
                      e.stopPropagation();
                      handleMonthClick(data.monthNum, "physical");
                    }}
                  />
                  <Bar
                    dataKey="audio"
                    stackId="a"
                    fill={FORMAT_COLORS.audio}
                    name="Audiobook"
                    onClick={(data, _, e) => {
                      e.stopPropagation();
                      handleMonthClick(data.monthNum, "audio");
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Third Row: Genre Pie + Pages per Day */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Genre Distribution Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Genre Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genreData}
                    cx="35%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    onClick={(data) => handleGenreClick(data.name)}
                    style={{ cursor: "pointer" }}
                  >
                    {genreData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={GENRE_COLORS[index % GENRE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const total = genreData.reduce((sum, g) => sum + g.value, 0);
                      const pct = ((value / total) * 100).toFixed(1);
                      return [`${value} (${pct}%)`, name];
                    }}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    wrapperStyle={{ fontSize: 11, paddingLeft: 10, cursor: "pointer" }}
                    onClick={(data) => handleGenreClick(data.value)}
                    formatter={(value: string) => {
                      const total = genreData.reduce((sum, g) => sum + g.value, 0);
                      const item = genreData.find((g) => g.name === value);
                      const pct = item ? ((item.value / total) * 100).toFixed(0) : 0;
                      return `${value} (${pct}%)`;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pages per Day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pages per Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={stats.pagesPerDay}
                  onClick={(data) => {
                    if (data?.activeLabel) {
                      handleYearClick(Number(data.activeLabel));
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [value.toFixed(1), "Pages/Day"]} />
                  <Line
                    type="monotone"
                    dataKey="pagesPerDay"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: "#3b82f6", r: 4 }}
                    name="Pages/Day"
                    activeDot={{ r: 6, cursor: "pointer" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fourth Row: Rating Distribution + Top Authors */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Rating Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rating Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.ratingDistribution}
                  onClick={(data) => {
                    if (data?.activeLabel !== undefined) {
                      handleRatingClick(Number(data.activeLabel));
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Books" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Authors */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Authors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topAuthors.map((a) => (
                <button
                  key={a.author}
                  onClick={() => handleAuthorClick(a.author)}
                  className="flex items-center justify-between w-full hover:bg-accent rounded px-1 py-0.5 -mx-1 transition-colors cursor-pointer"
                >
                  <span className="text-sm truncate flex-1 text-left">{a.author}</span>
                  <div className="flex items-center gap-2 ml-2">
                    <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{
                          width: `${(a.count / stats.topAuthors[0].count) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-6 text-right">{a.count}</span>
                  </div>
                </button>
              ))}
              {stats.topAuthors.length === 0 && (
                <p className="text-sm text-muted-foreground">No completed books yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fifth Row: Additional Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({})}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Books</p>
            <p className="text-2xl font-bold">{stats.overview.total}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "reading" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Currently Reading</p>
            <p className="text-2xl font-bold">{stats.overview.reading}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "to_read" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">To Read</p>
            <p className="text-2xl font-bold">{stats.overview.toRead}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "completed", sortBy: "pages", sortDir: "desc" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Pages</p>
            <p className="text-2xl font-bold">{stats.pages.total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "completed", sortBy: "pages", sortDir: "desc" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Pages/Book</p>
            <p className="text-2xl font-bold">{stats.pages.average}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "completed", format: "physical", sortBy: "time_to_read", sortDir: "asc" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Days to Read</p>
            <p className="text-2xl font-bold">{stats.avgTimeToRead ?? "—"}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "completed", format: "audio", sortBy: "time_to_read", sortDir: "asc" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Days to Listen</p>
            <p className="text-2xl font-bold">{stats.avgTimeToListen ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sixth Row: Notable Books */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.longestBook && (
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => navigateToLibrary({ status: "completed", sortBy: "pages", sortDir: "desc" })}
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Longest Book</p>
              <p className="font-medium text-sm truncate" title={stats.longestBook.title}>
                {stats.longestBook.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.longestBook.pages.toLocaleString()} pages
              </p>
            </CardContent>
          </Card>
        )}
        {stats.shortestBook && (
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => navigateToLibrary({ status: "completed", sortBy: "pages", sortDir: "asc" })}
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Shortest Book</p>
              <p className="font-medium text-sm truncate" title={stats.shortestBook.title}>
                {stats.shortestBook.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.shortestBook.pages.toLocaleString()} pages
              </p>
            </CardContent>
          </Card>
        )}
        {stats.mostProlificMonth && (
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => {
              const monthIndex = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(stats.mostProlificMonth!.month);
              if (monthIndex >= 0) handleMonthClick(monthIndex + 1);
            }}
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Best Month</p>
              <p className="font-medium text-sm">{stats.mostProlificMonth.month}</p>
              <p className="text-xs text-muted-foreground">
                {stats.mostProlificMonth.count} books
              </p>
            </CardContent>
          </Card>
        )}
        {stats.fastestRead && (
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => navigateToLibrary({ status: "completed", sortBy: "time_to_read", sortDir: "asc" })}
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Fastest Read</p>
              <p className="font-medium text-sm truncate" title={stats.fastestRead.title}>
                {stats.fastestRead.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.fastestRead.pagesPerDay} pages/day
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Re-reads and Would Reread */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "completed", search: "" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Re-reads</p>
            <p className="text-2xl font-bold">{stats.rereads}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "to_read", includeWouldReread: "true" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Would Reread</p>
            <p className="text-2xl font-bold">{stats.wouldReread}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "dnf" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">DNF</p>
            <p className="text-2xl font-bold">{stats.overview.dnf}</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigateToLibrary({ status: "completed", sortBy: "rating", sortDir: "desc" })}
        >
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Rated Books</p>
            <p className="text-2xl font-bold">{stats.ratings.ratedCount}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
