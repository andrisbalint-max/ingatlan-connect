import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { hunterSearchByDomain } from "@/lib/hunter.functions";
import {
  HUNTER_STATUS_LABELS,
  HUNTER_STATUS_STYLES,
  promoteProspectToCrm,
  type ProspectRow,
} from "@/lib/opten-promote";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/talalt-cegek")({
  head: () => ({
    meta: [
      { title: "Talált cégek — Ipari Ingatlan Platform" },
      {
        name: "description",
        content: "Optenből talált potenciális cégek projektenként, Hunter kontaktkereséssel.",
      },
      { property: "og:title", content: "Talált cégek — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content: "Optenből talált potenciális cégek projektenként, Hunter kontaktkereséssel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FoundCompanies,
});

interface Row extends ProspectRow {
  projects: { id: string; title: string } | null;
}

function FoundCompanies() {
  const queryClient = useQueryClient();
  const runHunter = useServerFn(hunterSearchByDomain);
  const [projectFilter, setProjectFilter] = useState("all");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["opten-prospects-all"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("opten_prospects")
        .select("*, projects(id, title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    (rows ?? []).forEach((row) => {
      if (row.projects) map.set(row.projects.id, row.projects.title);
    });
    return Array.from(map, ([id, title]) => ({ id, title }));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (projectFilter !== "all" && row.project_id !== projectFilter) return false;
      if (needle && !row.company_name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, projectFilter, term]);

  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((row) => (checked ? next.add(row.id) : next.delete(row.id)));
      return next;
    });
  }

  const bulkHunter = useMutation({
    mutationFn: async () => {
      const targets = (selected.size > 0 ? visible.filter((r) => selected.has(r.id)) : visible).filter(
        (row) => row.hunter_status !== "talalat",
      );
      setProgress({ done: 0, total: targets.length });
      let found = 0;
      for (const [index, row] of targets.entries()) {
        const domain = (row.domain ?? "").trim();
        if (!domain) {
          await supabase
            .from("opten_prospects")
            .update({ hunter_status: "nincs_domain" })
            .eq("id", row.id);
          setProgress({ done: index + 1, total: targets.length });
          continue;
        }
        await supabase
          .from("opten_prospects")
          .update({ hunter_status: "folyamatban" })
          .eq("id", row.id);
        try {
          const result = await runHunter({ data: { domain } });
          if (result.status === "no_api_key") {
            throw new Error(result.message ?? "Nincs Hunter API kulcs.");
          }
          const people = result.status === "ok" ? result.people.slice(0, 5) : [];
          if (people.length > 0) found += 1;
          await supabase
            .from("opten_prospects")
            .update({
              hunter_status: people.length > 0 ? "talalat" : "nincs_talalat",
              found_contacts: people as never,
            })
            .eq("id", row.id);
        } catch (err) {
          await supabase
            .from("opten_prospects")
            .update({ hunter_status: "nincs_inditva" })
            .eq("id", row.id);
          throw err;
        }
        setProgress({ done: index + 1, total: targets.length });
      }
      return { processed: targets.length, found };
    },
    onSettled: () => {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
    },
    onSuccess: ({ processed, found }) =>
      toast.success(`${processed} cég feldolgozva — ${found} cégnél találtunk kontaktot.`),
    onError: (error: Error) => toast.error(error.message),
  });

  const promote = useMutation({
    mutationFn: (prospect: Row) => promoteProspectToCrm(prospect),
    onSuccess: ({ savedContacts }) => {
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(
        savedContacts > 0
          ? `CRM-be mentve — ${savedContacts} kontakt is átkerült.`
          : "CRM-be mentve.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Talált cégek"
        description="Az Opten keresésekből érkezett potenciális cégek minden projektből."
      />

      <div className="card-surface mb-6 flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-48 flex-1">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Keresés cégnév szerint…"
            aria-label="Keresés cégnév szerint"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Minden projekt" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Minden projekt</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={allVisibleSelected}
            onCheckedChange={(checked) => toggleAll(checked === true)}
            aria-label="Mind kijelölése"
          />
          Mind
        </label>
        <Button onClick={() => bulkHunter.mutate()} disabled={bulkHunter.isPending || visible.length === 0}>
          {bulkHunter.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Search className="mr-2 size-4" strokeWidth={1.5} />
          )}
          Keresés Hunterrel
        </Button>
        {progress && (
          <span className="text-sm text-muted-foreground">
            {progress.done}/{progress.total} cég feldolgozva
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="card-surface px-6 py-16 text-center">
          <Building2 className="mx-auto mb-3 size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Még nincs talált cég. Indíts Opten keresést egy projekt részleteinél.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={row.id} className="card-surface p-4">
              <div className="flex flex-wrap items-start gap-3">
                <Checkbox
                  checked={selected.has(row.id)}
                  aria-label={`${row.company_name} kijelölése`}
                  onCheckedChange={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (checked === true) next.add(row.id);
                      else next.delete(row.id);
                      return next;
                    })
                  }
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{row.company_name}</p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        HUNTER_STATUS_STYLES[row.hunter_status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {HUNTER_STATUS_LABELS[row.hunter_status] ?? row.hunter_status}
                    </span>
                    {row.promoted_to_crm && (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        CRM-ben
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[
                      row.teaor_code ? `TEÁOR ${row.teaor_code}` : null,
                      row.teaor_description,
                      row.net_revenue_band,
                      row.city,
                      row.domain || "Nincs domain megadva",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {!row.domain && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nincs domain — Hunter nem tud rá keresni
                    </p>
                  )}
                  {row.projects && (
                    <Link
                      to="/projektek"
                      className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                    >
                      Projekt: {row.projects.title}
                    </Link>
                  )}
                </div>
                <div className="shrink-0">
                  {row.promoted_to_crm ? (
                    <span className="text-xs font-medium text-primary">Már a CRM-ben</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => promote.mutate(row)}
                      disabled={promote.isPending}
                    >
                      {promote.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Hozzáadás a CRM-hez
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
