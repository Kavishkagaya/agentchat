import { Command } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container relative grid h-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left Side */}
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex dark:border-r">
        <div className="absolute inset-0 bg-zinc-900" />
        <div className="relative z-20 flex items-center font-medium text-lg">
          <Command className="mr-2 h-6 w-6" />
          Axon
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              &ldquo;The Agentic Cloud OS that scales with your ambition. Build,
              deploy, and orchestrate agents with zero friction.&rdquo;
            </p>
            <footer className="text-sm">Axon Team</footer>
          </blockquote>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex h-full items-center justify-center lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          {children}
        </div>
      </div>
    </div>
  );
}
