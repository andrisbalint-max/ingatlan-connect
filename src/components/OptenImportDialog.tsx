import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  saveExcelColumnMapping,
  type ExcelColumnMapping,
  type RevenueBand,
} from "@/lib/opten.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

/** Target fields an Excel/CSV column can be mapped to. */
const FIELD_OPTIONS = [
  { value: "skip", label: "Kihagyás" },
  { value: "company_name", label: "Cégnév (kötelező)" },
  { value: "teaor_code", label: "TEÁOR kód" },
  { value: "teaor_description", label: "TEÁOR / tevékenység leírás" },
  { value: "net_revenue", label: "Nettó árbevétel" },
  { value: "city", label: "Város" },
  { value: "domain", label: "Domain / weboldal" },
] as const;

interface ParsedFile {
  headers: string[];
  rows: Record<string, unknown>[];
}

function parseRevenue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/\s|\u00a0/g, "").replace(/,/g, ".");
  const digits = text.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchBand(value: unknown, bands: RevenueBand[]): string | null {
  const amount = parseRevenue(value);
  if (amount === null) return null;
  const band = bands.find(
    (item) => (item.min === null || amount >= item.min) && (item.max === null || amount <= item.max),
  );
  return band?.label ?? null;
}

function cleanDomain(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
}

export function OptenImportDialog({
  organizationId,
  bands,
  savedMapping,
  onImported,
}: {
  organizationId: string;
  bands: RevenueBand[];
  savedMapping: ExcelColumnMapping | null;
  onImported: () => void;
}) {
  const queryClient = useQueryClient();
  const saveMapping = useServerFn(saveExcelColumnMapping);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ExcelColumnMapping>({});
  const [parseError, setParseError] = useState<string | null>(null);

  function autoMap(headers: string[]): ExcelColumnMapping {
    const next: ExcelColumnMapping = {};
    headers.forEach((header) => {
      const remembered = savedMapping?.[header];
      if (remembered && FIELD_OPTIONS.some((option) => option.value === remembered)) {
        next[header] = remembered;
        return;
      }
      next[header] = "skip";
    });
    return next;
  }

  async function handleFile(file: File) {
    setParseError(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("empty");
      const sheet = workbook.Sheets[sheetName]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      if (rows.length === 0) throw new Error("empty");
      const headers = Object.keys(rows[0]!);
      setParsed({ headers, rows });
      setMapping(autoMap(headers));
      setOpen(true);
    } catch {
      setParsed(null);
      setParseError(
        "A fájlt nem sikerült beolvasni. Ellenőrizd, hogy .xlsx vagy .csv formátum, és van fejlécsora.",
      );
      setOpen(true);
    }
  }

  const importRows = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("Nincs beolvasott fájl.");
      const nameHeader = Object.keys(mapping).find((key) => mapping[key] === "company_name");
      if (!nameHeader) throw new Error("A Cégnév oszlop leképezése kötelező.");

      const get = (row: Record<string, unknown>, field: string) => {
        const header = Object.keys(mapping).find((key) => mapping[key] === field);
        return header ? row[header] : null;
      };

      const prepared = parsed.rows
        .map((row) => {
          const name = String(row[nameHeader] ?? "").trim();
          if (!name) return null;
          const revenue = get(row, "net_revenue");
          const bandLabel = matchBand(revenue, bands);
          const rawRevenue = revenue === null || revenue === undefined ? null : String(revenue).trim();
          return {
            organization_id: organizationId,
            company_name: name,
            teaor_code: String(get(row, "teaor_code") ?? "").trim() || null,
            teaor_description: String(get(row, "teaor_description") ?? "").trim() || null,
            net_revenue_band: bandLabel ?? (rawRevenue || null),
            city: String(get(row, "city") ?? "").trim() || null,
            domain: cleanDomain(get(row, "domain")),
            raw_opten_data: row as never,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const { data: existing } = await supabase.from("opten_prospects").select("company_name");
      const known = new Set(
        (existing ?? []).map((row) => row.company_name.trim().toLowerCase()),
      );

      const seen = new Set<string>();
      const fresh = prepared.filter((row) => {
        const key = row.company_name.toLowerCase();
        if (known.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const skipped = prepared.length - fresh.length;

      for (let index = 0; index < fresh.length; index += 200) {
        const chunk = fresh.slice(index, index + 200);
        const { error } = await supabase.from("opten_prospects").insert(chunk);
        if (error) throw error;
      }

      await saveMapping({ data: { mapping } });

      return { created: fresh.length, skipped };
    },
    onSuccess: ({ created, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["opten-prospects-all"] });
      queryClient.invalidateQueries({ queryKey: ["opten-config"] });
      toast.success(
        `${created} új cég importálva, ${skipped} kihagyva (már szerepel az adatbázisban).`,
      );
      setOpen(false);
      setParsed(null);
      if (inputRef.current) inputRef.current.value = "";
      onImported();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const nameMapped = Object.values(mapping).includes("company_name");
  const preview = parsed?.rows.slice(0, 10) ?? [];

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button variant="secondary" onClick={() => inputRef.current?.click()}>
        <Upload className="mr-2 size-4" strokeWidth={1.5} />
        Opten export feltöltése (Excel/CSV)
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && inputRef.current) inputRef.current.value = "";
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Oszlopok megfeleltetése</DialogTitle>
            <DialogDescription>
              Állítsd be, melyik fájloszlop melyik adat — a mentett beállítás lesz a következő
              import alapja.
            </DialogDescription>
          </DialogHeader>

          {parseError ? (
            <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
              {parseError}
            </p>
          ) : parsed ? (
            <div className="space-y-5">
              <div className="space-y-2">
                {parsed.headers.map((header) => (
                  <div key={header} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-40 flex-1 truncate text-sm text-foreground">{header}</span>
                    <Select
                      value={mapping[header] ?? "skip"}
                      onValueChange={(value) =>
                        setMapping((prev) => ({ ...prev, [header]: value }))
                      }
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {!nameMapped && (
                <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                  A Cégnév oszlop megadása kötelező az importhoz.
                </p>
              )}

              {bands.length === 0 && (
                <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                  Még nincs beállítva árbevétel-sáv — az árbevétel értékek szövegként kerülnek be.
                </p>
              )}

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Előnézet — első {preview.length} sor ({parsed.rows.length} sor összesen)
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/60">
                      <tr>
                        {parsed.headers.map((header) => (
                          <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, index) => (
                        <tr key={index} className="border-t border-border">
                          {parsed.headers.map((header) => (
                            <td key={header} className="max-w-48 truncate px-3 py-2">
                              {String(row[header] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Mégse
            </Button>
            <Button
              onClick={() => importRows.mutate()}
              disabled={!parsed || !nameMapped || importRows.isPending}
            >
              {importRows.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Importálás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
