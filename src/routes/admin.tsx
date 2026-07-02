import { createFileRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AppearanceButton } from "@/components/appearance-button";
import {
  LayoutDashboard, Printer, UserPlus, Settings, Users, LogOut, CalendarCheck, Menu,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — TSU Scheduling" }] }),
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/admin/reports", label: "Printing of Reports", icon: Printer },
  { to: "/admin/add-admin", label: "Add Admin", icon: UserPlus },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/users", label: "Users", icon: Users },
];

function SidebarContent({
  pathname,
  email,
  photoUrl,
  onSignOut,
  onNavigate,
}: {
  pathname: string;
  email: string | null | undefined;
  photoUrl: string | null;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5 border-b">
        <div className="flex items-center gap-2">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-9 w-9 rounded-lg object-cover border" />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center">
              {(email || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm">Admin Panel</div>
            <div className="text-xs text-muted-foreground">Scheduling System</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map((n) => {
          const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t">
        <div className="flex items-center gap-2 mb-2">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-8 w-8 rounded-full object-cover border" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
              {(email || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-xs text-muted-foreground truncate flex-1">{email}</div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={onSignOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}

function AdminLayout() {
  const { user, role, loading, photoUrl, signOutUser } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.navigate({ to: "/login" });
    else if (role !== "admin") router.navigate({ to: "/book" });
  }, [user, role, loading, router]);

  if (!user || role !== "admin") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Checking access…</div>;
  }

  const handleSignOut = () => signOutUser().then(() => router.navigate({ to: "/login" }));

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r bg-background flex-col shrink-0">
        <SidebarContent pathname={pathname} email={user.email} photoUrl={photoUrl} onSignOut={handleSignOut} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b bg-background px-3 py-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SidebarContent
                pathname={pathname}
                email={user.email}
                photoUrl={photoUrl}
                onSignOut={handleSignOut}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">TSU</div>
            <span className="text-sm font-semibold">Admin</span>
          </div>
          <div className="w-9" />
        </header>

        <main className="flex-1 overflow-auto min-w-0">
          <Outlet />
        </main>
      </div>

      <AppearanceButton />
    </div>
  );
}
