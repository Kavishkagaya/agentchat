import { SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background py-20 text-foreground">
      <h1 className="mb-4 font-bold text-6xl tracking-tighter">Axon</h1>
      <p className="mb-10 text-muted-foreground text-xl">
        The Agentic Cloud OS
      </p>

      <div className="flex gap-4">
        <SignedOut>
          <Link href="/sign-in">
            <Button size="lg">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button size="lg" variant="outline">
              Sign Up
            </Button>
          </Link>
        </SignedOut>
        <SignedIn>
          <Link href="/dashboard">
            <Button size="lg">Go to Dashboard</Button>
          </Link>
        </SignedIn>
      </div>
    </main>
  );
}
