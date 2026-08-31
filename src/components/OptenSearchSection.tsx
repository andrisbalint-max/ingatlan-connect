import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  getOptenConfig,
  runOptenSearch,
  suggestOptenCriteria,
  type RevenueBand,
  type TeaorSuggestion,
} from "@/lib/opten.functions";
import {
  HUNTER_STATUS_LABELS,
  HUNTER_STATUS_STYLES,
  promoteProspectToCrm,
  type ProspectRow,
} from "@/lib/opten-promote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SavedCriteria {
  teaor_suggestions?: TeaorSuggestion[];
  revenue_band_label?: string;
}

interface EditableTeaor extends TeaorSuggestion {
  keep: boolean;
}

export function OptenSearchSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const suggest = useServerFn(suggestOptenCriteria);
  const search = useServerFn(runOptenSearch);
  const [notice, setNotice] = useState<string | null>(null);
  const [teaors, setTeaors] = useState<EditableTeaor[] | null>(null);
  const [bandLabel, setBandLabel] = useState("");

  const { data: config } = useQuery({
    queryKey: ["opten-config"],
    queryFn: () => getOptenConfig(),
  });

  const { data: project } = useQuery({
    queryKey: ["project-opten-criteria", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, opten_search_criteria")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: prospects, isLoading: prospectsLoading } = useQuery({
    queryKey: ["opten-prospects", projectId],
    queryFn: async (): Promise<ProspectRow[]> => {
      const { data, error } = await supabase
        .from("opten_prospects")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ProspectRow[];
    },
  });

  const saved = (project?.opten_search_criteria ?? null) as SavedCriteria | null;
  const bands: RevenueBand[] = config?.bands ?? [];

  useEffect(() => {
    setTeaors(null);
    setNotice(null);
  }, [projectId]);

  const askAi = useMutation({
    mutationFn: () => suggest({ data: { projectId } }),
    onSuccess: (result) => {
      if (result.status === "ok") {
        setNotice(null);
        setTeaors(
          (result.teaorSuggestions ?? []).map((row) => ({ ...row, keep: true })),
        );
        setBandLabel(result.revenueBandLabel ?? saved?.revenue_band_label ?? "");
        if ((result.teaorSuggestions ?? []).length === 0) {
          setNotice("Az AI nem adott TEÁOR javaslatot — add meg kézzel.");
        }
      } else {
        setNotice(result.message ?? "A javaslat nem készült el.");
      }
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const saveCriteria = useMutation({
    mutationFn: async () => {
      const kept = (teaors ?? [])
        .filter((row) => row.keep && (row.code.trim() || row.description.trim()))
        .map((row) => ({ code: row.code.trim(), description: row.description.trim() }));
      if (kept.length === 0) throw new Error("Legalább egy TEÁOR sor szükséges.");
      if (!bandLabel) throw new Error("Válassz árbevétel-sávot.");
      const { error } = await supabase
        .from("projects")
        .update({
          opten_search_criteria: {
            teaor_suggestions: kept,
            revenue_band_label: bandLabel,
          } as never,
        })
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-opten-criteria", projectId] });
      setTeaors(null);
      toast.success("Keresési kritériumok mentve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runSearch = useMutation({
    mutationFn: () => search({ data: { projectId } }),
    onSuccess: (result) => {
      if (result.status === "ok") {
        setNotice(null);
        queryClient.invalidateQueries({ queryKey: ["opten-prospects", projectId] });
        toast.success(
          result.created && result.created > 0
            ? `${result.created} új cég importálva.`
            : "Nem érkezett új cég.",
        );
      } else {
        setNotice(result.message ?? "A keresés nem futott le.");
      }
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const promote = useMutation({
    mutationFn: (prospect: ProspectRow) => promoteProspectToCrm(prospect),
    onSuccess: ({ savedContacts }) => {
      queryClient.invalidateQueries({ queryKey: ["opten-prospects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-companies", projectId] });
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Opten keresés</h3>
        <Button size="sm" onClick={() => askAi.mutate()} disabled={askAi.isPending}>
          {askAi.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" strokeWidth={1.5} />
          )}
          Keresési javaslat kérése
        </Button>
      </div>

      {notice && (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {bands.length === 0 && (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          Még nincs beállítva árbevétel-sáv — add meg őket a Beállítások → Opten kapcsolat
          szakaszban.
        </p>
      )}

      {teaors && (
        <div className="space-y-4 rounded-xl border border-primary/30 bg-accent p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" strokeWidth={1.5} /> AI javaslat — szerkeszthető, csak
            mentés után kerül a projektre.
          </p>

          <div className="space-y-3">
            {teaors.map((row, index) => (
              <div key={index} className="flex items-start gap-2">
                <Checkbox
                  checked={row.keep}
                  aria-label="Javaslat megtartása"
                  onCheckedChange={(checked) =>
                    setTeaors((prev) =>
                      (prev ?? []).map((item, i) =>
                        i === index ? { ...item, keep: checked === true } : item,
                      ),
                    )
                  }
                  className="mt-2.5"
                />
                <div className="grid flex-1 gap-2 sm:grid-cols-[7rem_1fr]">
                  <Input
                    value={row.code}
                    placeholder="TEÁOR"
                    onChange={(e) =>
                      setTeaors((prev) =>
                        (prev ?? []).map((item, i) =>
                          i === index ? { ...item, code: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    value={row.description}
                    placeholder="Tevékenység leírása"
                    onChange={(e) =>
                      setTeaors((prev) =>
                        (prev ?? []).map((item, i) =>
                          i === index ? { ...item, description: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  aria-label="Sor törlése"
                  onClick={() => setTeaors((prev) => (prev ?? []).filter((_, i) => i !== index))}
                  className="mt-2 rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setTeaors((prev) => [...(prev ?? []), { code: "", description: "", keep: true }])
              }
            >
              <Plus className="mr-1 size-4" strokeWidth={1.5} />
              TEÁOR sor hozzáadása
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Árbevétel-sáv</Label>
            <Select value={bandLabel} onValueChange={setBandLabel}>
              <SelectTrigger>
                <SelectValue placeholder="Válassz sávot" />
              </SelectTrigger>
              <SelectContent>
                {bands.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nincs beállított sáv
                  </SelectItem>
                ) : (
                  bands.map((band) => (
                    <SelectItem key={band.label} value={band.label}>
                      {band.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveCriteria.mutate()} disabled={saveCriteria.isPending}>
              {saveCriteria.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Kritériumok mentése
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTeaors(null)}>
              Mégse
            </Button>
          </div>
        </div>
      )}

      {saved && !teaors && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {(saved.teaor_suggestions ?? []).map((row, index) => (
              <span
                key={index}
                className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-foreground"
              >
                {[row.code, row.description].filter(Boolean).join(" — ")}
              </span>
            ))}
            {saved.revenue_band_label && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {saved.revenue_band_label}
              </span>
            )}
          </div>
          <Button size="sm" onClick={() => runSearch.mutate()} disabled={runSearch.isPending}>
            {runSearch.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Search className="mr-2 size-4" strokeWidth={1.5} />
            )}
            Keresés indítása az Optenen
          </Button>
        </div>
      )}

      {!saved && !teaors && (
        <p className="text-sm text-muted-foreground">
          Még nincs mentett keresési kritérium. Kérj AI-javaslatot, szerkeszd, majd mentsd el.
        </p>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Talált cégek (Opten)</h4>
        {prospectsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Betöltés…
          </div>
        ) : !prospects || prospects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <Building2 className="mx-auto mb-2 size-5 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              Még nincs Optenből importált cég ehhez a projekthez.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {prospects.map((prospect) => (
              <li key={prospect.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{prospect.company_name}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      HUNTER_STATUS_STYLES[prospect.hunter_status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {HUNTER_STATUS_LABELS[prospect.hunter_status] ?? prospect.hunter_status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    prospect.teaor_description,
                    prospect.net_revenue_band,
                    prospect.city,
                    prospect.domain || "Nincs domain megadva",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-3">
                  {prospect.promoted_to_crm ? (
                    <span className="text-xs font-medium text-primary">Már a CRM-ben</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => promote.mutate(prospect)}
                      disabled={promote.isPending}
                    >
                      {promote.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Hozzáadás a CRM-hez
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
