import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSettings, saveSettings, defaultSettings, type AppSettings } from "@/lib/settings";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [s, setS] = useState<AppSettings>(defaultSettings);
  const [newReason, setNewReason] = useState("");
  const [uDate, setUDate] = useState("");
  const [uReason, setUReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { getSettings().then(setS); }, []);

  const save = async () => {
    setSaving(true);
    try { await saveSettings(s); toast.success("Settings saved"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure reasons, slot capacity, and unavailable dates.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Available Schedule</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center justify-between">AM open <Switch checked={s.amEnabled} onCheckedChange={(v) => setS({ ...s, amEnabled: v })} /></label>
            <label className="text-xs text-muted-foreground">Slots per AM</label>
            <Input type="number" min={0} value={s.amSlots} onChange={(e) => setS({ ...s, amSlots: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center justify-between">PM open <Switch checked={s.pmEnabled} onCheckedChange={(v) => setS({ ...s, pmEnabled: v })} /></label>
            <label className="text-xs text-muted-foreground">Slots per PM</label>
            <Input type="number" min={0} value={s.pmSlots} onChange={(e) => setS({ ...s, pmSlots: Number(e.target.value) })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available days</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Check the weekdays students may book. Unchecked days are disabled on the booking calendar.</p>
          <div className="flex flex-wrap gap-2">
            {[
              { d: 0, n: "Sunday" },
              { d: 1, n: "Monday" },
              { d: 2, n: "Tuesday" },
              { d: 3, n: "Wednesday" },
              { d: 4, n: "Thursday" },
              { d: 5, n: "Friday" },
              { d: 6, n: "Saturday" },
            ].map(({ d, n }) => {
              const active = (s.availableDays ?? []).includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    const set = new Set(s.availableDays ?? []);
                    if (set.has(d)) set.delete(d); else set.add(d);
                    setS({ ...s, availableDays: Array.from(set).sort() });
                  }}
                  className={`px-3 py-1.5 rounded-full border text-sm transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reasons for scheduling</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Add a reason" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
            <Button onClick={() => { if (newReason.trim()) { setS({ ...s, reasons: [...s.reasons, newReason.trim()] }); setNewReason(""); } }}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.reasons.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm">
                {r}
                <button onClick={() => setS({ ...s, reasons: s.reasons.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Unavailable dates</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input type="date" value={uDate} onChange={(e) => setUDate(e.target.value)} className="w-48" />
            <Input placeholder="Reason (e.g., holiday)" value={uReason} onChange={(e) => setUReason(e.target.value)} className="flex-1 min-w-48" />
            <Button onClick={() => {
              if (!uDate || !uReason) return;
              setS({ ...s, unavailableDates: [...s.unavailableDates.filter((u) => u.date !== uDate), { date: uDate, reason: uReason }] });
              setUDate(""); setUReason("");
            }}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>
          <div className="divide-y border rounded-md">
            {s.unavailableDates.map((u) => (
              <div key={u.date} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium text-sm">{u.date}</div>
                  <div className="text-xs text-muted-foreground">{u.reason}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setS({ ...s, unavailableDates: s.unavailableDates.filter((x) => x.date !== u.date) })}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {s.unavailableDates.length === 0 && <div className="p-4 text-sm text-muted-foreground">None configured.</div>}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save settings"}</Button>
      </div>
    </div>
  );
}