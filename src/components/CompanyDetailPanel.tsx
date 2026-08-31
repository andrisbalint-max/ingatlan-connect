import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { hunterSearch, type HunterPerson } from "@/lib/hunter.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface CompanyRow {
  id: string;
  organization_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  city: string | null;
  notes: string | null;
  opt_out: boolean;
  status: "nincs_valasz" | "valaszolt" | "erdeklodik" | "lezarva";
  hunter_searched: boolean;
  created_at: string;
}

interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
}

type ResponseCategory = "erdeklodes" | "talalkozo" | "elutasitas" | "kerdes" | "autovalasz";

interface ResponseRow {
  id: string;
  received_at: string;
  category: ResponseCategory | null;
  raw_text: string | null;
}

const CATEGORY_LABELS: Record<ResponseCategory, { label: string; className: string }> = {
  erdeklodes: { label: "Érdeklődés", className: "bg-primary/10 text-primary" },
  talalkozo: { label: "Találkozó", className: "bg-emerald-100 text-emerald-700" },
  elutasitas: { label: "Elutasítás", className: "bg-rose-100 text-rose-700" },
  kerdes: { label: "Kérdés", className: "bg-amber-100 text-amber-700" },
  autovalasz: { label: "Automatikus válasz", className: "bg-muted text-muted-foreground" },
};

const emptyContact = { name: "", email: "", phone: "", position: "" };

export function CompanyDetailPanel({
  company,
  onClose,
}: {
  company: CompanyRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const runHunter = useServerFn(hunterSearch);

  const [form, setForm] = useState({ name: "", domain: "", industry: "", city: "", notes: "" });
  const [newContact, setNewContact] = useState(emptyContact);
  const [showContactForm, setShowContactForm] = useState(false);
  const [hunterMessage, setHunterMessage] = useState<string | null>(null);
  const [hunterPeople, setHunterPeople] = useState<HunterPerson[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!company) return;
    setForm({
      name: company.name,
      domain: company.domain ?? "",
      industry: company.industry ?? "",
      city: company.city ?? "",
      notes: company.notes ?? "",
    });
    setHunterMessage(null);
    setHunterPeople([]);
    setSelected({});
    setShowContactForm(false);
    setNewContact(emptyContact);
  }, [company?.id]);

  const { data: contacts, isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts", company?.id],
    enabled: Boolean(company?.id),
    queryFn: async (): Promise<ContactRow[]> => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, email, phone, position")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ContactRow[];
    },
  });

  const { data: responses, isLoading: responsesLoading } = useQuery({
    queryKey: ["company-responses", company?.id],
    enabled: Boolean(company?.id),
    queryFn: async (): Promise<ResponseRow[]> => {
      const { data: emails, error: emailsError } = await supabase
        .from("emails_queue")
        .select("id")
        .eq("company_id", company!.id);
      if (emailsError) throw emailsError;
      const ids = (emails ?? []).map((e) => e.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("responses")
        .select("id, received_at, category, raw_text")
        .in("email_id", ids)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data as ResponseRow[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["companies"] });
    queryClient.invalidateQueries({ queryKey: ["contacts", company?.id] });
  };

  const saveCompany = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("companies")
        .update({
          name: form.name.trim(),
          domain: form.domain.trim() || null,
          industry: form.industry.trim() || null,
          city: form.city.trim() || null,
          notes: form.notes.trim() || null,
        })
        .eq("id", company!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cégadatok mentve.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleOptOut = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("companies")
        .update({ opt_out: value })
        .eq("id", company!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leiratkozási állapot frissítve.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contacts").insert({
        organization_id: company!.organization_id,
        company_id: company!.id,
        name: newContact.name.trim(),
        email: newContact.email.trim() || null,
        phone: newContact.phone.trim() || null,
        position: newContact.position.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kapcsolattartó hozzáadva.");
      setNewContact(emptyContact);
      setShowContactForm(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ContactRow> }) => {
      const { error } = await supabase.from("contacts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kapcsolattartó frissítve.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kapcsolattartó törölve.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hunter = useMutation({
    mutationFn: async () => runHunter({ data: { companyId: company!.id } }),
    onSuccess: (result) => {
      setHunterPeople(result.people);
      setSelected({});
      if (result.status !== "ok") {
        setHunterMessage(result.message ?? "A keresés nem hozott eredményt.");
      } else if (result.people.length === 0) {
        setHunterMessage("A Hunter nem talált kontaktot ehhez a domainhez.");
      } else {
        setHunterMessage(null);
      }
    },
    onError: (error: Error) => setHunterMessage(error.message),
  });

  const saveSelected = useMutation({
    mutationFn: async () => {
      const chosen = hunterPeople.filter((person) => selected[person.email]);
      if (chosen.length === 0) throw new Error("Nincs kiválasztott kontakt.");
      const { error } = await supabase.from("contacts").insert(
        chosen.map((person) => ({
          organization_id: company!.organization_id,
          company_id: company!.id,
          name: person.name,
          email: person.email,
          position: person.position,
        })),
      );
      if (error) throw error;
      const { error: flagError } = await supabase
        .from("companies")
        .update({ hunter_searched: true })
        .eq("id", company!.id);
      if (flagError) throw flagError;
    },
    onSuccess: () => {
      toast.success("Kiválasztott kontaktok mentve.");
      setHunterPeople([]);
      setSelected({});
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={Boolean(company)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {company && (
          <div className="space-y-8 pb-10">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="text-xl">{company.name}</SheetTitle>
              <SheetDescription>Cégadatok, kapcsolattartók és kontaktkeresés.</SheetDescription>
            </SheetHeader>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Cégadatok</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">Cégnév</Label>
                  <Input
                    id="c-name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-domain">Domain</Label>
                  <Input
                    id="c-domain"
                    placeholder="pelda.hu"
                    value={form.domain}
                    onChange={(event) => setForm({ ...form, domain: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-industry">Iparág</Label>
                  <Input
                    id="c-industry"
                    value={form.industry}
                    onChange={(event) => setForm({ ...form, industry: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-city">Város</Label>
                  <Input
                    id="c-city"
                    value={form.city}
                    onChange={(event) => setForm({ ...form, city: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-notes">Megjegyzések</Label>
                <Textarea
                  id="c-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
              <Button onClick={() => saveCompany.mutate()} disabled={saveCompany.isPending}>
                {saveCompany.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Mentés
              </Button>
            </section>

            <Separator />

            <section className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Leiratkozott</p>
                <p className="text-xs text-muted-foreground">Ne írjunk neki többé.</p>
              </div>
              <Switch
                checked={company.opt_out}
                onCheckedChange={(value) => toggleOptOut.mutate(value)}
              />
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Kapcsolattartók</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowContactForm((value) => !value)}
                >
                  <Plus className="mr-1.5 size-4" /> Új kontakt
                </Button>
              </div>

              {showContactForm && (
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Név"
                      value={newContact.name}
                      onChange={(event) => setNewContact({ ...newContact, name: event.target.value })}
                    />
                    <Input
                      placeholder="Email"
                      value={newContact.email}
                      onChange={(event) => setNewContact({ ...newContact, email: event.target.value })}
                    />
                    <Input
                      placeholder="Telefon"
                      value={newContact.phone}
                      onChange={(event) => setNewContact({ ...newContact, phone: event.target.value })}
                    />
                    <Input
                      placeholder="Pozíció"
                      value={newContact.position}
                      onChange={(event) =>
                        setNewContact({ ...newContact, position: event.target.value })
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={!newContact.name.trim() || addContact.isPending}
                    onClick={() => addContact.mutate()}
                  >
                    Kontakt mentése
                  </Button>
                </div>
              )}

              {contactsLoading ? (
                <p className="text-sm text-muted-foreground">Betöltés…</p>
              ) : contacts && contacts.length > 0 ? (
                <ul className="space-y-3">
                  {contacts.map((contact) => (
                    <ContactItem
                      key={contact.id}
                      contact={contact}
                      onSave={(patch) => updateContact.mutate({ id: contact.id, patch })}
                      onDelete={() => deleteContact.mutate(contact.id)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                  <Users className="mx-auto mb-2 size-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Még nincs kapcsolattartó — add hozzá kézzel vagy keress Hunterrel.
                  </p>
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Kontakt keresés Hunterrel</h3>
              <Button
                variant="outline"
                onClick={() => {
                  setHunterMessage(null);
                  hunter.mutate();
                }}
                disabled={hunter.isPending}
              >
                {hunter.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Search className="mr-2 size-4" />
                )}
                Kontakt keresés Hunterrel
              </Button>

              {hunterMessage && (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {hunterMessage}
                </p>
              )}

              {hunterPeople.length > 0 && (
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <ul className="space-y-2">
                    {hunterPeople.map((person) => (
                      <li key={person.email} className="flex items-start gap-3">
                        <Checkbox
                          id={`p-${person.email}`}
                          checked={Boolean(selected[person.email])}
                          onCheckedChange={(value) =>
                            setSelected((prev) => ({ ...prev, [person.email]: Boolean(value) }))
                          }
                        />
                        <label htmlFor={`p-${person.email}`} className="text-sm leading-tight">
                          <span className="font-medium text-foreground">{person.name}</span>
                          <span className="block text-muted-foreground">{person.email}</span>
                          {person.position && (
                            <span className="block text-xs text-muted-foreground">
                              {person.position}
                            </span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    onClick={() => saveSelected.mutate()}
                    disabled={saveSelected.isPending}
                  >
                    Kiválasztottak mentése
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Email előzmények</h3>
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <Mail className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Az email előzmények az Email sor modul elkészülte után jelennek meg itt.
                </p>
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ContactItem({
  contact,
  onSave,
  onDelete,
}: {
  contact: ContactRow;
  onSave: (patch: Partial<ContactRow>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState({
    name: contact.name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    position: contact.position ?? "",
  });

  const dirty =
    draft.name !== contact.name ||
    draft.email !== (contact.email ?? "") ||
    draft.phone !== (contact.phone ?? "") ||
    draft.position !== (contact.position ?? "");

  return (
    <li className="space-y-3 rounded-xl border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <Input
          value={draft.email}
          placeholder="Email"
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
        />
        <Input
          value={draft.phone}
          placeholder="Telefon"
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
        />
        <Input
          value={draft.position}
          placeholder="Pozíció"
          onChange={(e) => setDraft({ ...draft, position: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty}
          onClick={() =>
            onSave({
              name: draft.name.trim(),
              email: draft.email.trim() || null,
              phone: draft.phone.trim() || null,
              position: draft.position.trim() || null,
            })
          }
        >
          Mentés
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="mr-1.5 size-4" /> Törlés
        </Button>
      </div>
    </li>
  );
}
