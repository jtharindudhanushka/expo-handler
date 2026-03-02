import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Fair 2026 | Interview Queue Management",
  description: "Real-time interview queue management system for Career Fair 2026. Register, manage queues, and track interview status.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
