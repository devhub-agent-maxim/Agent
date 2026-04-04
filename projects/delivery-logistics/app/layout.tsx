import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RouteFlow - Smart Delivery Route Optimization",
  description:
    "Optimize delivery routes for Singapore SME businesses with intelligent multi-stop routing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
