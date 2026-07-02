import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader } from "@/components/loader";
import { format } from "date-fns";


export const Route = createFileRoute("/admin/bookings")({
  component: BookingsPage,
});

const STATUSES = ["pending", "confirmed", "rescheduled", "cancelled", "completed"] as const;

function BookingsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);


  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "bookings"), orderBy("createdAt", "desc")), (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && (r.status || "pending") !== statusFilter) return false;
      if (from && (r.date || "") < from) return false;
      if (to && (r.date || "") > to) return false;
      if (!f) return true;
      return [r.fullName, r.userName, r.userEmail, r.studentNumber, r.reason, r.date]
        .some((v) => String(v ?? "").toLowerCase().includes(f));
    });
  }, [rows, filter, statusFilter, from, to]);

  const setStatus = async (id: string, status: string, extra: Record<string, any> = {}) => {
    try {
      await updateDoc(doc(db, "bookings", id), {
        status,
        updatedAt: serverTimestamp(),
        processedBy: user?.email ?? null,
        processedAt: serverTimestamp(),
        ...extra,
      });
      toast.success(`Marked ${status}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <p className="text-sm text-muted-foreground">Confirm, reschedule, or cancel student bookings.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex gap-3 flex-wrap items-center">
          <Input className="max-w-xs" placeholder="Search name, student #, email…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground block">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            {(from || to) && (
              <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Clear</Button>
            )}
          </div>
          <div className="text-sm text-muted-foreground">{filtered.length} record(s)</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Student #</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Processed By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.period}</TableCell>
                  <TableCell className="font-mono text-xs">{r.studentNumber || "—"}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.fullName || r.userName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.userEmail}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.reason}</TableCell>
                  <TableCell>
                    <span className="text-xs uppercase font-medium">{r.status || "pending"}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.processedBy || "—"}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/receipt/$id" params={{ id: r.id }} target="_blank">View receipt</Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "confirmed")}>Confirm</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "completed")}>Completed</Button>
                    <RescheduleDialog booking={r} onSave={(patch) => setStatus(r.id, "rescheduled", patch)} />
                    <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "cancelled")}>Cancel</Button>
                  </TableCell>
                </TableRow>
              ))}
              {loading && (
                <TableRow><TableCell colSpan={8} className="py-2"><Loader label="Fetching bookings…" /></TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No bookings.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function RescheduleDialog({ booking, onSave }: { booking: any; onSave: (patch: Record<string, any>) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>(booking.date ?? "");
  const [period, setPeriod] = useState<string>(booking.period ?? "AM");
  const [note, setNote] = useState<string>("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Reschedule</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reschedule booking</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">New date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Period</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Reason / note (shown to student)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Emergency — moved to next available date." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          <Button
            onClick={() => {
              onSave({ date, period, rescheduleNote: note });
              setOpen(false);
            }}
          >
            Save reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}