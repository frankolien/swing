import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/Providers";
import { StarField } from "@/components/StarField";
import "./globals.css";

export const metadata: Metadata = {
  title: "the swing — reputation-gated credit for AI agents",
  description:
    "An on-chain economic layer for autonomous agents on Mantle: earn reputation, gate credit, guard spending. Rogue transactions revert on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        <Providers>
          <StarField />
          {children}
        </Providers>
      </body>
    </html>
  );
}
