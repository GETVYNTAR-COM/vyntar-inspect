import "./globals.css";

export const metadata = {
  title: "VYNTAR Inspect — AI Pre-Use Equipment Check",
  description:
    "Photograph lifting and work equipment, get an instant AI hazard screen referenced to LOLER 98 and PUWER 98, and produce a signed inspection record.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="bg-void text-bone font-body antialiased">{children}</body>
    </html>
  );
}
