import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { hunterSearchByDomain } from "@/lib/hunter.functions";
import {
  categorizeOptenProspects,
  getOptenConfig,
  resolveProspectDomain,
} from "@/lib/opten.functions";
import {
  HUNTER_STATUS_LABELS,
  HUNTER_STATUS_STYLES,
  MATCH_STATUS_LABELS,
  UNCATEGORIZED_LABEL,
  runHunterForProspect,
  type ProspectRow,
} from "@/lib/opten-promote";
import { CONFIDENCE_LABELS, CONFIDENCE_STYLES, type FoundPerson } from "@/lib/decision-maker";
import { OptenImportDialog } from "@/components/OptenImportDialog";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/talalt-cegek")({
  head: () => ({
    meta: [
      { title: "Talált cégek — Ipari Ingatlan Platform" },
      {
        name: "description",
        content:
          "Szervezeti szintű cégadatbázis Opten Excel/CSV importból, AI kategorizálással és Hunter kontaktkereséssel.",
      },
      { property: "og:title", content: "Talált cégek — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content:
          "Szervezeti szintű cégadatbázis Opten Excel/CSV importból, AI kategorizálással és Hunter kontaktkereséssel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FoundCompanies,
});

interface MatchRow {
  id: string;
  status: string;
  opten_prospect_id: string;
  projects: { id: string; title: string } | null;
}

function FoundCompanies() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const runHunter = useServerFn(hunterSearchByDomain);
  const categorize = useServerFn(categorizeOptenProspects);
  const findDomain = useServerFn(resolveProspectDomain);


  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newCategoryFor, setNewCategoryFor] = useState<string | null>(null);
  const [newCategoryValue, setNewCategoryValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProspectRow | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  /** prospect id -> AI web search source URL (in-session, csak ellenőrzéshez) */
  const [domainSources, setDomainSources] = useState<Record<string, string>>({});
  /** prospect id -> "nem található automatikusan" jelzés az utolsó AI futásból */
  const [domainMissing, setDomainMissing] = useState<Set<string>>(new Set());
  const [domainEditFor, setDomainEditFor] = useState<string | null>(null);
  const [domainEditValue, setDomainEditValue] = useState("");


  const isAdmin = profile?.role === "admin";

  const { data: config } = useQuery({ queryKey: ["opten-config"], queryFn: () => getOptenConfig() });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["opten-prospects-all"],
    queryFn: async (): Promise<ProspectRow[]> => {
      const { data, error } = await supabase
        .from("opten_prospects")
        .select("*")
        .order("company_name", { ascending: true });
      if (error) throw error;
      return data as unknown as ProspectRow[];
    },
  });

  const { data: matches } = useQuery({
    queryKey: ["project-opten-matches-all"],
    queryFn: async (): Promise<MatchRow[]> => {
      const { data, error } = await supabase
        .from("project_opten_matches")
        .select("id, status, opten_prospect_id, projects(id, title)");
      if (error) throw error;
      return data as unknown as MatchRow[];
    },
  });

  const matchesByProspect = useMemo(() => {
    const map = new Map<string, MatchRow[]>();
    (matches ?? []).forEach((row) => {
      const list = map.get(row.opten_prospect_id) ?? [];
      list.push(row);
      map.set(row.opten_prospect_id, list);
    });
    return map;
  }, [matches]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set((rows ?? []).map((row) => row.activity_category).filter(Boolean) as string[]),
      ).sort((a, b) => a.localeCompare(b, "hu")),
    [rows],
  );

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) => !needle || row.company_name.toLowerCase().includes(needle),
    );
  }, [rows, term]);

  const groups = useMemo(() => {
    const map = new Map<string, ProspectRow[]>();
    visible.forEach((row) => {
      const key = row.activity_category ?? UNCATEGORIZED_LABEL;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    });
    return Array.from(map, ([category, items]) => ({ category, items })).sort((a, b) => {
      if (a.category === UNCATEGORIZED_LABEL) return 1;
      if (b.category === UNCATEGORIZED_LABEL) return -1;
      return a.category.localeCompare(b.category, "hu");
    });
  }, [visible]);

  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));

  const runCategorize = useMutation({
    mutationFn: () => categorize({ data: undefined as never }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
      if (result.status === "ok") {
        setNotice(null);
        toast.success(`${result.categorized ?? 0} cég kategorizálva.`);
      } else if (result.status === "nothing_to_do") {
        setNotice(null);
        toast.info(result.message ?? "Minden cég kategorizálva van.");
      } else {
        setNotice(result.message ?? "A kategorizálás nem futott le.");
      }
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const bulkHunter = useMutation({
    mutationFn: async () => {
      const targets = (selected.size > 0 ? visible.filter((r) => selected.has(r.id)) : visible).filter(
        (row) => row.hunter_status !== "talalat",
      );
      setProgress({ done: 0, total: targets.length });
      let found = 0;
      for (const [index, row] of targets.entries()) {
        const result = await runHunterForProspect(row, runHunter, { keepManualPick: true });
        if (result.status === "talalat") found += 1;
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

  /**
   * AI web-search domain kitöltés — csak azoknál a soroknál fut, ahol a domain
   * még NULL, így az Opten importból vagy kézi szerkesztésből származó értéket
   * soha nem írja felül.
   */
  const bulkDomainSearch = useMutation({
    mutationFn: async () => {
      const targets = (
        selected.size > 0 ? visible.filter((r) => selected.has(r.id)) : visible
      ).filter((row) => !row.domain);
      setProgress({ done: 0, total: targets.length });
      let found = 0;
      let missing = 0;
      let stopMessage: string | null = null;
      const sources: Record<string, string> = {};
      const notFound = new Set<string>();

      for (const [index, row] of targets.entries()) {
        const result = await findDomain({ data: { prospectId: row.id } });
        if (result.status === "ok") {
          found += 1;
          if (result.sourceUrl) sources[row.id] = result.sourceUrl;
        } else if (result.status === "not_found") {
          missing += 1;
          notFound.add(row.id);
        } else if (result.status === "no_provider" || result.status === "out_of_credit") {
          stopMessage = result.message ?? "Az AI-keresés nem futott le.";
          break;
        } else if (result.status === "error") {
          missing += 1;
          notFound.add(row.id);
        }
        setProgress({ done: index + 1, total: targets.length });
      }

      setDomainSources((prev) => ({ ...prev, ...sources }));
      setDomainMissing((prev) => new Set([...prev, ...notFound]));
      return { found, missing, stopMessage };
    },
    onSettled: () => {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
    },
    onSuccess: ({ found, missing, stopMessage }) => {
      if (stopMessage) {
        setNotice(stopMessage);
        toast.info(stopMessage);
        return;
      }
      setNotice(null);
      toast.success(`${found} domain megtalálva, ${missing} nem található.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveDomain = useMutation({
    mutationFn: async ({ id, domain }: { id: string; domain: string }) => {
      const cleaned = domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");
      const { error } = await supabase
        .from("opten_prospects")
        .update({
          domain: cleaned || null,
          domain_source: cleaned ? "kezi" : null,
        })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
      setDomainMissing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDomainSources((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDomainEditFor(null);
      setDomainEditValue("");
      toast.success("Domain frissítve.");
    },
    onError: () => toast.error("A domain mentése nem sikerült, próbáld újra."),
  });

  const setCategory = useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { error } = await supabase
        .from("opten_prospects")
        .update({ activity_category: category })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
      setNewCategoryFor(null);
      setNewCategoryValue("");
      toast.success("Kategória frissítve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setDecisionMaker = useMutation({
    mutationFn: async ({ row, person }: { row: ProspectRow; person: FoundPerson }) => {
      const { error } = await supabase
        .from("opten_prospects")
        .update({
          decision_maker_name: person.name?.trim() || person.email || null,
          decision_maker_email: person.email ?? null,
          decision_maker_position: person.position ?? null,
          decision_maker_match_confidence: "magas",
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
      toast.success("Döntéshozó frissítve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteProspects = useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      const { error } = await supabase.from("opten_prospects").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
      queryClient.invalidateQueries({ queryKey: ["project-opten-matches-all"] });
      setSelected(new Set());
      setDeleteTarget(null);
      setBulkDeleteOpen(false);
      toast.success(`${count} cég törölve.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Talált cégek"
        description="A szervezet közös cégadatbázisa — Opten Excel/CSV importból, tevékenységi kör szerint csoportosítva."
      />

      <div className="card-surface mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Keresés cégnév szerint…"
            aria-label="Keresés cégnév szerint"
          />
        </div>
        {profile && (
          <OptenImportDialog
            organizationId={profile.organization_id}
            bands={config?.bands ?? []}
            savedMapping={config?.columnMapping ?? null}
            onImported={() => runCategorize.mutate()}
          />
        )}
        <Button
          variant="outline"
          onClick={() => runCategorize.mutate()}
          disabled={runCategorize.isPending}
        >
          {runCategorize.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" strokeWidth={1.5} />
          )}
          Kategóriák frissítése
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={allVisibleSelected}
            onCheckedChange={(checked) =>
              setSelected(() => (checked === true ? new Set(visible.map((r) => r.id)) : new Set()))
            }
            aria-label="Mind kijelölése"
          />
          Mind
        </label>
        <Button
          variant="outline"
          onClick={() => bulkDomainSearch.mutate()}
          disabled={bulkDomainSearch.isPending || bulkHunter.isPending || visible.length === 0}
          title="Futtasd ezt előbb — a Hunter csak domainnel tud kontaktot keresni."
        >
          {bulkDomainSearch.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Globe className="mr-2 size-4" strokeWidth={1.5} />
          )}
          1. Domain keresése hiányzóknál (AI)
        </Button>
        <Button
          onClick={() => bulkHunter.mutate()}
          disabled={bulkHunter.isPending || bulkDomainSearch.isPending || visible.length === 0}
        >
          {bulkHunter.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Search className="mr-2 size-4" strokeWidth={1.5} />
          )}
          2. Keresés Hunterrel
        </Button>
        {isAdmin && (
          <Button
            variant="outline"
            onClick={() => setBulkDeleteOpen(true)}
            disabled={selected.size === 0 || deleteProspects.isPending}
          >
            {deleteProspects.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" strokeWidth={1.5} />
            )}
            Kiválasztottak törlése
          </Button>
        )}
        {progress && (
          <span className="text-sm text-muted-foreground">
            {progress.done}/{progress.total} cég feldolgozva
          </span>
        )}
      </div>

      {notice && (
        <p className="card-surface mb-6 px-4 py-3 text-sm text-muted-foreground">{notice}</p>
      )}

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
            {rows && rows.length > 0
              ? "Nincs a keresésnek megfelelő cég."
              : "Még nincs cég az adatbázisban — töltsd fel az Opten exportot (Excel/CSV)."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.category);
            return (
              <section key={group.category} className="space-y-3">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.category)) next.delete(group.category);
                      else next.add(group.category);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-2 text-left text-sm font-semibold text-foreground"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4" strokeWidth={1.5} />
                  ) : (
                    <ChevronDown className="size-4" strokeWidth={1.5} />
                  )}
                  {group.category}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({group.items.length})
                  </span>
                </button>

                {!isCollapsed && (
                  <ul className="space-y-3">
                    {group.items.map((row) => {
                      const people = (row.found_contacts ?? []).filter((person) => person?.email);
                      const prospectMatches = matchesByProspect.get(row.id) ?? [];
                      return (
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
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium text-foreground">
                                    {row.company_name}
                                  </p>
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                      HUNTER_STATUS_STYLES[row.hunter_status] ??
                                      "bg-muted text-muted-foreground"
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
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeleteTarget(row)}
                                    aria-label={`${row.company_name} törlése`}
                                  >
                                    <Trash2 className="size-4" strokeWidth={1.5} />
                                  </Button>
                                )}
                              </div>

                              <p className="text-sm text-muted-foreground">
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
                                <p className="text-xs text-muted-foreground">
                                  Nincs domain — Hunter nem tud rá keresni
                                </p>
                              )}

                              {row.decision_maker_email ? (
                                <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                                  <UserCheck className="size-4 text-primary" strokeWidth={1.5} />
                                  Döntéshozó: {row.decision_maker_name}
                                  {row.decision_maker_position
                                    ? ` — ${row.decision_maker_position}`
                                    : ""}{" "}
                                  ({row.decision_maker_email})
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                      CONFIDENCE_STYLES[
                                        row.decision_maker_match_confidence ?? "nincs_talalat"
                                      ]
                                    }`}
                                  >
                                    {
                                      CONFIDENCE_LABELS[
                                        row.decision_maker_match_confidence ?? "nincs_talalat"
                                      ]
                                    }
                                  </span>
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Még nincs kiválasztott döntéshozó.
                                </p>
                              )}

                              {prospectMatches.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Projektek:{" "}
                                  {prospectMatches
                                    .map(
                                      (match) =>
                                        `${match.projects?.title ?? "—"} (${
                                          MATCH_STATUS_LABELS[match.status] ?? match.status
                                        })`,
                                    )
                                    .join(", ")}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Select
                                  value={row.activity_category ?? ""}
                                  onValueChange={(value) => {
                                    if (value === "__new") {
                                      setNewCategoryFor(row.id);
                                      setNewCategoryValue("");
                                      return;
                                    }
                                    setCategory.mutate({ id: row.id, category: value });
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-56 text-xs">
                                    <SelectValue placeholder="Kategória kiválasztása" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categories.map((category) => (
                                      <SelectItem key={category} value={category}>
                                        {category}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="__new">Új kategória…</SelectItem>
                                  </SelectContent>
                                </Select>

                                {people.length > 0 && (
                                  <Select
                                    value={row.decision_maker_email ?? ""}
                                    onValueChange={(email) => {
                                      const person = people.find((item) => item.email === email);
                                      if (person) setDecisionMaker.mutate({ row, person });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-64 text-xs">
                                      <SelectValue placeholder="Másik kiválasztása" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {people.map((person) => (
                                        <SelectItem key={person.email!} value={person.email!}>
                                          {(person.name || person.email) +
                                            (person.position ? ` — ${person.position}` : "")}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>

                              {newCategoryFor === row.id && (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <Input
                                    value={newCategoryValue}
                                    onChange={(e) => setNewCategoryValue(e.target.value)}
                                    placeholder="Új kategória neve"
                                    className="h-8 w-56 text-xs"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      setCategory.mutate({
                                        id: row.id,
                                        category: newCategoryValue.trim(),
                                      })
                                    }
                                    disabled={
                                      newCategoryValue.trim().length === 0 || setCategory.isPending
                                    }
                                  >
                                    Mentés
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setNewCategoryFor(null)}
                                  >
                                    Mégse
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cég törlése</DialogTitle>
            <DialogDescription>
              Biztosan törlöd a(z) <strong>{deleteTarget?.company_name}</strong> céget az
              adatbázisból? Ez minden projektből eltávolítja a hozzá tartozó javaslatokat is.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Mégse
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteProspects.mutate({ ids: [deleteTarget.id] })}
              disabled={deleteProspects.isPending}
            >
              {deleteProspects.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Törlés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kiválasztott cégek törlése</DialogTitle>
            <DialogDescription>
              Biztosan törlöd a kiválasztott <strong>{selected.size}</strong> céget az
              adatbázisból?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
              Mégse
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteProspects.mutate({ ids: Array.from(selected) })}
              disabled={selected.size === 0 || deleteProspects.isPending}
            >
              {deleteProspects.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Törlés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
