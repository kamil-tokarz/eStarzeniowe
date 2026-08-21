import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "eStarzeniowe · JagoPro",
  description: "System obsługi testów stabilności JagoPro",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
