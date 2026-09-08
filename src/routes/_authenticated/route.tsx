import { useCallback, useState } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { SplashScreen } from "@/components/SplashScreen";

/** Munkamenetenként egyszer mutatjuk a nyitóképernyőt, ne minden oldalváltásnál. */
const SPLASH_KEY = "rec-splash-shown";

function readSplashShown() {
  try {
    return window.sessionStorage.getItem(SPLASH_KEY) === "1";
  } catch {
    // Privát mód / letiltott tárolás: ilyenkor inkább kihagyjuk a splash-t.
    return true;
  }
}

function AuthenticatedLayout() {
  const [showSplash, setShowSplash] = useState(() => !readSplashShown());

  const finishSplash = useCallback(() => {
    try {
      window.sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // Ha nem tudjuk elmenteni, akkor is továbbengedjük a felhasználót.
    }
    setShowSplash(false);
  }, []);

  return (
    <>
      {showSplash && <SplashScreen onDone={finishSplash} />}
      <AppShell>
        <Outlet />
      </AppShell>
    </>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});
