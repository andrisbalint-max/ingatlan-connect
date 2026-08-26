import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM — Ipari Ingatlan Platform" },
      { name: "description", content: "Cégek és kapcsolattartók nyilvántartása a magyar ipari ingatlanpiacon." },
      { property: "og:title", content: "CRM — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content: "Cégek és kapcsolattartók nyilvántartása a magyar ipari ingatlanpiacon.",
      },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="CRM" description="Hamarosan elérhető." />
      <div className="card-surface px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Ez a modul a következő fejlesztési körben készül el.</p>
      </div>
    </div>
  ),
});
