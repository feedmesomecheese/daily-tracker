import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { NavMenu } from "@/components/nav-menu";

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
            <header className="sticky top-0 z-50 border-b bg-background">
              <nav className="max-w-5xl mx-auto px-3 sm:px-4 py-2">
                <NavMenu />
              </nav>
            </header>
            <main className="max-w-5xl mx-auto px-4 py-4">{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
