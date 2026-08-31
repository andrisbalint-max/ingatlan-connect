import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { hunterSearchByDomain } from "@/lib/hunter.functions";
import { suggestProjectCategories } from "@/lib/opten.functions";
import {
  MATCH_STATUS_LABELS,
  MATCH_STATUS_STYLES,
  UNCATEGORIZED_LABEL,
  promoteProspectToCrm,
  runHunterForProspect,
  type ProspectRow,
} from "@/lib/opten-promote";
import { CONFIDENCE_LABELS, CONFIDENCE_STYLES } from "@/lib/decision-maker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface MatchRow {
  id: string;
  status: string;
  match_reason: string | null;
  opten_prospect_id: string;
  opten_prospects: ProspectRow | null;
}

export function ProjectOptenMatchesSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const suggest = useServerFn(suggestProjectCategories);
  const runHunter = useServerFn(hunterSearchByDomain);
  const [checked, setChecked] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualTerm, setManualTerm] = useState("");

  const { data: project } = useQuery({
    queryKey: ["project-target-categories", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, organization_id, target_activity_categories")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: prospects } = useQuery({
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

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ["project-opten-matches", projectId],
    queryFn: async (): Promise<MatchRow[]> => {
      const { data, error } = await supabase
        .from("project_opten_matches")
        .select("id, status, match_reason, opten_prospect_id, opten_prospects(*)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as MatchRow[];
    },
  });

  const categories = useMemo(
    () =>
      Array.from(
        new Set((prospects ?? []).map((row) => row.activity_category).filter(Boolean) as string[]),
      ).sort((a, b) => a.localeCompare(b, "hu")),
    [prospects],
  );

  useEffect(() => {
    setChecked(project?.target_activity_categories ?? []);
    setNotice(null);
  }, [project?.id, project?.target_activity_categories]);

  const askAi = useMutation({
    mutationFn: () => suggest({ data: { projectId } }),
    onSuccess: (result) => {
      if (result.status === "ok") {
        setNotice(null);
        const picked = result.categories ?? [];
        setChecked((prev) => Array.from(new Set([...prev, ...picked])));
        if (picked.length === 0) setNotice("Az AI nem talált illeszkedő kategóriát.");
      } else {
        setNotice(result.message ?? "A javaslat nem készült el.");
      }
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const saveCategories = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("projects")
        .update({ target_activity_categories: checked })
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-target-categories", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Tevékenységi körök mentve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const findMatches = useMutation({
    mutationFn: async () => {
      const targets = project?.target_activity_categories ?? [];
      if (targets.length === 0) throw new Error("Először mentsd el a releváns tevékenységi köröket.");
      const existing = new Set((matches ?? []).map((row) => row.opten_prospect_id));
      const rows = (prospects ?? [])
        .filter((row) => row.activity_category && targets.includes(row.activity_category))
        .filter((row) => !existing.has(row.id))
        .map((row) => ({
          organization_id: row.organization_id,
          project_id: projectId,
          opten_prospect_id: row.id,
          status: "javasolt",
          match_reason: `Tevékenységi kör egyezés: ${row.activity_category}`,
        }));
      if (rows.length === 0) return { created: 0 };
      const { error } = await supabase
        .from("project_opten_matches")
        .upsert(rows, { onConflict: "project_id,opten_prospect_id", ignoreDuplicates: true });
      if (error) throw error;
      return { created: rows.length };
    },
    onSuccess: ({ created }) => {
      queryClient.invalidateQueries({ queryKey: ["project-opten-matches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-opten-matches-all"] });
      toast.success(created > 0 ? `${created} új javasolt cég.` : "Nincs új illeszkedő cég.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addManual = useMutation({
    mutationFn: async (prospect: ProspectRow) => {
      const { error } = await supabase.from("project_opten_matches").upsert(
        {
          organization_id: prospect.organization_id,
          project_id: projectId,
          opten_prospect_id: prospect.id,
          status: "javasolt",
          match_reason: "Kézzel hozzáadva",
        },
        { onConflict: "project_id,opten_prospect_id", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setManualTerm("");
      queryClient.invalidateQueries({ queryKey: ["project-opten-matches", projectId] });
      toast.success("Cég hozzáadva a projekthez (javasolt).");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approve = useMutation({
    mutationFn: async (match: MatchRow) => {
      let prospect = match.opten_prospects;
      if (!prospect) throw new Error("A cég adatai nem elérhetők.");

      if (prospect.hunter_status === "nincs_inditva") {
        await runHunterForProspect(prospect, runHunter, { keepManualPick: true });
        const { data: refreshed } = await supabase
          .from("opten_prospects")
          .select("*")
          .eq("id", prospect.id)
          .maybeSingle();
        if (refreshed) prospect = refreshed as unknown as ProspectRow;
      }

      const result = await promoteProspectToCrm(prospect, projectId);

      const { error } = await supabase
        .from("project_opten_matches")
        .update({ status: "jovahagyva" })
        .eq("id", match.id);
      if (error) throw error;

      return result;
    },
    onSuccess: ({ savedContacts }) => {
      queryClient.invalidateQueries({ queryKey: ["project-opten-matches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
      queryClient.invalidateQueries({ queryKey: ["project-companies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(
        savedContacts > 0
          ? `Jóváhagyva — ${savedContacts} kontakt is átkerült a CRM-be.`
          : "Jóváhagyva — a cég bekerült a CRM-be.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reject = useMutation({
    mutationFn: async (match: MatchRow) => {
      const { error } = await supabase
        .from("project_opten_matches")
        .update({ status: "elvetve" })
        .eq("id", match.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-opten-matches", projectId] });
      toast.success("Elvetve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const groups = useMemo(() => {
    const map = new Map<string, MatchRow[]>();
    (matches ?? []).forEach((row) => {
      const key = row.opten_prospects?.activity_category ?? UNCATEGORIZED_LABEL;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    });
    return Array.from(map, ([category, items]) => ({ category, items })).sort((a, b) =>
      a.category.localeCompare(b.category, "hu"),
    );
  }, [matches]);

  const manualResults = useMemo(() => {
    const needle = manualTerm.trim().toLowerCase();
    if (needle.length < 2) return [];
    const linked = new Set((matches ?? []).map((row) => row.opten_prospect_id));
    return (prospects ?? [])
      .filter((row) => row.company_name.toLowerCase().includes(needle) && !linked.has(row.id))
      .slice(0, 6);
  }, [manualTerm, prospects, matches]);

  return (
    <section className="space-y-5">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Releváns tevékenységi körök</h3>

        {categories.length === 0 ? (
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
            Még nincs kategorizált cég — töltsd fel az Opten exportot a Talált cégek oldalon, majd
            futtasd a kategorizálást.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={checked.includes(category)}
                    aria-label={category}
                    onCheckedChange={(value) =>
                      setChecked((prev) =>
                        value === true
                          ? Array.from(new Set([...prev, category]))
                          : prev.filter((item) => item !== category),
                      )
                    }
                  />
                  {category}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => askAi.mutate()}
                disabled={askAi.isPending}
              >
                {askAi.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 size-4" strokeWidth={1.5} />
                )}
                AI javaslat
              </Button>
              <Button
                size="sm"
                onClick={() => saveCategories.mutate()}
                disabled={saveCategories.isPending}
              >
                {saveCategories.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Mentés
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => findMatches.mutate()}
                disabled={findMatches.isPending}
              >
                {findMatches.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Search className="mr-2 size-4" strokeWidth={1.5} />
                )}
                Releváns cégek keresése
              </Button>
            </div>
          </>
        )}

        {notice && (
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Cég hozzáadása kézzel</h3>
        <Input
          value={manualTerm}
          onChange={(e) => setManualTerm(e.target.value)}
          placeholder="Keresés a cégadatbázisban…"
          aria-label="Keresés a cégadatbázisban"
        />
        {manualResults.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {manualResults.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-sm text-foreground">
                  {row.company_name}
                  {row.activity_category ? ` · ${row.activity_category}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addManual.mutate(row)}
                  disabled={addManual.isPending}
                >
                  <Plus className="mr-1 size-4" strokeWidth={1.5} />
                  Hozzáadás
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Célzott cégek</h3>
        {matchesLoading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : groups.length === 0 ? (
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
            Még nincs illesztett cég. Válaszd ki a releváns tevékenységi köröket, majd indítsd a
            „Releváns cégek keresése” gombot.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.category} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {group.category} ({group.items.length})
              </p>
              <ul className="space-y-2">
                {group.items.map((match) => {
                  const prospect = match.opten_prospects;
                  return (
                    <li key={match.id} className="rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">
                              {prospect?.company_name ?? "—"}
                            </p>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                MATCH_STATUS_STYLES[match.status] ?? "bg-muted text-muted-foreground"
                              }`}
                            >
                              {MATCH_STATUS_LABELS[match.status] ?? match.status}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {[
                              prospect?.activity_category,
                              prospect?.net_revenue_band,
                              prospect?.city,
                              prospect?.domain || "Nincs domain megadva",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {prospect?.decision_maker_email ? (
                            <p className="flex flex-wrap items-center gap-2 text-xs text-foreground">
                              Döntéshozó: {prospect.decision_maker_name}
                              {prospect.decision_maker_position
                                ? ` — ${prospect.decision_maker_position}`
                                : ""}{" "}
                              ({prospect.decision_maker_email})
                              <span
                                className={`rounded-full px-2 py-0.5 font-medium ${
                                  CONFIDENCE_STYLES[
                                    prospect.decision_maker_match_confidence ?? "nincs_talalat"
                                  ]
                                }`}
                              >
                                {
                                  CONFIDENCE_LABELS[
                                    prospect.decision_maker_match_confidence ?? "nincs_talalat"
                                  ]
                                }
                              </span>
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Még nincs döntéshozó — jóváhagyáskor lefut a Hunter keresés.
                            </p>
                          )}
                          {match.match_reason && (
                            <p className="text-xs text-muted-foreground">{match.match_reason}</p>
                          )}
                        </div>
                        {match.status === "javasolt" && (
                          <div className="flex shrink-0 gap-2">
                            <Button
                              size="sm"
                              onClick={() => approve.mutate(match)}
                              disabled={approve.isPending}
                            >
                              {approve.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                              Jóváhagyás
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reject.mutate(match)}
                              disabled={reject.isPending}
                            >
                              Elvetés
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
