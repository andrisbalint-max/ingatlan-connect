import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, MapPin, Plus, Ruler } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader } from "@/components/AppShell";
import { ProjectDetailPanel, type ProjectRow } from "@/components/ProjectDetailPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/projektek")({
  head: () => ({
    meta: [
      { title: "Projektek — Ipari Ingatlan Platform" },
      { name: "description", content: "Ipari ingatlan projektek, méretek és dokumentumok egy helyen." },
      { property: "og:title", content: "Projektek — Ipari Ingatlan Platform" },
      { property: "og:description", content: "Ipari ingatlan projektek, méretek és dokumentumok egy helyen." },
    ],
  }),
  component: Projects,
});

const STATUS_OPTIONS = [
  { value: "aktiv", label: "Aktív" },
  { value: "eloketszites", label: "Előkészítés" },
  { value: "szunetel", label: "Szünetel" },
  { value: "lezarva", label: "Lezárva" },
];

const STATUS_STYLES: Record<string, string> = {
  aktiv: "bg-primary/10 text-primary",
  eloketszites: "bg-amber-100 text-amber-700",
  szunetel: "bg-muted text-muted-foreground",
  lezarva: "bg-rose-100 text-rose-700",
};

const emptyForm = {
  title: "",
  description: "",
  city: "",
  size_sqm: "",
  status: "aktiv",
  target_audience: "",
};

function Projects() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<ProjectRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, organization_id, title, description, city, size_sqm, status, target_audience, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProjectRow[];
    },
  });

  const createProject = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Nincs betöltve a profil.");
      if (!form.title.trim()) throw new Error("A projekt neve kötelező.");
      const size = form.size_sqm.trim() ? Number(form.size_sqm.replace(",", ".")) : null;
      const { error } = await supabase.from("projects").insert({
        organization_id: profile.organization_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        city: form.city.trim() || null,
        size_sqm: size !== null && Number.isFinite(size) ? size : null,
        status: form.status,
        target_audience: form.target_audience.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setForm(emptyForm);
      setDialogOpen(false);
      toast.success("Projekt létrehozva.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openProject = (project: ProjectRow) => {
    setSelected(project);
    setPanelOpen(true);
  };

  // Keep the open panel in sync with refreshed list data
  const activeProject = selected ? projects?.find((p) => p.id === selected.id) ?? selected : null;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Projektek" description="Ipari ingatlan projektek és dokumentumaik." />
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" strokeWidth={1.5} />
          Új projekt
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="card-surface px-6 py-16 text-center">
          <Building2 className="mx-auto mb-3 size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Még nincs projekt. Hozd létre az elsőt!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => openProject(project)}
              className="card-surface p-5 text-left transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">{project.title}</h2>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[project.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {STATUS_OPTIONS.find((s) => s.value === project.status)?.label ?? project.status}
                </span>
              </div>
              {project.description && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4" strokeWidth={1.5} />
                  {project.city ?? "—"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Ruler className="size-4" strokeWidth={1.5} />
                  {project.size_sqm ? `${project.size_sqm.toLocaleString("hu-HU")} m²` : "—"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Új projekt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Projekt neve *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Pl. Logisztikai csarnok — Páty"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Leírás</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">Város</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="size">Méret (m²)</Label>
                <Input
                  id="size"
                  inputMode="decimal"
                  value={form.size_sqm}
                  onChange={(e) => setForm({ ...form, size_sqm: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audience">Célközönség / tevékenységi kör (opcionális)</Label>
              <Textarea
                id="audience"
                rows={2}
                value={form.target_audience}
                onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                placeholder="Pl. logisztikai szolgáltatók, könnyűipari gyártók…"
              />
            </div>
            <div className="space-y-2">
              <Label>Státusz</Label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Mégse
            </Button>
            <Button onClick={() => createProject.mutate()} disabled={createProject.isPending}>
              {createProject.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Létrehozás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectDetailPanel project={activeProject} open={panelOpen} onOpenChange={setPanelOpen} />
    </div>
  );
}
