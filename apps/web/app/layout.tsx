import { TrpcProvider } from "./trpc/provider";

export const metadata = {
  title: "AgentChat",
  description: "AgentChat UI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <TrpcProvider>{children}</TrpcProvider>
      </body>
    </html>
  );
}
