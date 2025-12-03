import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Daily Tracker",
  description: "Personal tracking app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <header className="border-b bg-white">
          <nav className="max-w-5xl mx-auto flex items-center gap-4 px-4 py-2 text-sm">
            <span className="font-semibold mr-4">Daily Tracker</span>
            <Link href="/" className="hover:underline">
              Today 
            </Link>
            <Link href="/metrics" className="hover:underline">
              Metrics 
            </Link>
            <Link href="/wide" className="hover:underline">
              Wide 
            </Link>
            <Link href="/ma" className="hover:underline">
              Moving Avg 
            </Link>
            <Link href="/stats" className="hover:underline">
              Stats 
            </Link>
            {/* dashboard placeholder for later */}
            {/* <Link href="/dashboard" className="hover:underline">Dashboard</Link> */}
          </nav>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-4">{children}</main>
      </body>
    </html>
  );
}
