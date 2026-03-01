import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  Bot,
  Command,
  Database,
  LayoutDashboard,
  Lock,
  Plug,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-muted/10 md:flex">
        <div className="flex h-16 items-center border-b px-6">
          <Link className="flex items-center gap-2 font-semibold" href="/">
            <Command className="h-6 w-6" />
            <span className="text-lg">Axon</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-6">
          <nav className="grid items-start gap-2 px-4 font-medium text-sm">
            <div className="mb-4 px-2">
              <OrganizationSwitcher
                afterCreateOrganizationUrl="/dashboard"
                afterSelectOrganizationUrl="/dashboard"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    organizationSwitcherTrigger:
                      "w-full justify-between border border-input rounded-md px-3 py-2",
                  },
                }}
              />
            </div>

            <Link href="/dashboard">
              <Button
                className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                variant="ghost"
              >
                <LayoutDashboard className="h-4 w-4" />
                Groups
              </Button>
            </Link>
            <Link href="/dashboard/agents">
              <Button
                className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                variant="ghost"
              >
                <Bot className="h-4 w-4" />
                Agents
              </Button>
            </Link>
            <Link href="/dashboard/mcps">
              <Button
                className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                variant="ghost"
              >
                <Plug className="h-4 w-4" />
                MCPs
              </Button>
            </Link>
            <Link href="/dashboard/secrets">
              <Button
                className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                variant="ghost"
              >
                <Lock className="h-4 w-4" />
                Secrets
              </Button>
            </Link>
            <Link href="/dashboard/models">
              <Button
                className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                variant="ghost"
              >
                <Database className="h-4 w-4" />
                Models
              </Button>
            </Link>
            <Link href="/dashboard/settings">
              <Button
                className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                variant="ghost"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </Link>
          </nav>
        </div>
        <div className="border-t p-4">
          <div className="flex items-center justify-between px-2">
            <span className="font-medium text-muted-foreground text-sm">
              Account
            </span>
            <UserButton />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-muted/5 p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
