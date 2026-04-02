import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCProvider } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AP Agent — Accounts Payable",
  description: "Automated accounts payable processing for bookkeeping firms",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <TRPCProvider>{children}</TRPCProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
