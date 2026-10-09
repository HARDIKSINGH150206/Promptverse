import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "AnnaRelay", template: "%s · AnnaRelay" },
  description: "Leftover food, matched to people who need it, collected before it spoils.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#092634",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <footer className="bg-navy text-white/70">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p>
                <span className="font-bold text-white">AnnaRelay</span> · Anna (अन्न) means food; the relay keeps going even when someone drops the baton.
              </p>
              <p>Seeded recipients, histories and partners are simulated.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
