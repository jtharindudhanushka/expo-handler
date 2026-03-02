import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Fair Queue Management",
  description: "Real-time queue management system for career fair rooms",
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
