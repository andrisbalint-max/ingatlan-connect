import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  FileDown,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { runMarketMonitorNow } from "@/lib/market-monitor.functions";
import { PageHeader } from "@/components/AppShell";
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

export const Route = createFileRoute("/_authenticated/riportok")({
  head: () => ({
    meta: [
      { title: "Riportok — Ipari Ingatlan Platform" },
      {
        name: "description",
        content: "Piaci riportok, éves idővonal, mutatók grafikonon és napi összefoglalók.",
      },
      { property: "og:title", content: "Riportok — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content: "Piaci riportok, éves idővonal, mutatók grafikonon és napi összefoglalók.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

interface ReportRow {
  id: string;
  organization_id: string;
  report_date: string | null;
  source_name: string | null;
  title: string;
  summary: string | null;
  key_data: Record<string, unknown> | null;
  year: number | null;
  pdf_path: string | null;
  source_url: string | null;
  created_at: string;
}

interface DigestRow {
  id: string;
  date: string;
  content_markdown: string | null;
  created_at: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Very small markdown renderer: headings, bold, links, list items. */
function renderMarkdown(text: string) {
  return text.split("\n").map((line, index) => {
    const key = `${index}-${line.slice(0, 8)}`;
    if (line.startsWith("## ")) {
      return (
        <p key={key} className="mt-3 text-sm font-semibold text-foreground">
          {line.slice(3)}
        </p>
      );
    }
    if (!line.trim()) return <div key={key} className="h-2" />;
    const clean = line.replace(/^[-*]\s*/, "");
    const parts = clean.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <p key={key} className="text-sm text-muted-foreground">
        {line.trimStart().startsWith("-") ? "• " : ""}
        {parts.map((part, i) => {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
          if (link) {
            return (
              <a
                key={i}
                href={link[2]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                {link[1]}
              </a>
            );
          }
          const bold = /^\*\*([^*]+)\*\*$/.exec(part);
          if (bold) {
            return (
              <strong key={i} className="font-medium text-foreground">
                {bold[1]}
              </strong>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    );
  });
}

function ReportsPage() {
  const { data: profile } = useProfile();
  const isAdmin = profile?.role === "admin";

  const { data: reports, isLoading } = useQuery({
    queryKey: ["market-reports"],
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from("market_reports")
        .select("*")
        .order("report_date", { ascending: false });
      if (error) throw error;
      return data as unknown as ReportRow[];
    },
  });

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Riportok"
          description="Piaci jelentések, éves trendek és napi összefoglalók."
        />
        <div className="flex gap-2">
          {isAdmin && <MarketMonitorButton />}
          <UploadReportDialog />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <TimelineSection reports={reports ?? []} />
          <ChartSection reports={reports ?? []} />
          <DigestSection />
        </div>
      )}
    </div>
  );
}

function MarketMonitorButton() {
  const queryClient = useQueryClient();
  const run = useServerFn(runMarketMonitorNow);

  const mutation = useMutation({
    mutationFn: () => run({}),
    onSuccess: (result) => {
      if (result.status === "no_provider") {
        toast.info("AI-szolgáltató nincs beállítva");
      } else if (result.status === "out_of_credit") {
        toast.info("Elfogyott az AI-kredit, próbáld később");
      } else if (result.status === "error") {
        toast.error(result.message ?? "A frissítés nem sikerült.");
      } else {
        toast.success(
          result.newItems > 0
            ? `${result.newItems} új piaci hír mentve.`
            : "Nincs új piaci hír ma.",
        );
      }
      queryClient.invalidateQueries({ queryKey: ["market-reports"] });
      queryClient.invalidateQueries({ queryKey: ["daily-digests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Button variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      {mutation.isPending ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 size-4" strokeWidth={1.5} />
      )}
      Frissítés most
    </Button>
  );
}

function UploadReportDialog() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [summary, setSummary] = useState("");
  const [rows, setRows] = useState<Array<{ key: string; value: string }>>([{ key: "", value: "" }]);
  const [file, setFile] = useState<File | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Nincs betöltve a profil.");
      if (!title.trim()) throw new Error("A riport címe kötelező.");

      let pdfPath: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${profile.organization_id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("market-reports")
          .upload(path, file, { contentType: file.type || "application/pdf" });
        if (uploadError) throw uploadError;
        pdfPath = path;
      }

      const keyData: Record<string, number | string> = {};
      for (const row of rows) {
        if (!row.key.trim()) continue;
        const numeric = toNumber(row.value);
        keyData[row.key.trim()] = numeric ?? row.value.trim();
      }

      const { error } = await supabase.from("market_reports").insert({
        organization_id: profile.organization_id,
        title: title.trim(),
        source_name: sourceName.trim() || null,
        summary: summary.trim() || null,
        year: Number(year),
        report_date: new Date().toISOString().slice(0, 10),
        key_data: keyData,
        pdf_path: pdfPath,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-reports"] });
      setOpen(false);
      setTitle("");
      setSourceName("");
      setSummary("");
      setRows([{ key: "", value: "" }]);
      setFile(null);
      toast.success("Riport feltöltve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Upload className="mr-2 size-4" strokeWidth={1.5} />
        Új riport feltöltése
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Új riport feltöltése</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-title">Cím *</Label>
              <Input id="report-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="report-source">Forrás</Label>
                <Input
                  id="report-source"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="Pl. CBRE"
                />
              </div>
              <div className="space-y-2">
                <Label>Év</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-summary">Összefoglaló</Label>
              <Textarea
                id="report-summary"
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-pdf">PDF</Label>
              <Input
                id="report-pdf"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Mutatók (key_data)</Label>
              {rows.map((row, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="mutató neve"
                    value={row.key}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)),
                      )
                    }
                  />
                  <Input
                    placeholder="érték"
                    value={row.value}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Sor törlése"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => [...prev, { key: "", value: "" }])}
              >
                <Plus className="mr-1 size-4" strokeWidth={1.5} />
                Új mutató
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Mégse
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Mentés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function downloadReportPdf(path: string) {
  const { data, error } = await supabase.storage.from("market-reports").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    toast.error(error?.message ?? "A letöltési link létrehozása nem sikerült.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

function TimelineSection({ reports }: { reports: ReportRow[] }) {
  const [openYear, setOpenYear] = useState<number | null>(CURRENT_YEAR);

  const byYear = useMemo(() => {
    const map = new Map<number, ReportRow[]>();
    for (const year of YEARS) map.set(year, []);
    for (const report of reports) {
      const year = report.year ?? (report.report_date ? Number(report.report_date.slice(0, 4)) : null);
      if (year && map.has(year)) map.get(year)!.push(report);
    }
    return map;
  }, [reports]);

  return (
    <section className="card-surface p-6">
      <h2 className="text-base font-semibold text-foreground">Idővonal (utolsó 5 év)</h2>
      <ul className="mt-4 space-y-2">
        {YEARS.map((year) => {
          const items = byYear.get(year) ?? [];
          const isOpen = openYear === year;
          return (
            <li key={year} className="rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setOpenYear(isOpen ? null : year)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {isOpen ? (
                    <ChevronDown className="size-4 text-primary" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.5} />
                  )}
                  {year}
                </span>
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">
                  {items.length} riport
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-border px-4 py-3">
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Ebben az évben még nincs riport.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {items.map((report) => (
                        <li key={report.id} className="rounded-lg bg-secondary/40 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">{report.title}</p>
                            <span className="text-xs text-muted-foreground">
                              {report.source_name ?? "—"}
                              {report.report_date ? ` · ${report.report_date}` : ""}
                            </span>
                          </div>
                          {report.summary && (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                              {report.summary}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {report.pdf_path && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void downloadReportPdf(report.pdf_path!)}
                              >
                                <Download className="mr-1 size-4" strokeWidth={1.5} />
                                PDF letöltése
                              </Button>
                            )}
                            {report.source_url && (
                              <a
                                href={report.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary underline"
                              >
                                Eredeti forrás
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ChartSection({ reports }: { reports: ReportRow[] }) {
  const metrics = useMemo(() => {
    const set = new Set<string>();
    for (const report of reports) {
      for (const [key, value] of Object.entries(report.key_data ?? {})) {
        if (toNumber(value) !== null) set.add(key);
      }
    }
    return [...set];
  }, [reports]);

  const [metric, setMetric] = useState<string>("");
  const active = metric || metrics[0] || "";

  const data = useMemo(() => {
    return [...YEARS].reverse().map((year) => {
      const values = reports
        .filter((r) => (r.year ?? Number(r.report_date?.slice(0, 4))) === year)
        .map((r) => toNumber((r.key_data ?? {})[active]))
        .filter((v): v is number => v !== null);
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return { year: String(year), value: Number(avg.toFixed(2)) };
    });
  }, [reports, active]);

  return (
    <section className="card-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Mutató alakulása</h2>
        {metrics.length > 0 && (
          <Select value={active} onValueChange={setMetric}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Válassz mutatót" />
            </SelectTrigger>
            <SelectContent>
              {metrics.map((key) => (
                <SelectItem key={key} value={key}>
                  {key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {metrics.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Még nincs számszerű mutató a riportokban — adj meg key_data értékeket a feltöltésnél.
        </p>
      ) : (
        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" name={active} fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function DigestSection() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState("");

  const { data: digests, isLoading } = useQuery({
    queryKey: ["daily-digests"],
    queryFn: async (): Promise<DigestRow[]> => {
      const { data, error } = await supabase
        .from("daily_digests")
        .select("id, date, content_markdown, created_at")
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data as DigestRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Nincs betöltve a profil.");
      if (!content.trim()) throw new Error("A bejegyzés tartalma kötelező.");
      const { error } = await supabase.from("daily_digests").insert({
        organization_id: profile.organization_id,
        date,
        content_markdown: content.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-digests"] });
      setOpen(false);
      setContent("");
      toast.success("Bejegyzés mentve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function exportPdf(digest: DigestRow) {
    const { default: JsPDF } = await import("jspdf");
    const doc = new JsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    doc.setFontSize(16);
    doc.text("Napi összefoglaló", margin, margin);
    doc.setFontSize(11);
    doc.text(new Date(digest.date).toLocaleDateString("hu-HU"), margin, margin + 20);
    doc.setFontSize(11);
    const body = (digest.content_markdown ?? "").replace(/[*#]/g, "");
    const lines = doc.splitTextToSize(body, 595 - margin * 2);
    doc.text(lines, margin, margin + 50);
    doc.save(`napi-osszefoglalo-${digest.date}.pdf`);
  }

  return (
    <section className="card-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Napi összefoglaló</h2>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-4" strokeWidth={1.5} />
          Új bejegyzés
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : !digests || digests.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Még nincs napi összefoglaló. Vedd fel az elsőt kézzel — a napi automatizmus később ide
          fogja írni a bejegyzéseket.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {digests.map((digest) => {
            const isAuto = (digest.content_markdown ?? "").includes("## Piaci hírek");
            return (
              <li key={digest.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {isAuto ? (
                      <Bot className="size-4 text-primary" strokeWidth={1.5} />
                    ) : (
                      <CalendarDays className="size-4 text-muted-foreground" strokeWidth={1.5} />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {new Date(digest.date).toLocaleDateString("hu-HU")}
                    </span>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {isAuto ? "Automatikus" : "Kézi"}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void exportPdf(digest)}>
                    <FileDown className="mr-1 size-4" strokeWidth={1.5} />
                    Letöltés PDF-ként
                  </Button>
                </div>
                <div className="mt-2">{renderMarkdown(digest.content_markdown ?? "—")}</div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Új napi bejegyzés</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="digest-date">Dátum</Label>
              <Input
                id="digest-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="digest-content">Tartalom</Label>
              <Textarea
                id="digest-content"
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Rövid napi összefoglaló…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Mégse
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Mentés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
