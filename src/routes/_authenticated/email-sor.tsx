import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/email-sor")({
  head: () => ({
    meta: [
      { title: "Email sor — Ipari Ingatlan Platform" },
      {
        name: "description",
        content: "Jóváhagyásra váró és kiküldött megkereső emailek kezelése.",
      },
      { property: "og:title", content: "Email sor — Ipari Ingatlan Platform" },
      {
        property: "og:description",
        content: "Jóváhagyásra váró és kiküldött megkereső emailek kezelése.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmailQueuePage,
});

type EmailStatus = "varakozik" | "szerkesztett" | "jovahagyva" | "elkuldot" | "elvetve";

type EmailRow = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  subject: string | null;
  body: string | null;
  context_note: string | null;
  status: EmailStatus;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
};

const statusBadges: Record<EmailStatus, { label: string; pill: string }> = {
  varakozik: { label: "Várakozik", pill: "bg-amber-50 text-amber-700 border-amber-100" },
  szerkesztett: { label: "Szerkesztett", pill: "bg-sky-50 text-sky-700 border-sky-100" },
  jovahagyva: { label: "Jóváhagyva", pill: "bg-teal-50 text-teal-700 border-teal-100" },
  elkuldot: { label: "Elküldve", pill: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  elvetve: { label: "Elvetve", pill: "bg-rose-50 text-rose-700 border-rose-100" },
};

function StatusBadge({ status }: { status: EmailStatus }) {
  const badge = statusBadges[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.pill}`}
    >
      {badge.label}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function EmailQueuePage() {
  const queryClient = useQueryClient();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string; context_note: string }>({
    subject: "",
    body: "",
    context_note: "",
  });

  const { data: settings } = useQuery({
    queryKey: ["settings-outlook"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("outlook_connected")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: emails, isLoading } = useQuery({
    queryKey: ["emails-queue"],
    queryFn: async (): Promise<EmailRow[]> => {
      const { data, error } = await supabase
        .from("emails_queue")
        .select(
          "id, company_id, contact_id, subject, body, context_note, status, approved_at, sent_at, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmailRow[];
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["emails-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["emails-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name, email");
      if (error) throw error;
      return data ?? [];
    },
  });

  const companyMap = useMemo(
    () => new Map((companies ?? []).map((c) => [c.id, c.name])),
    [companies],
  );
  const contactMap = useMemo(
    () => new Map((contacts ?? []).map((c) => [c.id, c])),
    [contacts],
  );

  const queue = useMemo(
    () =>
      (emails ?? []).filter((e) => e.status === "varakozik" || e.status === "szerkesztett"),
    [emails],
  );
  const waitingCount = useMemo(
    () => (emails ?? []).filter((e) => e.status === "varakozik").length,
    [emails],
  );
  const log = useMemo(
    () =>
      (emails ?? [])
        .filter(
          (e) =>
            e.status === "jovahagyva" || e.status === "elkuldot" || e.status === "elvetve",
        )
        .sort((a, b) => {
          const da = new Date(a.sent_at ?? a.approved_at ?? a.created_at).getTime();
          const db = new Date(b.sent_at ?? b.approved_at ?? b.created_at).getTime();
          return db - da;
        }),
    [emails],
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["emails-queue"] });
  }

  const setStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: EmailStatus }) => {
      const payload: Record<string, unknown> = { status };
      if (status === "jovahagyva") payload.approved_at = new Date().toISOString();
      const { error } = await supabase.from("emails_queue").update(payload).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      invalidate();
      toast.success(
        variables.status === "jovahagyva"
          ? "Email jóváhagyva."
          : variables.status === "elvetve"
            ? "Email elvetve."
            : "Állapot frissítve.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveEdit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("emails_queue")
        .update({
          subject: draft.subject.trim() || null,
          body: draft.body,
          context_note: draft.context_note.trim() || null,
          status: "szerkesztett",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      toast.success("Módosítások mentve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function startEdit(email: EmailRow) {
    setEditingId(email.id);
    setDraft({
      subject: email.subject ?? "",
      body: email.body ?? "",
      context_note: email.context_note ?? "",
    });
  }

  const showBanner = settings && settings.outlook_connected === false && !bannerDismissed;

  return (
    <div>
      <PageHeader
        title="Email sor"
        description="Jóváhagyásra váró megkereső emailek és a kiküldési napló."
      />

      {showBanner && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="flex-1">
            Outlook nincs bekötve — a jóváhagyott emailek egyelőre nem lesznek automatikusan
            kiküldve.{" "}
            <Link to="/beallitasok" className="font-medium underline underline-offset-2">
              Beállítások
            </Link>
          </p>
          <button
            type="button"
            aria-label="Banner bezárása"
            onClick={() => setBannerDismissed(true)}
            className="rounded-md p-1 text-amber-700 transition hover:bg-amber-100"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      )}

      <div className="card-surface mb-6 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-foreground">
          {waitingCount} email vár jóváhagyásra
        </p>
        <Button
          disabled={
            setStatus.isPending ||
            queue.filter((e) => e.status === "varakozik").length === 0
          }
          onClick={() =>
            setStatus.mutate({
              ids: queue.filter((e) => e.status === "varakozik").map((e) => e.id),
              status: "jovahagyva",
            })
          }
        >
          <CheckCheck className="size-4" strokeWidth={1.5} />
          Mindet jóváhagyom
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : queue.length === 0 ? (
        <div className="card-surface px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Nincs jóváhagyásra váró email a sorban.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((email) => {
            const contact = email.contact_id ? contactMap.get(email.contact_id) : undefined;
            const isEditing = editingId === email.id;
            return (
              <article key={email.id} className="card-surface px-5 py-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {(email.company_id && companyMap.get(email.company_id)) || "Ismeretlen cég"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {contact ? `${contact.name}${contact.email ? ` · ${contact.email}` : ""}` : "Nincs kapcsolattartó"}
                    </p>
                  </div>
                  <StatusBadge status={email.status} />
                </div>

                {isEditing ? (
                  <div className="mb-4 space-y-1.5">
                    <Label htmlFor={`note-${email.id}`}>Miért ő</Label>
                    <Input
                      id={`note-${email.id}`}
                      value={draft.context_note}
                      onChange={(e) => setDraft((d) => ({ ...d, context_note: e.target.value }))}
                      placeholder="Pl. Tavaly 5.000 m²-t béreltek"
                    />
                  </div>
                ) : (
                  email.context_note && (
                    <p className="mb-4 text-xs text-muted-foreground">{email.context_note}</p>
                  )
                )}

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`subject-${email.id}`}>Tárgy</Label>
                    <Input
                      id={`subject-${email.id}`}
                      value={isEditing ? draft.subject : (email.subject ?? "")}
                      readOnly={!isEditing}
                      onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`body-${email.id}`}>Szöveg</Label>
                    <Textarea
                      id={`body-${email.id}`}
                      rows={8}
                      value={isEditing ? draft.body : (email.body ?? "")}
                      readOnly={!isEditing}
                      onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        disabled={saveEdit.isPending}
                        onClick={() => saveEdit.mutate(email.id)}
                      >
                        <Check className="size-4" strokeWidth={1.5} />
                        Mentés
                      </Button>
                      <Button variant="outline" onClick={() => setEditingId(null)}>
                        Mégse
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        disabled={setStatus.isPending}
                        onClick={() =>
                          setStatus.mutate({ ids: [email.id], status: "jovahagyva" })
                        }
                      >
                        <Check className="size-4" strokeWidth={1.5} />
                        {email.status === "szerkesztett" ? "Elfogadás" : "Jóváhagyás"}
                      </Button>
                      <Button variant="outline" onClick={() => startEdit(email)}>
                        <Pencil className="size-4" strokeWidth={1.5} />
                        Szerkesztés
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ ids: [email.id], status: "elvetve" })}
                      >
                        <X className="size-4" strokeWidth={1.5} />
                        Elvet
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Kiküldött emailek</h2>
        <div className="card-surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Címzett</TableHead>
                <TableHead>Tárgy</TableHead>
                <TableHead>Állapot</TableHead>
                <TableHead className="text-right">Dátum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    Még nincs feldolgozott email.
                  </TableCell>
                </TableRow>
              ) : (
                log.map((email) => {
                  const contact = email.contact_id ? contactMap.get(email.contact_id) : undefined;
                  return (
                    <TableRow key={email.id}>
                      <TableCell className="font-medium">
                        {(email.company_id && companyMap.get(email.company_id)) || "Ismeretlen cég"}
                        {contact && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {contact.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{email.subject ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={email.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatDate(email.sent_at ?? email.approved_at ?? email.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
