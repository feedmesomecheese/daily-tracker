export const metadata = {
  title: "Daily Tracker v2",
  description: "Personal metrics tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          background: "#fafafa",
        }}
      >
        {children}
      </body>
    </html>
  );
}

