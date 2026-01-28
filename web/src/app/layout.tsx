import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Daily Tracker",
  description: "Personal tracking app",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Daily Tracker",
  },
  other: {
    "theme-color": "#09090b",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ fontFamily: "system-ui, sans-serif" }} className="overflow-x-hidden">
        <ThemeProvider>
          <AuthProvider>
            <header className="border-b bg-background">
              <nav className="max-w-5xl mx-auto flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2 text-sm overflow-x-auto overscroll-x-contain">
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
                <Link href="/dashboard" className="px-2 text-sm hover:underline">
                  Dashboard
                </Link>
                <Link href="/settings" className="hover:underline">
                  Settings
                </Link>
              </nav>
            </header>
            <main className="max-w-5xl mx-auto px-4 py-4">{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
