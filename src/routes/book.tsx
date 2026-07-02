import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";

import {
  addDoc,
  collection,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { defaultSettings, type AppSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { LogOut, CalendarDays, Receipt as ReceiptIcon } from "lucide-react";
import { Loader } from "@/components/loader";

export const Route = createFileRoute("/book")({
  head: () => ({ meta: [{ title: "Book a schedule" }] }),
  component: BookPage,
});

function BookPage() {
  const { user, loading, role, photoUrl, signOutUser } = useAuth();
  const router = useRouter();
  const [date, setDate] = useState<Date | undefined>();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [taken, setTaken] = useState<{ AM: number; PM: number }>({ AM: 0, PM: 0 });
  const [period, setPeriod] = useState<"AM" | "PM" | "">("");
  const [reason, setReason] = useState<string>("");
  const [privacy, setPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [profile, setProfile] = useState<{ fullName?: string; studentNumber?: string; monthlyLimit?: number | null } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/login" });
    if (role === "admin") router.navigate({ to: "/admin" });
  }, [user, role, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const d = snap.data() as any;
      setProfile({
        fullName: d?.fullName,
        studentNumber: d?.studentNumber,
        monthlyLimit: typeof d?.monthlyLimit === "number" ? d.monthlyLimit : null,
      });
      if (!d?.studentNumber) router.navigate({ to: "/profile" });
    });
    return () => unsub();
  }, [user, router]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "config"), (snap) => {
      if (snap.exists()) setSettings({ ...defaultSettings, ...(snap.data() as Partial<AppSettings>) });
      else setSettings(defaultSettings);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "bookings"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a: any, b: any) => {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        if (bt !== at) return bt - at;
        return (b.date ?? "").localeCompare(a.date ?? "");
      });
      setMyBookings(rows);
      setMyLoading(false);
    });
    return () => unsub();
  }, [user]);

  const dateKey = date ? format(date, "yyyy-MM-dd") : "";

  useEffect(() => {
    if (!dateKey) return;
    const q = query(collection(db, "bookings"), where("date", "==", dateKey));
    const unsub = onSnapshot(q, (snap) => {
      const counts = { AM: 0, PM: 0 };
      snap.forEach((d) => {
        const p = d.data().period as "AM" | "PM";
        counts[p] = (counts[p] ?? 0) + 1;
      });
      setTaken(counts);
    });
    return () => unsub();
  }, [dateKey]);

  const unavailable = useMemo(() => {
    if (!settings || !dateKey) return null;
    return settings.unavailableDates.find((u) => u.date === dateKey) ?? null;
  }, [settings, dateKey]);

  const today0 = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const monthStart = useMemo(() => startOfMonth(today0), [today0]);
  const monthEnd = useMemo(() => endOfMonth(today0), [today0]);
  const currentMonthKey = format(today0, "yyyy-MM");

  const activeThisMonth = useMemo(
    () => myBookings.filter((b) => (b.status || "pending") !== "cancelled" && (b.date ?? "").startsWith(currentMonthKey)),
    [myBookings, currentMonthKey],
  );
  const bookedDatesThisMonth = useMemo(
    () => new Set(activeThisMonth.map((b) => b.date)),
    [activeThisMonth],
  );

  const effectiveMonthlyLimit = profile?.monthlyLimit ?? settings?.monthlyLimit ?? 5;
  const monthlyRemaining = Math.max(0, effectiveMonthlyLimit - activeThisMonth.length);
  const reachedMonthlyLimit = monthlyRemaining === 0;

  const disabledMatcher = useMemo(() => {
    const unavailableSet = new Set((settings?.unavailableDates ?? []).map((u) => u.date));
    const allowedDays = new Set(settings?.availableDays ?? [1, 2, 3, 4, 5]);
    return (d: Date) => {
      const dOnly = new Date(d);
      dOnly.setHours(0, 0, 0, 0);
      if (dOnly < today0) return true;
      if (dOnly < monthStart || dOnly > monthEnd) return true;
      if (!allowedDays.has(dOnly.getDay())) return true;
      const key = format(d, "yyyy-MM-dd");
      if (unavailableSet.has(key)) return true;
      if (bookedDatesThisMonth.has(key)) return true;
      return false;
    };
  }, [settings, today0, monthStart, monthEnd, bookedDatesThisMonth]);

  useEffect(() => {
    if (date && disabledMatcher(date)) setDate(undefined);
  }, [disabledMatcher, date]);

  const amAvail = settings ? Math.max(0, settings.amSlots - taken.AM) : 0;
  const pmAvail = settings ? Math.max(0, settings.pmSlots - taken.PM) : 0;

  const submit = async () => {
    if (!user || !date || !period || !reason) {
      toast.error("Please pick a date, period, and reason.");
      return;
    }
    if (!privacy) {
      toast.error("Please agree to the Data Privacy notice.");
      return;
    }
    if (!profile?.studentNumber) {
      toast.error("Please complete your profile first.");
      router.navigate({ to: "/profile" });
      return;
    }
    if (bookedDatesThisMonth.has(dateKey)) {
      toast.error("You already have a booking on this day. Only 1 booking per day is allowed.");
      return;
    }
    if (reachedMonthlyLimit) {
      toast.error(`You've reached your monthly booking limit (${effectiveMonthlyLimit}).`);
      return;
    }

    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, "bookings"), {
        userId: user.uid,
        userEmail: user.email,
        userName: profile.fullName ?? user.displayName ?? "",
        fullName: profile.fullName ?? user.displayName ?? "",
        studentNumber: profile.studentNumber,
        photoUrl: photoUrl ?? user.photoURL ?? null,
        date: dateKey,
        period,
        reason,
        privacyAgreed: true,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Booking submitted (pending confirmation).");
      router.navigate({ to: "/receipt/$id", params: { id: docRef.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header Container */}
      <header className="border-b bg-background sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/tsu-logo.png" alt="TSU" className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full object-contain bg-white border" />
            <div className="min-w-0">
              <div className="font-semibold text-sm sm:text-base truncate">Scheduling System</div>
              <div className="text-xs text-muted-foreground truncate">
                Welcome, <span className="font-medium">{user?.displayName || user?.email}</span>
              </div>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="shrink-0"
            onClick={() => signOutUser().then(() => router.navigate({ to: "/login" }))}
          >
            <LogOut className="h-4 w-4 mr-2" /> 
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Main Responsive Grid Layout */}
      <main className="max-w-6xl mx-auto p-4 sm:p-6 grid gap-6 lg:grid-cols-[max-content_1fr] items-start">
        {/* Left Side: Calendar View */}
        <Card className="w-full lg:max-w-md mx-auto">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CalendarDays className="h-5 w-5 text-primary" /> Pick a date
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            {/* Prevent Calendar overflow boundaries on ultra-narrow screens */}
            <div className="w-full flex justify-center overflow-x-auto rounded-md border border-border/50 p-1 sm:p-2 bg-background/50">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={disabledMatcher}
                startMonth={monthStart}
                endMonth={monthEnd}
                defaultMonth={today0}
                className="pointer-events-auto"
              />
            </div>
            
            <div className="mt-4 rounded-md border bg-muted/50 p-3 text-xs space-y-2">
              <div>
                <span className="font-semibold text-foreground">This month only:</span>{" "}
                {format(monthStart, "MMMM yyyy")}. Other months open when the new month starts.
              </div>
              <div className="h-px bg-border/60" />
              <div>
                <span className="font-semibold text-foreground">Monthly limit:</span>{" "}
                <Badge variant="secondary" className="px-1.5 py-0 font-bold ml-1">
                  {activeThisMonth.length}/{effectiveMonthlyLimit}
                </Badge> used — <span className="font-medium text-primary">{monthlyRemaining} left.</span>
              </div>
              <div className="text-muted-foreground italic">1 booking per day maximum.</div>
            </div>

            {settings && settings.unavailableDates.some((u) => u.date.startsWith(currentMonthKey)) && (
              <div className="mt-4 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground mb-1.5">Unavailable dates this month</div>
                <ul className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2 bg-background/30">
                  {settings.unavailableDates
                    .filter((u) => u.date.startsWith(currentMonthKey))
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((u) => (
                      <li key={u.date} className="pb-1 last:pb-0 border-b last:border-0 border-border/40">
                        <span className="font-medium text-foreground">{u.date}</span> — <span className="text-muted-foreground">{u.reason}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Side: Configuration Blocks */}
        <div className="space-y-6 w-full">
          {/* Availability Block */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Available slots</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-4 sm:p-6 pt-0 sm:pt-0">
              {!date && <p className="text-sm text-muted-foreground">Select a date from the calendar to view slot availability.</p>}
              
              {date && settings && (
                <>
                  <div className="text-sm font-medium text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
                    Selected Day: {format(date, "EEEE, MMMM d, yyyy")}
                  </div>
                  
                  {unavailable ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                      <div className="font-semibold text-destructive">This date is unavailable</div>
                      <div className="text-muted-foreground mt-1">{unavailable.reason}</div>
                    </div>
                  ) : (
                    /* Slots grid adapts to single column layout on tight mobile ports */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SlotCard
                        label="AM (Morning)"
                        disabled={!settings.amEnabled || amAvail === 0}
                        available={amAvail}
                        total={settings.amSlots}
                        selected={period === "AM"}
                        onSelect={() => setPeriod("AM")}
                        hint={!settings.amEnabled ? "Closed" : undefined}
                      />
                      <SlotCard
                        label="PM (Afternoon)"
                        disabled={!settings.pmEnabled || pmAvail === 0}
                        available={pmAvail}
                        total={settings.pmSlots}
                        selected={period === "PM"}
                        onSelect={() => setPeriod("PM")}
                        hint={!settings.pmEnabled ? "Closed" : undefined}
                      />
                    </div>
                  )}

                  {!unavailable && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Reason</label>
                      <Select value={reason} onValueChange={setReason}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select a reason" /></SelectTrigger>
                        <SelectContent>
                          {settings.reasons.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {!unavailable && (
                    <label className="flex items-start gap-3 text-xs text-muted-foreground border rounded-md p-3 bg-background/40 cursor-pointer select-none">
                      <Checkbox checked={privacy} onCheckedChange={(v) => setPrivacy(!!v)} className="mt-0.5 shrink-0" />
                      <span className="leading-normal">
                        I agree that my personal information (Full Name, Student Number, Email) will be
                        collected and processed for the purpose of ID scheduling, in accordance with the
                        <strong> Data Privacy Act of 2012</strong>.
                      </span>
                    </label>
                  )}

                  {reachedMonthlyLimit && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                      You've reached your monthly booking limit ({effectiveMonthlyLimit}).
                      New bookings will be available next month.
                    </div>
                  )}
                  
                  <Button
                    className="w-full text-sm py-5"
                    size="lg"
                    disabled={submitting || !period || !reason || !privacy || !!unavailable || reachedMonthlyLimit}
                    onClick={submit}
                  >
                    {submitting ? "Booking…" : "Submit booking"}
                  </Button>
                </>
              )}
              
              <div className="text-xs text-muted-foreground pt-3 border-t border-dashed">
                After booking you'll get a printable receipt. Bookings start as <span className="font-medium text-foreground">Pending</span> until confirmed by an admin.
              </div>
            </CardContent>
          </Card>

          {/* Bookings Tracker Block */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <ReceiptIcon className="h-5 w-5 text-primary" /> My bookings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
              {myLoading ? (
                <Loader label="Fetching your bookings…" />
              ) : myBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">You have no bookings yet.</p>
              ) : (
                <div className="divide-y border rounded-md bg-background overflow-hidden">
                  {myBookings.map((b) => (
                    /* Content layouts break dynamically from column on mobile to row layout on desktop viewports */
                    <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 gap-3 hover:bg-muted/10 transition-colors">
                      <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium flex flex-wrap items-center gap-2">
                          <span>{b.date}</span>
                          <span className="text-muted-foreground/60 hidden sm:inline">•</span>
                          <span>{b.period}</span>
                          <StatusBadge status={b.status} />
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 truncate">
                          <span className="truncate max-w-[200px] sm:max-w-[320px]">{b.reason}</span> 
                          <span className="text-muted-foreground/40">•</span>
                          <code className="text-[10px] bg-muted px-1 py-0.5 rounded text-foreground">{b.id}</code>
                        </div>
                        {b.status === "rescheduled" && b.rescheduleNote && (
                          <div className="text-xs text-amber-700 bg-amber-50/60 border border-amber-200/50 rounded px-2 py-1 mt-1 font-medium">
                            Note: {b.rescheduleNote}
                          </div>
                        )}
                      </div>
                      <Button asChild size="sm" variant="outline" className="w-full sm:w-auto shrink-0 justify-center mt-1 sm:mt-0">
                        <Link to="/receipt/$id" params={{ id: b.id }}>View receipt</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = status || "pending";
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    confirmed: "bg-green-100 text-green-800 border-green-200",
    rescheduled: "bg-blue-100 text-blue-800 border-blue-200",
    cancelled: "bg-red-100 text-red-700 border-red-200",
    completed: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${map[s] ?? map.pending}`}>
      {s}
    </span>
  );
}

function SlotCard({
  label, available, total, selected, onSelect, disabled, hint,
}: {
  label: string; available: number; total: number; selected: boolean; onSelect: () => void; disabled?: boolean; hint?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`text-left rounded-lg border p-4 transition w-full flex flex-col justify-between min-h-[92px] ${
        selected ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-primary/50 bg-background"
      } ${disabled ? "opacity-50 cursor-not-allowed bg-muted/30" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <span className="font-semibold text-sm text-foreground">{label}</span>
        <Badge variant={available > 0 ? "secondary" : "outline"} className="shrink-0 font-medium">
          {hint ?? `${available}/${total} left`}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        {disabled ? "Not available" : available > 0 ? "Tap to select" : "Fully booked"}
      </div>
    </button>
  );
}