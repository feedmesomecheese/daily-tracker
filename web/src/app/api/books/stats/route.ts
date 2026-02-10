import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null };
  }
  return { supabase, user };
}

// GET /api/books/stats - Get reading statistics
export async function GET(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: books, error } = await supabase
    .from("books")
    .select("*")
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const currentYear = now.getFullYear();

  // Overall stats
  const totalBooks = books.length;
  const completedBooks = books.filter((b) => b.status === "completed");
  const readingBooks = books.filter((b) => b.status === "reading");
  const toReadBooks = books.filter((b) => b.status === "to_read");
  const dnfBooks = books.filter((b) => b.status === "dnf");

  // Pages stats - exclude audiobooks from average (they often have 0 pages)
  const completedWithPages = completedBooks.filter((b) => b.format !== "audio" && b.pages && b.pages > 0);
  const totalPages = completedBooks.reduce((sum, b) => sum + (b.pages || 0), 0);
  const avgPages = completedWithPages.length > 0
    ? Math.round(completedWithPages.reduce((sum, b) => sum + (b.pages || 0), 0) / completedWithPages.length)
    : 0;

  // Rating stats
  const ratedBooks = completedBooks.filter((b) => b.rating != null);
  const avgRating = ratedBooks.length > 0
    ? Math.round((ratedBooks.reduce((sum, b) => sum + b.rating, 0) / ratedBooks.length) * 10) / 10
    : null;

  // Current year stats
  const booksThisYear = completedBooks.filter((b) => {
    if (!b.finished_at) return false;
    return new Date(b.finished_at).getFullYear() === currentYear;
  });
  const pagesThisYear = booksThisYear.reduce((sum, b) => sum + (b.pages || 0), 0);

  // Books by year with format breakdown
  const booksByYear: Record<number, { count: number; pages: number; physical: number; ebook: number; audio: number }> = {};
  for (const book of completedBooks) {
    if (!book.finished_at) continue;
    const year = new Date(book.finished_at).getFullYear();
    if (!booksByYear[year]) {
      booksByYear[year] = { count: 0, pages: 0, physical: 0, ebook: 0, audio: 0 };
    }
    booksByYear[year].count++;
    booksByYear[year].pages += book.pages || 0;
    const fmt = book.format || "physical";
    if (fmt === "physical") booksByYear[year].physical++;
    else if (fmt === "ebook") booksByYear[year].ebook++;
    else if (fmt === "audio") booksByYear[year].audio++;
  }

  // Format by year as sorted array
  const yearlyStats = Object.entries(booksByYear)
    .map(([year, stats]) => ({
      year: parseInt(year),
      books: stats.count,
      pages: stats.pages,
      physical: stats.physical,
      ebook: stats.ebook,
      audio: stats.audio,
    }))
    .sort((a, b) => a.year - b.year);

  // Books by month (all time) with format breakdown
  const booksByMonth: Record<number, { count: number; physical: number; ebook: number; audio: number }> = {};
  for (let m = 1; m <= 12; m++) {
    booksByMonth[m] = { count: 0, physical: 0, ebook: 0, audio: 0 };
  }
  for (const book of completedBooks) {
    if (!book.finished_at) continue;
    const month = new Date(book.finished_at).getMonth() + 1;
    booksByMonth[month].count++;
    const fmt = book.format || "physical";
    if (fmt === "physical") booksByMonth[month].physical++;
    else if (fmt === "ebook") booksByMonth[month].ebook++;
    else if (fmt === "audio") booksByMonth[month].audio++;
  }
  const monthlyStats = Object.entries(booksByMonth)
    .map(([month, stats]) => ({
      month: parseInt(month),
      books: stats.count,
      physical: stats.physical,
      ebook: stats.ebook,
      audio: stats.audio,
    }))
    .sort((a, b) => a.month - b.month);

  // Genre by year
  const genreByYear: Record<number, Record<string, number>> = {};
  for (const book of completedBooks) {
    if (!book.finished_at || !book.genre) continue;
    const year = new Date(book.finished_at).getFullYear();
    if (!genreByYear[year]) genreByYear[year] = {};
    genreByYear[year][book.genre] = (genreByYear[year][book.genre] || 0) + 1;
  }
  const genreYearlyStats = Object.entries(genreByYear)
    .map(([year, genres]) => ({
      year: parseInt(year),
      ...genres,
    }))
    .sort((a, b) => a.year - b.year);

  // Pages per day by year
  const pagesPerDay = Object.entries(booksByYear)
    .map(([yearStr, stats]) => {
      const year = parseInt(yearStr);
      let daysInYear: number;
      if (year === currentYear) {
        const startOfYear = new Date(year, 0, 1);
        daysInYear = Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
      }
      return {
        year,
        pagesPerDay: daysInYear > 0 ? Math.round((stats.pages / daysInYear) * 10) / 10 : 0,
      };
    })
    .sort((a, b) => a.year - b.year);

  // Books by format
  const formatCounts: Record<string, number> = {};
  for (const book of books) {
    const fmt = book.format || "unknown";
    formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
  }

  // Books by source
  const sourceCounts: Record<string, number> = {};
  for (const book of books) {
    const src = book.source || "unknown";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  // Genre breakdown (top 10)
  const genreCounts: Record<string, number> = {};
  for (const book of books) {
    if (book.genre) {
      genreCounts[book.genre] = (genreCounts[book.genre] || 0) + 1;
    }
  }
  const topGenres = Object.entries(genreCounts)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Re-reads
  const rereadBooks = books.filter((b) => b.reading_number > 1);

  // Would reread
  const wouldRereadBooks = completedBooks.filter((b) => b.would_reread);

  // Get all unique genres for the genre by year chart (sorted by total count)
  const allGenres = topGenres.map((g) => g.genre);

  // Additional stats

  // Average time to read/listen (days) - broken down by format
  const booksWithReadTime = completedBooks.filter((b) => b.started_at && b.finished_at);

  // Reading (physical + ebook)
  const readBooks = booksWithReadTime.filter((b) => b.format !== "audio");
  const totalReadTime = readBooks.reduce((sum, b) => {
    const start = new Date(b.started_at);
    const end = new Date(b.finished_at);
    return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }, 0);
  const avgTimeToRead = readBooks.length > 0
    ? Math.round(totalReadTime / readBooks.length)
    : null;

  // Listening (audiobooks)
  const listenBooks = booksWithReadTime.filter((b) => b.format === "audio");
  const totalListenTime = listenBooks.reduce((sum, b) => {
    const start = new Date(b.started_at);
    const end = new Date(b.finished_at);
    return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }, 0);
  const avgTimeToListen = listenBooks.length > 0
    ? Math.round(totalListenTime / listenBooks.length)
    : null;

  // Longest and shortest books
  const booksWithPages = completedBooks.filter((b) => b.pages && b.pages > 0);
  const longestBook = booksWithPages.length > 0
    ? booksWithPages.reduce((max, b) => (b.pages! > max.pages! ? b : max))
    : null;
  const shortestBook = booksWithPages.length > 0
    ? booksWithPages.reduce((min, b) => (b.pages! < min.pages! ? b : min))
    : null;

  // Most prolific month (all time)
  const maxMonth = monthlyStats.reduce((max, m) => (m.books > max.books ? m : max), monthlyStats[0]);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mostProlificMonth = maxMonth && maxMonth.books > 0
    ? { month: monthNames[maxMonth.month - 1], count: maxMonth.books }
    : null;

  // Top authors
  const authorCounts: Record<string, number> = {};
  for (const book of completedBooks) {
    authorCounts[book.author] = (authorCounts[book.author] || 0) + 1;
  }
  const topAuthors = Object.entries(authorCounts)
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Rating distribution
  const ratingDistribution: Record<number, number> = {};
  for (let i = 0; i <= 10; i++) {
    ratingDistribution[i] = 0;
  }
  for (const book of completedBooks) {
    if (book.rating != null) {
      const rounded = Math.round(book.rating);
      ratingDistribution[rounded]++;
    }
  }

  // Fastest read (with pages)
  const fastestRead = booksWithReadTime
    .filter((b) => b.pages && b.pages > 0)
    .map((b) => {
      const start = new Date(b.started_at);
      const end = new Date(b.finished_at);
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      return { ...b, pagesPerDay: Math.round(b.pages / days) };
    })
    .sort((a, b) => b.pagesPerDay - a.pagesPerDay)[0] || null;

  return NextResponse.json({
    overview: {
      total: totalBooks,
      completed: completedBooks.length,
      reading: readingBooks.length,
      toRead: toReadBooks.length,
      dnf: dnfBooks.length,
    },
    pages: {
      total: totalPages,
      average: avgPages,
      thisYear: pagesThisYear,
    },
    ratings: {
      average: avgRating,
      ratedCount: ratedBooks.length,
    },
    thisYear: {
      books: booksThisYear.length,
      pages: pagesThisYear,
    },
    yearlyStats,
    monthlyStats,
    genreYearlyStats,
    allGenres,
    pagesPerDay,
    byFormat: formatCounts,
    bySource: sourceCounts,
    topGenres,
    rereads: rereadBooks.length,
    wouldReread: wouldRereadBooks.length,
    // Additional stats
    avgTimeToRead,
    avgTimeToListen,
    longestBook: longestBook ? { title: longestBook.title, author: longestBook.author, pages: longestBook.pages } : null,
    shortestBook: shortestBook ? { title: shortestBook.title, author: shortestBook.author, pages: shortestBook.pages } : null,
    mostProlificMonth,
    topAuthors,
    ratingDistribution: Object.entries(ratingDistribution).map(([rating, count]) => ({
      rating: parseInt(rating),
      count,
    })),
    fastestRead: fastestRead ? { title: fastestRead.title, pagesPerDay: fastestRead.pagesPerDay } : null,
  });
}
