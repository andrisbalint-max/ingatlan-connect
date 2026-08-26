import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Bejelentkezés — Ipari Ingatlan Platform" },
      {
        name: "description",
        content: "Belső ipari ingatlan bróker platform bejelentkezés a magyar piac számára.",
      },
      { property: "og:title", content: "Bejelentkezés — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content: "Belső ipari ingatlan bróker platform bejelentkezés a magyar piac számára.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/attekintes", replace: true });
    });
  }, [navigate]);

  async function handleResend() {
    setResending(true);
    setError(null);
    setInfo(null);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setResending(false);
    if (resendError) {
      setError(
        resendError.message.includes("rate limit") || resendError.message.includes("security purposes")
          ? "Túl sok kérés. Kérjük, várjon egy percet, majd próbálja újra."
          : resendError.message,
      );
      return;
    }
    setInfo("Új megerősítő emailt küldtünk. Ellenőrizze a postafiókját (és a spam mappát is).");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setNeedsConfirm(false);

    if (mode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (signInError) {
        const code = (signInError as { code?: string }).code;
        if (code === "email_not_confirmed" || signInError.message.includes("Email not confirmed")) {
          setNeedsConfirm(true);
          setError(
            "Az email cím még nincs megerősítve. Kattintson a postafiókjába küldött megerősítő linkre.",
          );
          return;
        }
        setError("Hibás email cím vagy jelszó.");
        return;
      }
      navigate({ to: "/attekintes", replace: true });
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.session) {
      navigate({ to: "/attekintes", replace: true });
      return;
    }
    setNeedsConfirm(true);
    setInfo("Elküldtünk egy megerősítő emailt. Kérjük, ellenőrizze a postafiókját.");
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-5" strokeWidth={1.5} />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">Ipari Ingatlan Platform</h1>
          <p className="mt-1 text-sm text-muted-foreground">Belső bróker rendszer</p>
        </div>

        <div className="card-surface p-6">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "login" ? "Bejelentkezés" : "Regisztráció"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Adja meg a fiókja adatait a folytatáshoz."
              : "Az első regisztráló felhasználó adminisztrátor lesz."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email cím</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nev@vallalat.hu"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Jelszó</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {info && <p className="text-sm text-accent-foreground">{info}</p>}

            {needsConfirm && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={resending || !email}
                onClick={handleResend}
              >
                {resending && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
                Megerősítő email újraküldése
              </Button>
            )}


            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
              {mode === "login" ? "Belépés" : "Fiók létrehozása"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setInfo(null);
            }}
            className="mt-5 w-full text-center text-sm text-primary hover:underline"
          >
            {mode === "login" ? "Még nincs fiókja? Regisztráció" : "Már van fiókja? Bejelentkezés"}
          </button>
        </div>
      </div>
    </div>
  );
}
