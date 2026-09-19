import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthGate } from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "AI Block Planning | SIH PS27",
  description: "AI-Powered Automatic Block Planning for Indian Railways",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-x-hidden">{children}</main>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
