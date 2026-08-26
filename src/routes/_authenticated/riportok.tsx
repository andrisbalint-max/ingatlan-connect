import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/riportok")({
  head: () => ({
    meta: [
      { title: "Riportok — Ipari Ingatlan Platform" },
      { name: "description", content: "Piaci riportok és napi összefoglalók a magyar ipari ingatlanpiacról." },
      { property: "og:title", content: "Riportok — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content: "Piaci riportok és napi összefoglalók a magyar ipari ingatlanpiacról.",
      },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Riportok" description="Hamarosan elérhető." />
      <div className="card-surface px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Ez a modul a következő fejlesztési körben készül el.</p>
      </div>
    </div>
  ),
});
