import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { summarizeProjectFile } from "@/lib/project-files.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDescription(project?.description ?? "");
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

  const saveDescription = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("projects")
        .update({ description: description.trim() || null })
        .eq("id", project!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Leírás mentve.");
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
          } else {
            toast.info(result.message ?? "Az AI összefoglaló nem készült el.");
          }
        } catch (err) {
          toast.info(err instanceof Error ? err.message : "Az AI összefoglaló nem készült el.");
        }
        queryClient.invalidateQueries({ queryKey: ["project-files", project.id] });
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
              <section className="space-y-2">
                <Label htmlFor="project-description">Leírás</Label>
                <Textarea
                  id="project-description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Projekt részletei, műszaki paraméterek…"
                />
                <Button
                  size="sm"
                  onClick={() => saveDescription.mutate()}
                  disabled={saveDescription.isPending}
                >
                  {saveDescription.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Leírás mentése
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
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
