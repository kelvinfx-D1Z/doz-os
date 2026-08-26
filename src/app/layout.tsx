import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
// Two toast systems exist in this codebase. The Radix one above is used by
// exactly one file; 49 others call `toast` from sonner — every save
// confirmation and, more importantly, every error message. Sonner's own
// Toaster was never mounted, so all of them rendered nothing: a failed
// invoice save looked identical to a successful one. Both are mounted now.
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/doz/auth-provider";

export const metadata: Metadata = {
  title: "DOZ OS — Company Operating System",
  description: "Digit One Zero Company OS — run the company from one dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>
            {children}
            <Toaster />
            <SonnerToaster richColors closeButton position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
