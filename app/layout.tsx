import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solar Roof Planner · Philippines",
  description:
    "Fit 550 W solar panels on your real roof outline in the Philippines and estimate monthly production with NREL PVWatts v8.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@500;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400;1,600&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('js');`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
