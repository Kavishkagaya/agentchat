"use client";

import {
  Bot,
  Database,
  Lock,
  MessageSquare,
  Plug,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const workspaceNav = [
  { name: "Chats", href: "/dashboard", icon: MessageSquare, exact: true },
  { name: "Agents", href: "/dashboard/agents", icon: Bot },
  { name: "MCPs", href: "/dashboard/mcps", icon: Plug },
  { name: "Secrets", href: "/dashboard/secrets", icon: Lock },
  { name: "Models", href: "/dashboard/models", icon: Database },
];

const configNav = [
  { name: "Settings", href: "/dashboard/settings", icon: Settings, exact: false },
];

export function SidebarNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact = false) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      <div className="px-2 mt-2 mb-4 text-xs font-semibold text-muted-foreground tracking-wider uppercase">
        Workspace
      </div>
      <nav className="space-y-2">
        {workspaceNav.map((item) => (
          <Link key={item.name} href={item.href} className="block">
            <button
              type="button"
              className={cn(
                "sidebar-nav-item w-full",
                isActive(item.href, item.exact) && "sidebar-nav-item-active",
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.name}</span>
            </button>
          </Link>
        ))}
      </nav>

      <div className="px-2 mt-8 mb-4 text-xs font-semibold text-muted-foreground tracking-wider uppercase">
        Configuration
      </div>
      <nav className="space-y-2">
        {configNav.map((item) => (
          <Link key={item.name} href={item.href} className="block">
            <button
              type="button"
              className={cn(
                "sidebar-nav-item w-full",
                isActive(item.href, item.exact) && "sidebar-nav-item-active",
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.name}</span>
            </button>
          </Link>
        ))}
      </nav>
    </>
  );
}
