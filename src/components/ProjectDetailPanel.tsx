import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  summarizeProjectFile,
  suggestProjectFieldsFromFile,
} from "@/lib/project-files.functions";
import { ProjectCompaniesSection } from "@/components/ProjectCompaniesSection";
import { ProjectOptenMatchesSection } from "@/components/ProjectOptenMatchesSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface ProjectRow {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  city: string | null;
  size_sqm: number | null;
  status: string;
  target_audience: string | null;
  created_at: string;
}

interface FileRow {
  id: string;
  filename: string;
  storage_path: string | null;
  ai_summary: string | null;
  uploaded_at: string;
}

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

const STATUS_OPTIONS = [
  { value: "aktiv", label: "Aktív" },
  { value: "eloketszites", label: "Előkészítés" },
  { value: "szunetel", label: "Szünetel" },
  { value: "lezarva", label: "Lezárva" },
];

export function ProjectDetailPanel({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const summarize = useServerFn(summarizeProjectFile);
  const suggest = useServerFn(suggestProjectFieldsFromFile);
  const inputRef = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [city, setCity] = useState("");
  const [sizeSqm, setSizeSqm] = useState("");
  const [status, setStatus] = useState("aktiv");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // AI suggestions from an uploaded PDF — never applied automatically.
  const [suggestion, setSuggestion] = useState<{
    description?: string;
    targetAudience?: string;
  } | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  useEffect(() => {
    setDescription(project?.description ?? "");
    setTargetAudience(project?.target_audience ?? "");
    setCity(project?.city ?? "");
    setSizeSqm(project?.size_sqm != null ? String(project.size_sqm) : "");
    setStatus(project?.status ?? "aktiv");
    setSuggestion(null);
    setAiNotice(null);
  }, [project?.id]);

  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: ["project-files", project?.id],
    enabled: Boolean(project?.id),
    queryFn: async (): Promise<FileRow[]> => {
      const { data, error } = await supabase
        .from("project_files")
        .select("id, filename, storage_path, ai_summary, uploaded_at")
        .eq("project_id", project!.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as FileRow[];
    },
  });

  const saveBasics = useMutation({
    mutationFn: async () => {
      const size = sizeSqm.trim() ? Number(sizeSqm.replace(",", ".")) : null;
      const { error } = await supabase
        .from("projects")
        .update({
          description: description.trim() || null,
          target_audience: targetAudience.trim() || null,
          city: city.trim() || null,
          size_sqm: size !== null && Number.isFinite(size) ? size : null,
          status,
        })
        .eq("id", project!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Alapadatok mentve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteFile = useMutation({
    mutationFn: async (file: FileRow) => {
      if (file.storage_path) {
        await supabase.storage.from("project-files").remove([file.storage_path]);
      }
      const { error } = await supabase.from("project_files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-files", project?.id] });
      toast.success("Fájl törölve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0 || !project) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${project.organization_id}/${project.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("project-files")
          .upload(path, file, file.type ? { contentType: file.type } : undefined);
        if (uploadError) {
          toast.error(`${file.name}: ${uploadError.message}`);
          continue;
        }

        const { data: inserted, error: insertError } = await supabase
          .from("project_files")
          .insert({
            organization_id: project.organization_id,
            project_id: project.id,
            filename: file.name,
            storage_path: path,
          })
          .select("id")
          .single();
        if (insertError) {
          toast.error(`${file.name}: ${insertError.message}`);
          continue;
        }

        queryClient.invalidateQueries({ queryKey: ["project-files", project.id] });

        try {
          const result = await summarize({ data: { fileId: inserted.id } });
          if (result.status === "ok") {
            toast.success(`${file.name} feltöltve és összegezve.`);
          } else if (result.status === "no_provider") {
            setAiNotice("AI-szolgáltató nincs beállítva");
          } else if (result.status === "out_of_credit") {
            setAiNotice("Elfogyott az AI-kredit, próbáld később");
          } else {
            toast.info(result.message ?? "Az AI összefoglaló nem készült el.");
          }
        } catch (err) {
          toast.info(err instanceof Error ? err.message : "Az AI összefoglaló nem készült el.");
        }
        queryClient.invalidateQueries({ queryKey: ["project-files", project.id] });

        // PDF-only: suggest description / target audience for empty fields
        if (file.name.toLowerCase().endsWith(".pdf")) {
          try {
            const result = await suggest({ data: { fileId: inserted.id } });
            if (result.status === "ok") {
              const next: { description?: string; targetAudience?: string } = {};
              if (!description.trim() && result.description) next.description = result.description;
              if (!targetAudience.trim() && result.targetAudience) {
                next.targetAudience = result.targetAudience;
              }
              if (next.description || next.targetAudience) setSuggestion(next);
            } else if (result.status === "no_provider") {
              setAiNotice("AI-szolgáltató nincs beállítva");
            } else if (result.status === "out_of_credit") {
              setAiNotice("Elfogyott az AI-kredit, próbáld később");
            }
          } catch {
            // suggestions are best-effort only
          }
        }
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function download(file: FileRow) {
    if (!file.storage_path) return;
    const { data, error } = await supabase.storage
      .from("project-files")
      .createSignedUrl(file.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "A letöltési link létrehozása nem sikerült.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {project && (
          <>
            <SheetHeader>
              <SheetTitle>{project.title}</SheetTitle>
              <SheetDescription>
                {[project.city, project.size_sqm ? `${project.size_sqm.toLocaleString("hu-HU")} m²` : null]
                  .filter(Boolean)
                  .join(" · ") || "Nincs megadva helyszín"}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {aiNotice && (
                <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                  {aiNotice}
                </p>
              )}

              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Alapadatok</h3>

                {suggestion && (
                  <div className="space-y-3 rounded-xl border border-primary/30 bg-accent p-4">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Sparkles className="size-3.5" strokeWidth={1.5} /> AI javaslat a feltöltött PDF
                      alapján — szerkeszthető, csak elfogadás után kerül a mezőkbe.
                    </p>
                    {suggestion.description && (
                      <div className="space-y-1">
                        <Label className="text-xs">Javasolt leírás</Label>
                        <Textarea
                          rows={3}
                          value={suggestion.description}
                          onChange={(e) =>
                            setSuggestion((prev) => ({ ...prev, description: e.target.value }))
                          }
                        />
                      </div>
                    )}
                    {suggestion.targetAudience && (
                      <div className="space-y-1">
                        <Label className="text-xs">Javasolt célközönség</Label>
                        <Textarea
                          rows={2}
                          value={suggestion.targetAudience}
                          onChange={(e) =>
                            setSuggestion((prev) => ({ ...prev, targetAudience: e.target.value }))
                          }
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (suggestion.description && !description.trim()) {
                            setDescription(suggestion.description);
                          }
                          if (suggestion.targetAudience && !targetAudience.trim()) {
                            setTargetAudience(suggestion.targetAudience);
                          }
                          setSuggestion(null);
                        }}
                      >
                        Javaslat átvétele
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSuggestion(null)}>
                        Elvetés
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="project-description">Leírás</Label>
                  <Textarea
                    id="project-description"
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Projekt részletei, műszaki paraméterek…"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-audience">Célközönség / tevékenységi kör</Label>
                  <Textarea
                    id="project-audience"
                    rows={3}
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Pl. logisztikai szolgáltatók, könnyűipari gyártók, 50+ fős cégek…"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="project-city">Város</Label>
                    <Input
                      id="project-city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="project-size">Méret (m²)</Label>
                    <Input
                      id="project-size"
                      inputMode="decimal"
                      value={sizeSqm}
                      onChange={(e) => setSizeSqm(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Státusz</Label>
                  <Select value={status} onValueChange={setStatus}>
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

                <Button size="sm" onClick={() => saveBasics.mutate()} disabled={saveBasics.isPending}>
                  {saveBasics.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Alapadatok mentése
                </Button>
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Dokumentumok</h3>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void handleFiles(e.dataTransfer.files);
                  }}
                  className={`rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
                    dragging ? "border-primary bg-accent" : "border-border"
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="mx-auto mb-2 size-5 animate-spin text-primary" />
                  ) : (
                    <Upload className="mx-auto mb-2 size-5 text-muted-foreground" strokeWidth={1.5} />
                  )}
                  <p className="text-sm text-muted-foreground">
                    Húzd ide a PDF vagy kép fájlokat, vagy válaszd ki őket.
                  </p>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPT}
                    className="hidden"
                    onChange={(e) => void handleFiles(e.target.files)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                  >
                    Fájl kiválasztása
                  </Button>
                </div>

                {filesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Betöltés…
                  </div>
                ) : !files || files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Még nincs feltöltött dokumentum.</p>
                ) : (
                  <ul className="space-y-3">
                    {files.map((file) => (
                      <li key={file.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        {file.ai_summary && (
                          <div className="mb-3 rounded-lg bg-accent p-3">
                            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                              <Sparkles className="size-3.5" strokeWidth={1.5} /> AI összefoglaló
                            </p>
                            <p className="text-sm text-foreground">{file.ai_summary}</p>
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                              <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                              {file.filename}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {new Date(file.uploaded_at).toLocaleString("hu-HU")}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="icon" onClick={() => void download(file)}>
                              <Download className="size-4" strokeWidth={1.5} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteFile.mutate(file)}
                              disabled={deleteFile.isPending}
                            >
                              <Trash2 className="size-4 text-destructive" strokeWidth={1.5} />
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Separator />

              <ProjectCompaniesSection
                projectId={project.id}
                organizationId={project.organization_id}
              />

              <Separator />

              <ProjectOptenMatchesSection projectId={project.id} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
