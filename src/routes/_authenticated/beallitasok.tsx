import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Plus, X, Mail, Loader2, Unlink } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  startOutlookAuth,
  getOutlookStatus,
  disconnectOutlook,
  setupEmailCronJobs,
} from "@/lib/outlook.functions";



export const Route = createFileRoute("/_authenticated/beallitasok")({
  head: () => ({
    meta: [
      { title: "Beállítások — Ipari Ingatlan Platform" },
      { name: "description", content: "API kulcsok, napi email limit, kiküldési időablak és follow-up ütemezés beállításai." },
      { property: "og:title", content: "Beállítások — Ipari Ingatlan Platform" },
      { property: "og:description", content: "API kulcsok, napi email limit, kiküldési időablak és follow-up ütemezés beállításai." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

interface Settings {
  id: string;
  organization_id: string;
  hunter_api_key: string | null;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  preferred_ai_provider: "openai" | "anthropic";
  outlook_connected: boolean;
  daily_email_limit: number;
  send_window_start: string;
  send_window_end: string;
  follow_up_schedule: number[] | null;
  monthly_ai_budget_usd: number | null;
  ai_usage_estimated_usd: number | null;
  ai_provider_out_of_credit: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
};

function toTimeInput(value: string | null | undefined) {
  if (!value) return "09:00";
  return value.slice(0, 5);
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-surface p-6 sm:p-8">
      <header className="mb-6">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function SecretInput({
  id,
  label,
  helper,
  value,
  onChange,
}: {
  id: string;
  label: string;
  helper: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete="off"
          placeholder="Nincs megadva"
          onChange={(e) => onChange(e.target.value)}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Kulcs elrejtése" : "Kulcs megjelenítése"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-primary"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function SettingsPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === "admin";

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    enabled: isAdmin,
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return (data as unknown as Settings) ?? null;
    },
  });

  const [hunterKey, setHunterKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [aiProvider, setAiProvider] = useState<"openai" | "anthropic">("anthropic");
  const [dailyLimit, setDailyLimit] = useState(30);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("16:00");
  const [schedule, setSchedule] = useState<number[]>([4, 10, 21]);

  useEffect(() => {
    if (!settings) return;
    setHunterKey(settings.hunter_api_key ?? "");
    setOpenaiKey(settings.openai_api_key ?? "");
    setAnthropicKey(settings.anthropic_api_key ?? "");
    setAiProvider(settings.preferred_ai_provider === "openai" ? "openai" : "anthropic");
    setDailyLimit(settings.daily_email_limit ?? 30);
    setWindowStart(toTimeInput(settings.send_window_start));
    setWindowEnd(toTimeInput(settings.send_window_end));
    setSchedule(
      Array.isArray(settings.follow_up_schedule) ? settings.follow_up_schedule : [4, 10, 21],
    );
  }, [settings]);

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!settings) throw new Error("Nincs beállítás rekord.");
      const { error } = await supabase
        .from("settings")
        .update(patch as never)
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Beállítások mentve.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => toast.error("A mentés nem sikerült."),
  });

  if (profileLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Beállítások" />
        <div className="card-surface p-6">
          <p className="text-sm text-muted-foreground">Nincs jogosultságod ehhez az oldalhoz</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Beállítások"
        description="Integrációk, email küldési szabályok és kapcsolatok kezelése."
      />

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <SectionCard
            title="API kulcsok"
            description="Külső szolgáltatások eléréséhez használt kulcsok."
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <SecretInput
                id="hunter"
                label="Hunter API kulcs"
                helper="Kontaktkereséshez: céges email címek felderítése domain alapján."
                value={hunterKey}
                onChange={setHunterKey}
              />
              <SecretInput
                id="openai"
                label="OpenAI API kulcs"
                helper="AI szövegek és összefoglalók generálásához (emailek, riportok)."
                value={openaiKey}
                onChange={setOpenaiKey}
              />
              <SecretInput
                id="anthropic"
                label="Anthropic (Claude) API kulcs"
                helper="AI szövegek, összefoglalók és piacfigyelés generálásához Claude modellekkel."
                value={anthropicKey}
                onChange={setAnthropicKey}
              />
            </div>

            <div className="mt-6 space-y-3">
              <Label>Elsődleges AI szolgáltató</Label>
              <div
                role="radiogroup"
                aria-label="Elsődleges AI szolgáltató"
                className="inline-flex rounded-xl border border-border bg-secondary/40 p-1"
              >
                {(
                  [
                    { value: "anthropic", label: "Claude" },
                    { value: "openai", label: "OpenAI" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={aiProvider === option.value}
                    onClick={() => setAiProvider(option.value)}
                    className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                      aiProvider === option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="max-w-2xl text-xs text-muted-foreground">
                A rendszer ezt a szolgáltatót használja az AI-funkciókhoz (follow-up emailek,
                válasz-kategorizálás, összefoglalók, piacfigyelés). Ha a kiválasztotthoz nincs
                kulcs megadva, a rendszer automatikusan a másikat próbálja használni, ha ahhoz van
                kulcs megadva.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={() =>
                  save.mutate({
                    hunter_api_key: hunterKey.trim() || null,
                    openai_api_key: openaiKey.trim() || null,
                    anthropic_api_key: anthropicKey.trim() || null,
                    preferred_ai_provider: aiProvider,
                  })
                }
                disabled={save.isPending}
              >
                Mentés
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="Email küldési beállítások"
            description="Napi mennyiség, időablak és automatikus follow-up ütemezés."
          >
            <div className="space-y-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="limit">Napi email limit</Label>
                  <span className="text-sm font-semibold text-primary">{dailyLimit} email / nap</span>
                </div>
                <Slider
                  id="limit"
                  min={10}
                  max={50}
                  step={1}
                  value={[dailyLimit]}
                  onValueChange={(v) => setDailyLimit(v[0] ?? 30)}
                  className="max-w-md"
                />
                <div className="flex max-w-md justify-between text-xs text-muted-foreground">
                  <span>10</span>
                  <span>50</span>
                </div>
              </div>

              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start">Küldési időablak kezdete</Label>
                  <Input
                    id="start"
                    type="time"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">Küldési időablak vége</Label>
                  <Input
                    id="end"
                    type="time"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Follow-up ütemezés</Label>
                <p className="text-xs text-muted-foreground">
                  Ennyi nap után küldünk automatikus follow-up emailt, ha nincs válasz.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {schedule.map((days, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1 rounded-xl border border-border bg-secondary/40 px-2 py-1.5"
                    >
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={days}
                        aria-label={`${index + 1}. follow-up napja`}
                        onChange={(e) =>
                          setSchedule((prev) =>
                            prev.map((d, i) => (i === index ? Number(e.target.value) : d)),
                          )
                        }
                        className="h-8 w-20 border-none bg-transparent px-1 text-center shadow-none focus-visible:ring-0"
                      />
                      <span className="text-xs text-muted-foreground">nap</span>
                      <button
                        type="button"
                        aria-label="Eltávolítás"
                        onClick={() => setSchedule((prev) => prev.filter((_, i) => i !== index))}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSchedule((prev) => [...prev, (prev[prev.length - 1] ?? 0) + 7])
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Új lépés
                  </Button>
                </div>
                {schedule.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nincs follow-up lépés — nem küldünk automatikus utánkövetést.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <Button
                onClick={() =>
                  save.mutate({
                    daily_email_limit: dailyLimit,
                    send_window_start: windowStart,
                    send_window_end: windowEnd,
                    follow_up_schedule: schedule
                      .filter((d) => Number.isFinite(d) && d > 0)
                      .sort((a, b) => a - b),
                  })
                }
                disabled={save.isPending}
              >
                Mentés
              </Button>
            </div>
          </SectionCard>

          <OutlookSection />

        </div>
      )}
    </div>
  );
}

function OutlookSection() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["outlook-status"],
    queryFn: () => getOutlookStatus(),
  });

  const connect = useMutation({
    mutationFn: () => startOutlookAuth(),
    onSuccess: ({ authUrl }) => {
      window.location.href = authUrl;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectOutlook(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outlook-status"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Outlook kapcsolat bontva.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setupCron = useMutation({
    mutationFn: () => setupEmailCronJobs(),
    onSuccess: () => toast.success("Email cron feladatok beállítva."),
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("outlook");
    if (!result) return;

    if (result === "connected") {
      toast.success("Outlook sikeresen bekötve.");
      queryClient.invalidateQueries({ queryKey: ["outlook-status"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } else if (result === "error") {
      toast.error(params.get("message") ?? "Az Outlook bekötése nem sikerült.");
    }

    params.delete("outlook");
    params.delete("message");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, [queryClient]);


  return (
    <SectionCard
      title="Outlook kapcsolat"
      description="Emailek kiküldése és válaszok fogadása a saját Microsoft fiókodon keresztül."
    >
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-secondary/30 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 rounded-full ${
              status?.connected ? "bg-primary" : "bg-muted-foreground/50"
            }`}
          />
          <div>
            <p className="text-sm font-medium text-foreground">Microsoft Outlook</p>
            <Badge variant="secondary" className="mt-1 font-normal">
              {isLoading
                ? "Betöltés…"
                : status?.connected
                  ? `Bekötve: ${status.accountEmail ?? "ismeretlen"}`
                  : "Nincs bekötve"}
            </Badge>
          </div>
        </div>
        {status?.connected ? (
          <Button
            variant="outline"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            {disconnect.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Unlink className="mr-2 h-4 w-4" />
            )}
            Kapcsolat bontása
          </Button>
        ) : (
          <Button disabled={connect.isPending} onClick={() => connect.mutate()}>
            {connect.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Bejelentkezés Microsofttal
          </Button>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        A bekötés után indítsd el az automatikus email küldést az alábbi gombbal.
      </p>
      <div className="mt-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={setupCron.isPending}
          onClick={() => setupCron.mutate()}
        >
          {setupCron.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Email cron feladatok beállítása
        </Button>
      </div>
    </SectionCard>
  );
}


