import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarCheck, Sun, Moon } from "lucide-react";
import { Loader } from "@/components/loader";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function Dashboard() {
  const [stats, setStats] = useState({ total: 0, today: 0, am: 0, pm: 0, users: 0 });
  const [all, setAll] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  // 0-11; default current month
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  useEffect(() => {
    (async () => {
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const [allB, todayB, usersSnap] = await Promise.all([
          getDocs(collection(db, "bookings")),
          getDocs(query(collection(db, "bookings"), where("date", "==", today))),
          getDocs(collection(db, "users")),
        ]);
        let am = 0, pm = 0;
        todayB.forEach((d) => { if (d.data().period === "AM") am++; else pm++; });
        setStats({ total: allB.size, today: todayB.size, am, pm, users: usersSnap.size });
        setAll(allB.docs.map((d) => ({ id: d.id, ...d.data() })));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const years = useMemo(() => {
    const set = new Set<number>();
    set.add(now.getFullYear());
    for (const b of all) {
      const y = parseInt((b.date ?? "").slice(0, 4), 10);
      if (!isNaN(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [all, now]);

  const chartData = useMemo(() => {
    const buckets = MONTHS.map((label, idx) => ({
      key: `${year}-${String(idx + 1).padStart(2, "0")}`,
      label: label.slice(0, 3),
      monthIndex: idx,
      count: 0,
    }));
    for (const b of all) {
      const d = b.date ?? "";
      if (d.slice(0, 4) !== String(year)) continue;
      const m = parseInt(d.slice(5, 7), 10) - 1;
      if (m >= 0 && m < 12) buckets[m].count++;
    }
    return buckets;
  }, [all, year]);

  const monthBookings = useMemo(() => {
    const ym = `${year}-${String(selectedMonth + 1).padStart(2, "0")}`;
    return all
      .filter((b) => (b.date ?? "").startsWith(ym))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [all, year, selectedMonth]);

  const totalPages = Math.max(1, Math.ceil(monthBookings.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = monthBookings.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  useEffect(() => { setPage(1); }, [year, selectedMonth]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of bookings and activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat icon={<CalendarCheck className="h-5 w-5" />} label="Total bookings" value={stats.total} />
        <Stat icon={<CalendarCheck className="h-5 w-5" />} label="Today" value={stats.today} />
        <Stat icon={<Sun className="h-5 w-5" />} label="AM today" value={stats.am} />
        <Stat icon={<Moon className="h-5 w-5" />} label="PM today" value={stats.pm} />
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>Bookings per month</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Year</span>
            <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader label="Loading chart…" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    fill="var(--primary)"
                    onClick={(data: any) => {
                      if (typeof data?.monthIndex === "number") setSelectedMonth(data.monthIndex);
                    }}
                    cursor="pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Tip: click a bar to view that month's bookings below.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>
            Bookings — {MONTHS[selectedMonth]} {year}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Month</span>
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v, 10))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader label="Fetching bookings…" />
          ) : monthBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings for this month.</p>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Period</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.userName || b.userEmail}</TableCell>
                        <TableCell className="max-w-[240px] truncate">{b.reason}</TableCell>
                        <TableCell>{b.date}</TableCell>
                        <TableCell>{b.period}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between mt-3 text-sm">
                <div className="text-muted-foreground">
                  Page {currentPage} of {totalPages} · {monthBookings.length} record{monthBookings.length === 1 ? "" : "s"}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
