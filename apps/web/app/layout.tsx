import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import "./globals.css";
import "streamdown/styles.css";
import { AxonAuthProvider } from "./providers/axon-auth-provider";
import { ClerkThemeProvider } from "./providers/clerk-theme-provider";
import { TrpcProvider } from "./trpc/provider";

export const metadata = {
  title: "Axon",
  description: "Agentic Cloud OS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        style={{ margin: 0 }}
        className="min-h-screen bg-background font-sans antialiased"
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ClerkThemeProvider>
            <TrpcProvider>
              <AxonAuthProvider>{children}</AxonAuthProvider>
            </TrpcProvider>
            <Toaster className="toaster-neon" />
          </ClerkThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
