import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { RecLogo } from "@/components/RecLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useT } from "@/lib/i18n";

const navItems = [
  { to: "/attekintes", label: "nav.attekintes" },
  { to: "/email-sor", label: "nav.emailSor" },
  { to: "/crm", label: "nav.crm" },
  { to: "/projektek", label: "nav.projektek" },
  { to: "/talalt-cegek", label: "nav.talaltCegek" },
  { to: "/riportok", label: "nav.riportok" },
  { to: "/beallitasok", label: "nav.beallitasok" },
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
  const { t } = useT();

  const items =
    profile?.role === "admin"
      ? [...navItems, { to: "/felhasznalok", label: "nav.felhasznalok" } as const]
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
      {/* Arany hajszálvonal a fejléc alján — a világoskék marad a márkaszín. */}
      <header className="sticky top-0 z-40 w-full border-b border-gold/35 bg-primary/95 text-primary-foreground backdrop-blur-md supports-[backdrop-filter]:bg-primary/85">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <Link
            to="/attekintes"
            className="flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-1 font-semibold tracking-tight transition-opacity hover:opacity-90"
          >
            {/* Beépített (inline) SVG embléma: nem kell képfájlt feltölteni. */}
            <RecLogo size={36} className="size-9 shrink-0" title="" />
            <span className="hidden whitespace-nowrap text-[15px] leading-tight sm:inline">
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
                {t(item.label)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-4">
            <LanguageSwitcher />
            {/*
              A menü nyolc elem is lehet (adminnál), ezért itt csak a monogram
              látszik — az email-cím és a "Kijelentkezés" szó csak nagyon széles
              képernyőn jelenik meg, különben tördelne a fejléc.
            */}
            <div
              className="hidden items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-1 ring-1 ring-white/15 sm:flex 2xl:pr-3"
              title={profile?.email ?? undefined}
            >
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold"
              >
                {initialsFromEmail(profile?.email)}
              </span>
              <span className="hidden max-w-44 truncate text-xs opacity-90 2xl:inline">
                {profile?.email}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="min-h-9 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
              aria-label={t("header.signOut")}
            >
              <LogOut className="size-4" strokeWidth={1.5} />
              <span className="hidden 2xl:inline">{t("header.signOut")}</span>
            </Button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex size-11 items-center justify-center rounded-xl transition-colors hover:bg-white/15 lg:hidden"
              aria-label={open ? t("header.closeMenu") : t("header.openMenu")}
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
                {t(item.label)}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/*
        Nincs `key={pathname}` a tartalom körül: az útvonalváltáskor a router
        magától lecseréli az oldal komponensét, és az oldal saját `.page-enter`
        animációja fut le. A korábbi kulcsos megoldás minden váltásnál
        újraépítette a teljes fát, ezért ugrált és villogtak a csontvázak.
      */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
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
