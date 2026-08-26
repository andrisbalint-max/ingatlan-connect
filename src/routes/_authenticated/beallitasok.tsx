import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/beallitasok")({
  head: () => ({
    meta: [
      { title: "Beállítások — Ipari Ingatlan Platform" },
      { name: "description", content: "Integrációk, napi email limit és kiküldési időablak beállításai." },
      { property: "og:title", content: "Beállítások — Ipari Ingatlan Platform" },
      { property: "og:description", content: "Integrációk, napi email limit és kiküldési időablak beállításai." },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Beállítások" description="Hamarosan elérhető." />
      <div className="card-surface px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Ez a modul a következő fejlesztési körben készül el.</p>
      </div>
    </div>
  ),
});
