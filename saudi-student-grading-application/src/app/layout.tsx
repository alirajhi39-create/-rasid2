import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "رصد | نظام إدارة ورصد درجات الطلاب",
  description:
    "نظام متكامل لإدارة ورصد درجات الطلاب وفق لائحة تقويم الطالب في التعليم العام السعودي — متوافق مع نظام نور.",
  applicationName: "رصد",
  keywords: ["رصد الدرجات", "نظام نور", "وزارة التعليم", "تقويم الطالب", "السعودية"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1a64ef",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Tajawal:wght@300;400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="text-slate-900 antialiased">{children}</body>
    </html>
  );
}
