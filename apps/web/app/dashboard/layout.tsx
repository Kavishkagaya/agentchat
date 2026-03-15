import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Terminal } from "lucide-react";
import Link from "next/link";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { ModeToggle } from "@/components/mode-toggle";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar with Glass Effect */}
      <aside className="sidebar-glass hidden w-80 flex-col border-r border-border md:flex">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-border/40 px-8">
          <Link
            className="flex items-center gap-3 font-semibold hover:opacity-80 transition-opacity"
            href="/"
          >
            <div className="rounded-lg bg-primary p-2">
              <Terminal className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">Axon</span>
          </Link>
          <ModeToggle />
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-8 custom-scrollbar">
          <div className="space-y-6 px-6">
            {/* Organization Switcher */}
            <div>
              <OrganizationSwitcher
                afterCreateOrganizationUrl="/dashboard"
                afterSelectOrganizationUrl="/dashboard"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    organizationSwitcherTrigger:
                      "w-full justify-between border border-border/40 bg-secondary/50 hover:bg-secondary transition-colors rounded-lg px-4 py-3 text-sm backdrop-blur-sm",
                  },
                }}
              />
            </div>

            {/* Sidebar Navigation */}
            <SidebarNav />
          </div>
        </div>

        {/* Footer - Account */}
        <div className="border-t border-border/40 p-6">
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/30 px-4 py-3 hover:bg-secondary/50 transition-colors backdrop-blur-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">
                Account
              </span>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                Verified
              </span>
            </div>
            <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
