import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/attekintes", label: "Áttekintés" },
  { to: "/email-sor", label: "Email sor" },
  { to: "/crm", label: "CRM" },
  { to: "/projektek", label: "Projektek" },
  { to: "/talalt-cegek", label: "Talált cégek" },
  { to: "/riportok", label: "Riportok" },
  { to: "/beallitasok", label: "Beállítások" },
] as const;

/** "andras.szasz@..." -> "AS" — egyszerű monogram a fejléc profilcsipjéhez. */
function initialsFromEmail(email: string | null | undefined) {
  if (!email) return "?";
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Az útvonal kulcsként szolgál: váltáskor a tartalom újra csatolódik, így a
  // belépő animáció minden oldalon lefut, oldalankénti módosítás nélkül.
  const { pathname } = useLocation();

  const items =
    profile?.role === "admin"
      ? [...navItems, { to: "/felhasznalok", label: "Felhasználók" } as const]
      : navItems;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      window.sessionStorage.removeItem("rec-splash-shown");
    } catch {
      // Nem kritikus: legfeljebb nem játszódik le újra a nyitóképernyő.
    }
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="app-backdrop min-h-dvh">
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-primary/95 text-primary-foreground shadow-[0_1px_0_0_oklch(1_0_0/10%)] backdrop-blur-md supports-[backdrop-filter]:bg-primary/85">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <Link
            to="/attekintes"
            className="flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-1 font-semibold tracking-tight transition-opacity hover:opacity-90"
          >
            {/* A REC embléma önmagában áll: saját arany gyűrűje van, ezért nem
                kap külön hátteret vagy keretet. */}
            <img
              src="/logo-rec.svg"
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0"
            />
            <span className="hidden text-[15px] leading-tight sm:inline">
              Real Estate <span className="font-bold">Connect</span>
            </span>
            <span className="text-[15px] font-bold sm:hidden">REC</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-0.5 lg:flex">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="nav-pill hover:bg-white/15"
                activeProps={{ className: "nav-pill nav-pill-active" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-4">
            <div className="hidden items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 ring-1 ring-white/15 xl:flex">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold"
              >
                {initialsFromEmail(profile?.email)}
              </span>
              <span className="max-w-44 truncate text-xs opacity-90">{profile?.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="min-h-9 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
              aria-label="Kijelentkezés"
            >
              <LogOut className="size-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Kijelentkezés</span>
            </Button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex size-11 items-center justify-center rounded-xl transition-colors hover:bg-white/15 lg:hidden"
              aria-label={open ? "Menü bezárása" : "Menü megnyitása"}
              aria-expanded={open}
            >
              {open ? (
                <X className="size-5" strokeWidth={1.5} />
              ) : (
                <Menu className="size-5" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>

        {open && (
          <nav className="flex flex-col gap-1 border-t border-white/10 px-3 pb-3 pt-2 lg:hidden">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/15"
                activeProps={{
                  className:
                    "flex min-h-11 items-center rounded-xl px-3 text-sm font-medium bg-white/20 text-white",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div key={pathname} className="page-enter">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Minden oldal fejléce. A cím és a leírás egymás után úszik be — mivel ezt a
 * komponenst szinte minden oldal használja, ez az egy hely animálja az összes
 * oldal fejlécét.
 */
export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8">
      <h1 className="rec-fade-up text-[28px] font-semibold leading-tight tracking-tight text-foreground">
        {title}
      </h1>
      {description && (
        <p
          className="rec-fade-up mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground"
          style={{ animationDelay: "90ms" }}
        >
          {description}
        </p>
      )}
    </div>
  );
}
