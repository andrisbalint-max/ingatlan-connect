import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addToBlocklist, listBlocklist, removeFromBlocklist } from "@/lib/agent-admin.functions";

const SOURCE_LABELS: Record<string, string> = {
  kezi: "Kézi",
  leiratkozas: "Leiratkozás",
};

/** Admin card on Beállítások: addresses that must never receive an email. */
export function BlocklistCard() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["email-blocklist"],
    queryFn: () => listBlocklist(),
  });

  const add = useMutation({
    mutationFn: () => addToBlocklist({ data: { email, reason } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["email-blocklist"] });
      setEmail("");
      setReason("");
      toast.success(result.duplicate ? "Ez a cím már tiltólistán van." : "Cím tiltólistára téve.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFromBlocklist({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-blocklist"] });
      toast.success("Cím eltávolítva a tiltólistáról.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="card-surface p-6 sm:p-8">
      <header className="mb-6">
        <h2 className="text-base font-semibold text-foreground">Tiltólista</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ezekre a címekre a rendszer semmilyen emailt nem küld, és az agentek sem tehetnek sorba
          nekik szóló levelet. A „leiratkozás” válaszok automatikusan ide kerülnek.
        </p>
      </header>

      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) add.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="blocklist-email">Email cím</Label>
          <Input
            id="blocklist-email"
            type="email"
            value={email}
            placeholder="nev@ceg.hu"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="blocklist-reason">Indok (opcionális)</Label>
          <Input
            id="blocklist-reason"
            value={reason}
            placeholder="pl. telefonon kérte"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={add.isPending || !email.trim()}>
          {add.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1 h-4 w-4" />
          )}
          Hozzáadás
        </Button>
      </form>

      <div className="mt-6 divide-y divide-border rounded-xl border border-border">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Betöltés…</p>
        ) : (rows ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">A tiltólista üres.</p>
        ) : (
          (rows ?? []).map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{row.email}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    SOURCE_LABELS[row.source] ?? row.source,
                    row.reason,
                    new Date(row.created_at).toLocaleDateString("hu-HU"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                aria-label={`${row.email} eltávolítása a tiltólistáról`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(row.id)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
