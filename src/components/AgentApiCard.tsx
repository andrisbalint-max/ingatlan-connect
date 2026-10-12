import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { generateAgentKey, listAgentKeys, revokeAgentKey } from "@/lib/agent-admin.functions";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Admin card on Beállítások: Agent API keys for the external Claude agents. */
export function AgentApiCard() {
  const queryClient = useQueryClient();
  const [plainKey, setPlainKey] = useState<string | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["agent-api-keys"],
    queryFn: () => listAgentKeys(),
  });

  const generate = useMutation({
    mutationFn: () => generateAgentKey(),
    onSuccess: ({ key }) => {
      setPlainKey(key);
      queryClient.invalidateQueries({ queryKey: ["agent-api-keys"] });
      toast.success("Új Agent API kulcs létrehozva.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeAgentKey({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-api-keys"] });
      toast.success("Kulcs visszavonva.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function copyKey() {
    if (!plainKey) return;
    try {
      await navigator.clipboard.writeText(plainKey);
      toast.success("Kulcs a vágólapra másolva.");
    } catch {
      toast.error("A másolás nem sikerült — jelöld ki és másold kézzel.");
    }
  }

  return (
    <section className="card-surface p-6 sm:p-8">
      <header className="mb-6">
        <h2 className="text-base font-semibold text-foreground">Agent API</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A külső Claude agentek ezzel a kulccsal érik el a rendszert (cégadatok, email-tervezetek,
          válaszok, riportok). Az agentek semmit nem küldenek ki — minden email jóváhagyásra vár az
          Email sorban.
        </p>
      </header>

      <div className="space-y-4">
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="mr-2 h-4 w-4" />
          )}
          Kulcs generálása
        </Button>

        {plainKey && (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex gap-2">
              <Input
                readOnly
                value={plainKey}
                aria-label="Új Agent API kulcs"
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="outline" onClick={copyKey} aria-label="Másolás">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-amber-900">
              Csak most látszik – másold ki, és illeszd be az Agent Iroda REC fülére.
            </p>
          </div>
        )}

        <div className="divide-y divide-border rounded-xl border border-border">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Betöltés…</p>
          ) : (keys ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Még nincs Agent API kulcs.</p>
          ) : (
            (keys ?? []).map((key) => (
              <div
                key={key.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-mono text-sm text-foreground">
                    {key.key_prefix}…{" "}
                    {key.revoked_at ? (
                      <Badge variant="secondary" className="ml-1 font-normal">
                        Visszavonva: {formatDateTime(key.revoked_at)}
                      </Badge>
                    ) : (
                      <Badge className="ml-1 font-normal">Aktív</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Létrehozva: {formatDateTime(key.created_at)} · Utoljára használva:{" "}
                    {formatDateTime(key.last_used_at)}
                  </p>
                </div>
                {!key.revoked_at && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(key.id)}
                  >
                    Visszavonás
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
