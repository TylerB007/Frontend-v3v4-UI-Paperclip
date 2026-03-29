import type { Metadata } from "next";
import { Providers } from "@/providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "LP Mastery",
  description: "Uniswap V4 concentrated liquidity position management dashboard",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
