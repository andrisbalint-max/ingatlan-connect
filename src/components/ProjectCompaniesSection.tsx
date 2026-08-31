import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Loader2, Mail, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { hunterSearch } from "@/lib/hunter.functions";
import { matchProjectCompanies, generateProjectOutreach } from "@/lib/project-companies.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LinkRow {
  id: string;
  company_id: string;
  match_reason: string | null;
  source: string;
  status: string;
  companies: { id: string; name: string; domain: string | null } | null;
}

interface OtherLink {
  company_id: string;
  project_id: string;
  status: string;
  projects: { id: string; title: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  javasolt: "Javasolt",
  jovahagyva: "Jóváhagyva",
  elvetve: "Elvetve",
};

const STATUS_STYLES: Record<string, string> = {
  javasolt: "bg-amber-100 text-amber-700",
  jovahagyva: "bg-primary/10 text-primary",
  elvetve: "bg-muted text-muted-foreground",
};

export function ProjectCompaniesSection({
  projectId,
  organizationId,
}: {
  projectId: string;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const runMatch = useServerFn(matchProjectCompanies);
  const runOutreach = useServerFn(generateProjectOutreach);
  const runHunter = useServerFn(hunterSearch);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCompanyId, setManualCompanyId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [outreachFor, setOutreachFor] = useState<string | null>(null);

  const { data: links, isLoading } = useQuery({
    queryKey: ["project-companies", projectId],
    queryFn: async (): Promise<LinkRow[]> => {
      const { data, error } = await supabase
        .from("project_companies")
        .select("id, company_id, match_reason, source, status, companies(id, name, domain)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as LinkRow[];
    },
  });

  const { data: otherLinks } = useQuery({
    queryKey: ["project-companies-other", projectId],
    queryFn: async (): Promise<OtherLink[]> => {
      const { data, error } = await supabase
        .from("project_companies")
        .select("company_id, project_id, status, projects(id, title)")
        .neq("project_id", projectId)
        .neq("status", "elvetve");
      if (error) throw error;
      return data as unknown as OtherLink[];
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["companies-for-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const match = useMutation({
    mutationFn: () => runMatch({ data: { projectId } }),
    onSuccess: (result) => {
      if (result.status === "ok" && result.created > 0) {
        setNotice(null);
        toast.success(`${result.created} javasolt cég hozzáadva.`);
      } else {
        setNotice(result.message ?? "Az AI most nem talált új javaslatot.");
      }
      queryClient.invalidateQueries({ queryKey: ["project-companies", projectId] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  /** Approve → optionally auto-run Hunter for a company without contacts. */
  const approve = useMutation({
    mutationFn: async (link: LinkRow) => {
      const { error } = await supabase
        .from("project_companies")
        .update({ status: "jovahagyva" })
        .eq("id", link.id);
      if (error) throw error;

      const { count } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", link.company_id);

      if ((count ?? 0) > 0 || !link.companies?.domain) return { hunter: 0 };

      const result = await runHunter({ data: { companyId: link.company_id } });
      if (result.status !== "ok" || result.people.length === 0) return { hunter: 0 };

      const rows = result.people.slice(0, 5).map((person) => ({
        organization_id: organizationId,
        company_id: link.company_id,
        name: person.name,
        email: person.email,
        position: person.position,
      }));
      const { error: insertError } = await supabase.from("contacts").insert(rows);
      if (insertError) throw insertError;
      await supabase.from("companies").update({ hunter_searched: true }).eq("id", link.company_id);
      return { hunter: rows.length };
    },
    onSuccess: ({ hunter }) => {
      queryClient.invalidateQueries({ queryKey: ["project-companies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(
        hunter > 0 ? `Jóváhagyva — ${hunter} kontakt mentve Hunterrel.` : "Jóváhagyva.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reject = useMutation({
    mutationFn: async (link: LinkRow) => {
      const { error } = await supabase
        .from("project_companies")
        .update({ status: "elvetve" })
        .eq("id", link.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-companies", projectId] });
      toast.success("Elvetve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addManual = useMutation({
    mutationFn: async () => {
      if (!manualCompanyId) throw new Error("Válassz céget.");
      const { error } = await supabase.from("project_companies").insert({
        organization_id: organizationId,
        project_id: projectId,
        company_id: manualCompanyId,
        source: "manual",
        status: "jovahagyva",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-companies", projectId] });
      setManualOpen(false);
      setManualCompanyId("");
      toast.success("Cég hozzárendelve a projekthez.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const outreach = useMutation({
    mutationFn: async (link: LinkRow) => {
      setOutreachFor(link.id);
      return runOutreach({ data: { projectId, companyId: link.company_id } });
    },
    onSettled: () => setOutreachFor(null),
    onSuccess: (result) => {
      if (result.status === "ok") {
        toast.success("Email piszkozat az Email sorba került.");
      } else {
        toast.info(result.message ?? "Az email nem készült el.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const duplicateFor = (companyId: string) =>
    (otherLinks ?? []).find((row) => row.company_id === companyId)?.projects ?? null;

  const linkedIds = new Set((links ?? []).map((l) => l.company_id));
  const selectable = (companies ?? []).filter((c) => !linkedIds.has(c.id));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Célzott cégek</h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => match.mutate()} disabled={match.isPending}>
            {match.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" strokeWidth={1.5} />
            )}
            Cégek keresése AI-val
          </Button>
          <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
            <Plus className="mr-1 size-4" strokeWidth={1.5} />
            Cég hozzáadása kézzel
          </Button>
        </div>
      </div>

      {notice && (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Betöltés…
        </div>
      ) : !links || links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Még nincs célzott cég. Indíts AI-keresést, vagy adj hozzá céget kézzel.
        </p>
      ) : (
        <ul className="space-y-3">
          {links.map((link) => {
            const duplicate = duplicateFor(link.company_id);
            return (
              <li key={link.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {link.companies?.name ?? "Ismeretlen cég"}
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[link.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {STATUS_LABELS[link.status] ?? link.status}
                  </span>
                </div>

                {link.match_reason && (
                  <p className="mt-2 text-sm text-muted-foreground">{link.match_reason}</p>
                )}

                {duplicate && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    <AlertTriangle className="size-3" strokeWidth={1.5} />
                    Már szerepel a(z) {duplicate.title} projektben is
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {link.status === "javasolt" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => approve.mutate(link)}
                        disabled={approve.isPending}
                      >
                        <Check className="mr-1 size-4" strokeWidth={1.5} />
                        Jóváhagyás
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reject.mutate(link)}
                        disabled={reject.isPending}
                      >
                        <X className="mr-1 size-4" strokeWidth={1.5} />
                        Elvetés
                      </Button>
                    </>
                  )}
                  {link.status === "jovahagyva" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => outreach.mutate(link)}
                      disabled={outreach.isPending && outreachFor === link.id}
                    >
                      {outreach.isPending && outreachFor === link.id ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Mail className="mr-2 size-4" strokeWidth={1.5} />
                      )}
                      Email megírása
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cég hozzáadása kézzel</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Cég a CRM-ből</Label>
            <Select value={manualCompanyId} onValueChange={setManualCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Válassz céget" />
              </SelectTrigger>
              <SelectContent>
                {selectable.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nincs elérhető cég
                  </SelectItem>
                ) : (
                  selectable.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Mégse
            </Button>
            <Button onClick={() => addManual.mutate()} disabled={addManual.isPending}>
              {addManual.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Hozzáadás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
