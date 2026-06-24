export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc" }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
