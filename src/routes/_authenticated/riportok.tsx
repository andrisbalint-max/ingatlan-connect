import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Newspaper,
  Plus,
  Printer,
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
import { runWeeklyReportNow } from "@/lib/weekly-report.functions";
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
        content: "Napi és heti piaci riportok naptár nézetben, nyomtatható formában.",
      },
      { property: "og:title", content: "Riportok — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content: "Napi és heti piaci riportok naptár nézetben, nyomtatható formában.",
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
  report_type: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

interface DigestRow {
  id: string;
  date: string;
  content_markdown: string | null;
  created_at: string;
}

const CURRENT_YEAR = new Date().getFullYear();
/** A platform 2026-ban indult — korábbi évekre nincs adat, ezért nem is mutatjuk. */
const FIRST_YEAR = 2026;
const YEARS = Array.from(
  { length: Math.max(1, CURRENT_YEAR - FIRST_YEAR + 1) },
  (_, i) => CURRENT_YEAR - i,
);

const MONTH_NAMES = [
  "január",
  "február",
  "március",
  "április",
  "május",
  "június",
  "július",
  "augusztus",
  "szeptember",
  "október",
  "november",
  "december",
];
const WEEKDAY_LABELS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

const REPORT_TYPE_META: Record
  string,
  { label: string; icon: typeof Bot; chipClass: string }
> = {
  napi_osszefoglalo: {
    label: "Napi összegzés",
    icon: Bot,
    chipClass: "bg-primary/10 text-primary",
  },
  heti_osszefoglalo: {
    label: "Heti riport",
    icon: Newspaper,
    chipClass: "bg-accent text-accent-foreground",
  },
  napi_piaci_hir: {
    label: "Piaci hír",
    icon: FileText,
    chipClass: "bg-secondary text-muted-foreground",
  },
  kezi: {
    label: "Kézi riport",
    icon: Upload,
    chipClass: "bg-secondary text-muted-foreground",
  },
};

function metaFor(report: ReportRow) {
  return REPORT_TYPE_META[report.report_type ?? "kezi"] ?? REPORT_TYPE_META["kezi"]!;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
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
      <p key={key} className="text-sm leading-relaxed text-muted-foreground">
        {line.trimStart().startsWith("-") ? "• " : ""}
        {parts.map((part, i) => {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
          if (link) {
            return (
              
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

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Markdown -> nyomtatásra szánt HTML (a fenti renderMarkdown párja). */
function markdownToPrintHtml(markdown: string) {
  const inline = (line: string) =>
    escapeHtml(line)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2">$1</a>',
      )
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  const blocks: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      listItems = [];
    }
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      blocks.push(`<h2>${inline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      blocks.push(`<h2>${inline(line.slice(2))}</h2>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      listItems.push(inline(line.replace(/^[-*]\s+/, "")));
      continue;
    }
    flushList();
    blocks.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  return blocks.join("\n");
}

/**
 * Nyomtatás / PDF-mentés a böngésző saját nyomtatási párbeszédén keresztül.
 *
 * Szándékosan NEM jsPDF-fel készül: a jsPDF beépített betűtípusai
 * WinAnsi/cp1252 kódolásúak, amiben nincs benne az "ő" és az "ű", ezért a
 * magyar szöveg hibásan jelenik meg bennük. A böngésző nyomtatása a rendszer
 * betűtípusait használja, így minden magyar karakter helyes, a szöveg pedig
 * kijelölhető és kereshető marad a PDF-ben. A felhasználó a nyomtatási
 * párbeszéden a "Mentés PDF-ként" célt választva kap PDF-et.
 */
function printDocument(options: { title: string; subtitle: string; markdown: string }) {
  const win = window.open("", "_blank", "width=920,height=1000");
  if (!win) {
    toast.error(
      "A böngésző blokkolta a nyomtatási ablakot — engedélyezd a felugró ablakokat ehhez az oldalhoz.",
    );
    return;
  }

  const generated = new Date().toLocaleString("hu-HU");
  const html = `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    font-size: 11.5pt;
    line-height: 1.55;
    color: #14171a;
    -webkit-font-smoothing: antialiased;
  }
  h1 { font-size: 18pt; line-height: 1.25; margin: 0 0 6pt; }
  .subtitle { margin: 0 0 6pt; color: #5b6672; font-size: 10pt; }
  .rule { height: 2px; background: #00a8b5; margin: 10pt 0 16pt; }
  h2 { font-size: 12.5pt; margin: 16pt 0 6pt; color: #007c86; page-break-after: avoid; }
  p { margin: 0 0 9pt; }
  ul { margin: 0 0 9pt; padding-left: 16pt; }
  li { margin: 0 0 5pt; }
  a { color: #007c86; }
  footer {
    margin-top: 22pt;
    padding-top: 8pt;
    border-top: 1px solid #dfe4e8;
    color: #7a8794;
    font-size: 8.5pt;
  }
  @media print { .no-print { display: none !important; } }
  .no-print {
    margin-bottom: 16pt;
    padding: 8pt 10pt;
    background: #f1f5f6;
    border-radius: 6pt;
    color: #5b6672;
    font-size: 9.5pt;
  }
</style>
</head>
<body onload="window.print()">
  <div class="no-print">
    A nyomtatási párbeszédben a cél mezőben válaszd a „Mentés PDF-ként” lehetőséget.
  </div>
  <h1>${escapeHtml(options.title)}</h1>
  <p class="subtitle">${escapeHtml(options.subtitle)}</p>
  <div class="rule"></div>
  ${markdownToPrintHtml(options.markdown)}
  <footer>Ipari Ingatlan Platform — generálva: ${escapeHtml(generated)}</footer>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}

function reportSubtitle(report: ReportRow) {
  const period =
    report.period_start && report.period_end && report.period_start !== report.period_end
      ? `${report.period_start} – ${report.period_end}`
      : (report.period_start ?? report.report_date ?? "");
  return [period, report.source_name ?? null].filter(Boolean).join(" · ");
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
          description="Napi összegzések és a hétfői heti riportok naptár nézetben."
        />
        <div className="flex flex-wrap gap-2">
          {isAdmin && <MarketMonitorButton />}
          {isAdmin && <WeeklyReportButton />}
          <UploadReportDialog />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <CalendarSection reports={reports ?? []} />
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
            ? `Napi összegzés frissítve — ${result.newItems} új hír feldolgozva.`
            : "Napi összegzés elkészült — ma nem volt új piaci hír.",
        );
      }
      queryClient.invalidateQueries({ queryKey: ["market-reports"] });
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
      Napi összegzés most
    </Button>
  );
}

/**
 * Admin-only manuális trigger a heti riportgenerátorhoz (egyébként minden
 * hétfőn automatikusan lefut, ld. "weekly-report-generator" cron feladat).
 * Több AI-hívást indít (általános piaci keresés + partnerenkénti keresés),
 * ezért egy futtatás eltarthat pár tíz másodpercig.
 */
function WeeklyReportButton() {
  const queryClient = useQueryClient();
  const run = useServerFn(runWeeklyReportNow);

  const mutation = useMutation({
    mutationFn: () => run({}),
    onSuccess: (result) => {
      if (result.status === "no_provider") {
        toast.info("AI-szolgáltató nincs beállítva");
      } else if (result.status === "out_of_credit") {
        toast.info(
          "Elfogyott az AI-kredit a futás közben — a riport a meglévő adatokból készült el.",
        );
      } else if (result.status === "error") {
        toast.error(result.message ?? "A heti riport generálása nem sikerült.");
      } else {
        toast.success(
          `Heti riport elkészült — ${result.itemsFound} piaci tétel, ${result.partnerMovementsFound}/${result.partnersChecked} partnernél volt mozgás.`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["market-reports"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Button variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      {mutation.isPending ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Newspaper className="mr-2 size-4" strokeWidth={1.5} />
      )}
      Heti riport most
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

      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("market_reports").insert({
        organization_id: profile.organization_id,
        title: title.trim(),
        source_name: sourceName.trim() || null,
        summary: summary.trim() || null,
        year: Number(year),
        report_date: today,
        period_start: today,
        period_end: today,
        report_type: "kezi",
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

/**
 * Naptár nézet: minden nap egy cella, a napi összegzés és (hétfőkön) a heti
 * riport külön kis kártyaként jelenik meg benne. Kattintásra a riport teljes
 * szövege nyílik meg, ahonnan nyomtatható / PDF-be mentheto.
 */
function CalendarSection({ reports }: { reports: ReportRow[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: Math.max(today.getFullYear(), FIRST_YEAR),
    month: today.getFullYear() >= FIRST_YEAR ? today.getMonth() : 0,
  });
  const [selected, setSelected] = useState<ReportRow | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const report of reports) {
      if (!report.report_date) continue;
      const list = map.get(report.report_date) ?? [];
      list.push(report);
      map.set(report.report_date, list);
    }
    // A heti riport kerüljön előre a hétfői napokon.
    for (const list of map.values()) {
      list.sort((a, b) => {
        const rank = (row: ReportRow) => (row.report_type === "heti_osszefoglalo" ? 0 : 1);
        return rank(a) - rank(b);
      });
    }
    return map;
  }, [reports]);

  const firstWeekdayIndex = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const canGoBack =
    cursor.year > FIRST_YEAR || (cursor.year === FIRST_YEAR && cursor.month > 0);
  const canGoForward =
    cursor.year < today.getFullYear() ||
    (cursor.year === today.getFullYear() && cursor.month < today.getMonth());

  const cells: Array<{ key: string; day: number | null }> = [];
  for (let i = 0; i < firstWeekdayIndex; i += 1) {
    cells.push({ key: `blank-${i}`, day: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ key: `day-${day}`, day });
  }

  const monthReportCount = cells.reduce((total, cell) => {
    if (!cell.day) return total;
    const key = `${cursor.year}-${pad(cursor.month + 1)}-${pad(cell.day)}`;
    return total + (byDay.get(key)?.length ?? 0);
  }, 0);

  return (
    <section className="card-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {cursor.year}. {MONTH_NAMES[cursor.month]}
          </h2>
          <p className="text-xs text-muted-foreground">{monthReportCount} riport ebben a hónapban</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Előző hónap"
            disabled={!canGoBack}
            onClick={() =>
              setCursor((prev) =>
                prev.month === 0
                  ? { year: prev.year - 1, month: 11 }
                  : { year: prev.year, month: prev.month - 1 },
              )
            }
          >
            <ChevronLeft className="size-4" strokeWidth={1.5} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Következő hónap"
            disabled={!canGoForward}
            onClick={() =>
              setCursor((prev) =>
                prev.month === 11
                  ? { year: prev.year + 1, month: 0 }
                  : { year: prev.year, month: prev.month + 1 },
              )
            }
          >
            <ChevronRight className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (!cell.day) {
            return <div key={cell.key} className="min-h-24 rounded-lg bg-transparent" />;
          }
          const key = `${cursor.year}-${pad(cursor.month + 1)}-${pad(cell.day)}`;
          const dayReports = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={cell.key}
              className={`min-h-24 rounded-lg border p-1.5 ${
                isToday ? "border-primary bg-primary/5" : "border-border bg-secondary/20"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`text-xs ${
                    isToday ? "font-semibold text-primary" : "text-muted-foreground"
                  }`}
                >
                  {cell.day}
                </span>
              </div>
              <div className="space-y-1">
                {dayReports.map((report) => {
                  const meta = metaFor(report);
                  const Icon = meta.icon;
                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelected(report)}
                      title={report.title}
                      className={`flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition hover:opacity-80 ${meta.chipClass}`}
                    >
                      <Icon className="size-3 shrink-0" strokeWidth={1.8} />
                      <span className="truncate">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {monthReportCount === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Ebben a hónapban még nincs riport. A napi összegzés minden reggel, a heti riport minden
          hétfőn automatikusan elkészül — kézzel a fenti gombokkal is futtathatod.
        </p>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected && (
            <>
              <p className="text-xs text-muted-foreground">{reportSubtitle(selected)}</p>
              <div className="mt-2">
                {selected.summary ? (
                  renderMarkdown(selected.summary)
                ) : (
                  <p className="text-sm text-muted-foreground">Ehhez a riporthoz nincs szöveg.</p>
                )}
              </div>
              {selected.source_url && (
                <a
                  href={selected.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm text-primary underline"
                >
                  Eredeti forrás
                </a>
              )}
              <DialogFooter className="mt-4">
                {selected.pdf_path && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (selected.pdf_path) void downloadReportPdf(selected.pdf_path);
                    }}
                  >
                    <Download className="mr-2 size-4" strokeWidth={1.5} />
                    Feltöltött PDF
                  </Button>
                )}
                <Button
                  onClick={() =>
                    printDocument({
                      title: selected.title,
                      subtitle: reportSubtitle(selected),
                      markdown: selected.summary ?? "",
                    })
                  }
                  disabled={!selected.summary}
                >
                  <Printer className="mr-2 size-4" strokeWidth={1.5} />
                  Nyomtatás / PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
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

  return (
    <section className="card-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Saját jegyzetek</h2>
          <p className="text-xs text-muted-foreground">
            Kézi bejegyzések — az automatikus piaci összegzések a fenti naptárban vannak.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-4" strokeWidth={1.5} />
          Új bejegyzés
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : !digests || digests.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Még nincs kézi bejegyzés.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {digests.map((digest) => (
            <li key={digest.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground">
                    {new Date(digest.date).toLocaleDateString("hu-HU")}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    printDocument({
                      title: "Jegyzet",
                      subtitle: new Date(digest.date).toLocaleDateString("hu-HU"),
                      markdown: digest.content_markdown ?? "",
                    })
                  }
                >
                  <Printer className="mr-1 size-4" strokeWidth={1.5} />
                  Nyomtatás / PDF
                </Button>
              </div>
              <div className="mt-2">{renderMarkdown(digest.content_markdown ?? "—")}</div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Új jegyzet</DialogTitle>
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
                placeholder="Rövid jegyzet…"
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
