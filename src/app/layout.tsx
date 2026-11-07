import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lead Review",
  description: "Human review for leads and outreach drafts.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
