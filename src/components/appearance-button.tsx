import { useState } from "react";
import { Palette, Sun, Moon, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ACCENTS, useAppearance, type ThemeMode } from "@/lib/appearance";
import { cn } from "@/lib/utils";

export function AppearanceButton() {
  const [open, setOpen] = useState(false);
  const { mode, accent, setMode, setAccent } = useAppearance();

  const modes: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "system", label: "System", icon: Monitor },
  ];

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        aria-label="Appearance"
        className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg"
      >
        <Palette className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workspace Appearance</DialogTitle>
            <DialogDescription>Customize your theme and color preferences.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-2">Mode</div>
              <div className="grid grid-cols-3 gap-2">
                {modes.map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setMode(m.key)}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Accent Color</div>
              <div className="grid grid-cols-2 gap-2">
                {ACCENTS.map((a) => {
                  const active = accent === a.key;
                  return (
                    <button
                      key={a.key}
                      onClick={() => setAccent(a.key)}
                      className={cn(
                        "flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition text-left",
                        active
                          ? "border-primary ring-1 ring-primary"
                          : "border-input hover:bg-accent",
                      )}
                    >
                      <span
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: a.swatch }}
                      >
                        {active && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                      <span className="truncate">{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
