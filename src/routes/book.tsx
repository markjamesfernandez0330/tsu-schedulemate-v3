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

  // Load student profile; redirect to /profile if student number missing
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


  // Realtime settings subscription so unavailable dates / slots update live
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "config"), (snap) => {
      if (snap.exists()) setSettings({ ...defaultSettings, ...(snap.data() as Partial<AppSettings>) });
      else setSettings(defaultSettings);
    });
    return () => unsub();
  }, []);

  // Realtime list of the student's own bookings
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

  // Realtime slot counts for the selected date
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

  // Current month boundaries — book only allows the current calendar month
  const today0 = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const monthStart = useMemo(() => startOfMonth(today0), [today0]);
  const monthEnd = useMemo(() => endOfMonth(today0), [today0]);
  const currentMonthKey = format(today0, "yyyy-MM");

  // Bookings the student already has this month (excludes cancelled) and set of
  // dates already booked (for the 1-per-day rule).
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

  // Disabled dates for the calendar: past dates, dates outside the current
  // month, admin-marked unavailable dates, and dates the student already booked.
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

  // Clear a selected date if it becomes unavailable (realtime)
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
      <header className="border-b bg-background">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src="/tsu-logo.png" alt="TSU" className="h-10 w-10 rounded-full object-contain bg-white border" />
            <div>
              <div className="font-semibold">Scheduling System</div>
              <div className="text-xs text-muted-foreground">Welcome, {user?.displayName || user?.email}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => signOutUser().then(() => router.navigate({ to: "/login" }))}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Pick a date</CardTitle>
          </CardHeader>
          <CardContent>
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
            <div className="mt-3 rounded-md border bg-muted/50 p-3 text-xs space-y-1">
              <div>
                <span className="font-medium">This month only:</span>{" "}
                {format(monthStart, "MMMM yyyy")}. Other months open when the new month starts.
              </div>
              <div>
                <span className="font-medium">Monthly limit:</span>{" "}
                {activeThisMonth.length}/{effectiveMonthlyLimit} used — {monthlyRemaining} left.
              </div>
              <div className="text-muted-foreground">1 booking per day maximum.</div>
            </div>

            {settings && settings.unavailableDates.some((u) => u.date.startsWith(currentMonthKey)) && (
              <div className="mt-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground mb-1">Unavailable dates this month</div>
                <ul className="space-y-0.5 max-h-32 overflow-auto">
                  {settings.unavailableDates
                    .filter((u) => u.date.startsWith(currentMonthKey))
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((u) => (
                      <li key={u.date}>
                        <span className="font-medium">{u.date}</span> — {u.reason}
                      </li>
                    ))}
                </ul>
              </div>
            )}

          </CardContent>
        </Card>

        <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Available slots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!date && <p className="text-sm text-muted-foreground">Select a date to see availability.</p>}
            {date && settings && (
              <>
                <div className="text-sm text-muted-foreground">
                  {format(date, "EEEE, MMMM d, yyyy")}
                </div>
                {unavailable ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                    <div className="font-medium text-destructive">This date is unavailable</div>
                    <div className="text-muted-foreground mt-1">{unavailable.reason}</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
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
                      <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                      <SelectContent>
                        {settings.reasons.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {!unavailable && (
                  <label className="flex items-start gap-2 text-xs text-muted-foreground border rounded-md p-3">
                    <Checkbox checked={privacy} onCheckedChange={(v) => setPrivacy(!!v)} className="mt-0.5" />
                    <span>
                      I agree that my personal information (Full Name, Student Number, Email) will be
                      collected and processed for the purpose of ID scheduling, in accordance with the
                      Data Privacy Act of 2012.
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
                  className="w-full"
                  size="lg"
                  disabled={submitting || !period || !reason || !privacy || !!unavailable || reachedMonthlyLimit}
                  onClick={submit}
                >
                  {submitting ? "Booking…" : "Submit booking"}
                </Button>

              </>
            )}
            <div className="text-xs text-muted-foreground pt-2 border-t">
              After booking you'll get a printable receipt. Bookings start as <span className="font-medium">Pending</span> until confirmed by an admin.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ReceiptIcon className="h-4 w-4" /> My bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {myLoading ? (
              <Loader label="Fetching your bookings…" />
            ) : myBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no bookings yet.</p>
            ) : (
              <div className="divide-y border rounded-md">
                {myBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-3 gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {b.date} · {b.period}
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{b.reason} · <code className="text-[10px]">{b.id}</code></div>
                      {b.status === "rescheduled" && b.rescheduleNote && (
                        <div className="text-xs text-amber-700 mt-0.5">Note: {b.rescheduleNote}</div>
                      )}
                    </div>
                    <Button asChild size="sm" variant="outline">
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
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${map[s] ?? map.pending}`}>
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
      className={`text-left rounded-lg border p-4 transition ${
        selected ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-primary/50"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <Badge variant={available > 0 ? "secondary" : "outline"}>{hint ?? `${available}/${total} left`}</Badge>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {disabled ? "Not available" : available > 0 ? "Tap to select" : "Fully booked"}
      </div>
    </button>
  );
}