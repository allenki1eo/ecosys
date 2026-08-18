import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";

import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/misc";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ecohygiene Operations",
    template: "%s · Ecohygiene Operations",
  },
  description:
    "Internal operations platform for Ecohygiene Company Limited — field service scheduling, inventory, compliance and client portals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
