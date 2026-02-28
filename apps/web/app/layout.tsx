import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";

import { AxonAuthProvider } from "./providers/axon-auth-provider";
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
    <ClerkProvider>
      <html lang="en">
        <body style={{ margin: 0 }}>
          <TrpcProvider>
            <AxonAuthProvider>{children}</AxonAuthProvider>
          </TrpcProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
