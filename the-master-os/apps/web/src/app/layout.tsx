import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Master OS",
  description: "1인 100에이전트 자율 경영 시스템",
  keywords: ["AI", "에이전트", "자율경영", "대시보드"],
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen bg-surface font-sans text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
