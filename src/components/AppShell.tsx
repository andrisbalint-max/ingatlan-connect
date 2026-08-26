import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, LogOut, Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/attekintes", label: "Áttekintés" },
  { to: "/email-sor", label: "Email sor" },
  { to: "/crm", label: "CRM" },
  { to: "/projektek", label: "Projektek" },
  { to: "/riportok", label: "Riportok" },
  { to: "/beallitasok", label: "Beállítások" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const items = profile?.role === "admin" ? [...navItems, { to: "/felhasznalok", label: "Felhasználók" } as const] : navItems;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="w-full bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/attekintes" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <Building2 className="size-5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Ipari Ingatlan Platform</span>
            <span className="sm:hidden">IIP</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="nav-pill hover:bg-primary-hover/40"
                activeProps={{ className: "nav-pill nav-pill-active" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-4">
            <span className="hidden text-sm opacity-80 xl:inline">{profile?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-primary-foreground hover:bg-primary-hover/40 hover:text-primary-foreground"
              aria-label="Kijelentkezés"
            >
              <LogOut className="size-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Kijelentkezés</span>
            </Button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-md p-2 hover:bg-primary-hover/40 lg:hidden"
              aria-label="Menü"
            >
              {open ? <X className="size-5" strokeWidth={1.5} /> : <Menu className="size-5" strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="flex flex-col gap-1 px-4 pb-4 lg:hidden">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="nav-pill hover:bg-primary-hover/40"
                activeProps={{ className: "nav-pill nav-pill-active" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
