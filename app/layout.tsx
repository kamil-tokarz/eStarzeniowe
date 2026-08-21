import type { Metadata } from "next";
import "./globals.css";
import "./application.css";
import "./operational.css";
import "./attention.css";
import "./catalog.css";
import "./trends.css";
import "./workspace.css";

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
