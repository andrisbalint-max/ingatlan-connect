import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/email-sor")({
  head: () => ({
    meta: [
      { title: "Email sor — Ipari Ingatlan Platform" },
      { name: "description", content: "Jóváhagyásra váró és kiküldött megkereső emailek kezelése." },
      { property: "og:title", content: "Email sor — Ipari Ingatlan Platform" },
      { property: "og:description", content: "Jóváhagyásra váró és kiküldött megkereső emailek kezelése." },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Email sor" description="Hamarosan elérhető." />
      <div className="card-surface px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Ez a modul a következő fejlesztési körben készül el.</p>
      </div>
    </div>
  ),
});
