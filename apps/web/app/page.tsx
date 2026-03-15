import { SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background py-20 text-foreground">
      <div className="z-10 flex flex-col items-center max-w-3xl text-center px-4">
        <div className="mb-8 inline-flex items-center rounded-full border bg-muted/50 px-3 py-1 text-sm font-medium text-muted-foreground">
          Agentic Cloud OS
        </div>

        <h1 className="mb-6 font-semibold text-6xl tracking-tight text-foreground sm:text-7xl">
          Axon
        </h1>

        <p className="mb-10 text-muted-foreground text-xl max-w-2xl font-normal leading-relaxed">
          Orchestrate, deploy, and scale intelligent agents in a unified,
          professional environment.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <SignedOut>
            <Link href="/sign-in">
              <Button size="lg" className="h-12 px-8 text-base">
                Sign In
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-8 text-base"
              >
                Create Account
              </Button>
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard">
              <Button size="lg" className="h-12 px-8 text-base">
                Go to Dashboard
              </Button>
            </Link>
          </SignedIn>
        </div>
      </div>
    </main>
  );
}
