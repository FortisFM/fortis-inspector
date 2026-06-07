import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Building2, AlertTriangle, Settings, LogOut, Menu, X, CalendarClock, BarChart3 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnline } from "@/hooks/use-online";
import { WifiOff } from "lucide-react";
import logoWhite from "@assets/logo-white-on-navy.jpg";

const NAV = [
  { href: "/", label: "Sites", icon: Building2, match: (p: string) => p === "/" || p.startsWith("/sites") || p.startsWith("/inspections") },
  { href: "/schedule", label: "Schedule", icon: CalendarClock, match: (p: string) => p.startsWith("/schedule") },
  { href: "/issues", label: "Issues", icon: AlertTriangle, match: (p: string) => p.startsWith("/issues") },
  { href: "/analytics", label: "Analytics", icon: BarChart3, match: (p: string) => p.startsWith("/analytics") },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const SidebarInner = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 pt-6 pb-5 border-b border-sidebar-border">
        <img src={logoWhite} alt="Fortis FM" className="h-12 w-auto rounded-sm" data-testid="img-logo-sidebar" />
        <p className="mt-3 text-[11px] uppercase tracking-widest text-sidebar-foreground/55 font-medium">
          Site Inspector
        </p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active = item.match(location);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              data-testid={`link-nav-${item.label.toLowerCase()}`}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3 px-1">
          <p className="text-sm font-medium truncate" data-testid="text-user-name">{user?.name}</p>
          <p className="text-xs text-sidebar-foreground/55 truncate">{user?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          data-testid="button-logout"
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col">{SidebarInner}</aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground">
        <img src={logoWhite} alt="Fortis FM" className="h-8 w-auto rounded-sm" />
        <button onClick={() => setOpen(true)} data-testid="button-menu-open" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-64 max-w-[80%]">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 text-sidebar-foreground"
              data-testid="button-menu-close"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {SidebarInner}
          </div>
        </div>
      )}

      <OfflineBanner />

      <main className="md:pl-64">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}

function OfflineBanner() {
  const { online, queued } = useOnline();
  if (online && queued === 0) return null;
  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white md:ml-64"
      data-testid="offline-banner"
    >
      <WifiOff className="h-4 w-4" />
      {online
        ? `Reconnecting, ${queued} item${queued === 1 ? "" : "s"} queued`
        : `Working offline${queued > 0 ? `, ${queued} item${queued === 1 ? "" : "s"} queued` : ""}`}
    </div>
  );
}
