import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Building2, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ipari Ingatlan Bróker Platform" },
      {
        name: "description",
        content:
          "Belső platform ipari ingatlan brókereknek: email sor, CRM, projektek és piaci riportok egy helyen.",
      },
      { property: "og:title", content: "Ipari Ingatlan Bróker Platform" },
      {
        property: "og:description",
        content:
          "Belső platform ipari ingatlan brókereknek: email sor, CRM, projektek és piaci riportok egy helyen.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/attekintes" : "/auth", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Building2 className="size-5" strokeWidth={1.5} />
      </div>
      <h1 className="text-lg font-semibold text-foreground">Ipari Ingatlan Platform</h1>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
        Betöltés…
      </p>
    </div>
  );
}
