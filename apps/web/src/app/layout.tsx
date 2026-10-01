import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Security Scanner",
  description: "Multi-platform security analysis with Claude-assisted remediation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">{children}</body>
    </html>
  );
}
