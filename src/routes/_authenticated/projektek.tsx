import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/projektek")({
  head: () => ({
    meta: [
      { title: "Projektek — Ipari Ingatlan Platform" },
      { name: "description", content: "Ipari ingatlan projektek, méretek és dokumentumok egy helyen." },
      { property: "og:title", content: "Projektek — Ipari Ingatlan Platform" },
      { property: "og:description", content: "Ipari ingatlan projektek, méretek és dokumentumok egy helyen." },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Projektek" description="Hamarosan elérhető." />
      <div className="card-surface px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Ez a modul a következő fejlesztési körben készül el.</p>
      </div>
    </div>
  ),
});
