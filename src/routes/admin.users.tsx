import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/loader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSettings, saveSettings, defaultSettings, type AppSettings } from "@/lib/settings";
import { toast } from "sonner";
import { Search, Save } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});

function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [savingLimit, setSavingLimit] = useState(false);
  const [globalLimitDraft, setGlobalLimitDraft] = useState<number>(defaultSettings.monthlyLimit);

  const reload = async () => {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    (async () => {
      try {
        await reload();
        const s = await getSettings();
        setSettings(s);
        setGlobalLimitDraft(s.monthlyLimit);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filter = (list: any[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) =>
      [u.displayName, u.fullName, u.email, u.studentNumber, u.role]
        .some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  };

  const students = useMemo(() => filter(users.filter((u) => u.role !== "admin")), [users, search]);
  const admins = useMemo(() => filter(users.filter((u) => u.role === "admin")), [users, search]);

  const saveGlobalLimit = async () => {
    setSavingLimit(true);
    try {
      const next = { ...settings, monthlyLimit: Math.max(0, Number(globalLimitDraft) || 0) };
      await saveSettings(next);
      setSettings(next);
      toast.success(`Default monthly limit set to ${next.monthlyLimit}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSavingLimit(false);
    }
  };

  const setUserLimit = async (id: string, value: number | null) => {
    try {
      await updateDoc(doc(db, "users", id), { monthlyLimit: value });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, monthlyLimit: value } : u)));
      toast.success("Updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">Registered accounts by role.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-64">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search name, email, student #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Default monthly booking limit</label>
            <Input
              type="number"
              min={0}
              className="w-24"
              value={globalLimitDraft}
              onChange={(e) => setGlobalLimitDraft(Number(e.target.value))}
            />
            <Button size="sm" onClick={saveGlobalLimit} disabled={savingLimit}>
              <Save className="h-4 w-4 mr-1" /> {savingLimit ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="p-0"><Loader label="Fetching users…" /></CardContent></Card>
      ) : (
        <Tabs defaultValue="students">
          <TabsList>
            <TabsTrigger value="students">Students ({students.length})</TabsTrigger>
            <TabsTrigger value="admins">Admins ({admins.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="students">
            <StudentTable rows={students} globalLimit={settings.monthlyLimit} onSetLimit={setUserLimit} />
          </TabsContent>
          <TabsContent value="admins">
            <UserTable rows={admins} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function UserTable({ rows }: { rows: any[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.displayName || u.fullName || "—"}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">No users.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StudentTable({
  rows,
  globalLimit,
  onSetLimit,
}: {
  rows: any[];
  globalLimit: number;
  onSetLimit: (id: string, value: number | null) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Student #</TableHead>
              <TableHead className="w-56">Monthly limit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <StudentRow key={u.id} user={u} globalLimit={globalLimit} onSetLimit={onSetLimit} />
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">No students.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StudentRow({
  user,
  globalLimit,
  onSetLimit,
}: {
  user: any;
  globalLimit: number;
  onSetLimit: (id: string, value: number | null) => void;
}) {
  const hasOverride = typeof user.monthlyLimit === "number";
  const [draft, setDraft] = useState<string>(hasOverride ? String(user.monthlyLimit) : "");

  return (
    <TableRow>
      <TableCell>{user.displayName || user.fullName || "—"}</TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell className="font-mono text-xs">{user.studentNumber || "—"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            className="w-20"
            placeholder={String(globalLimit)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSetLimit(user.id, draft === "" ? null : Math.max(0, Number(draft) || 0))}
          >
            Save
          </Button>
          {hasOverride && (
            <Button size="sm" variant="ghost" onClick={() => { setDraft(""); onSetLimit(user.id, null); }}>
              Reset
            </Button>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          {hasOverride ? `Override: ${user.monthlyLimit}` : `Uses default (${globalLimit})`}
        </div>
      </TableCell>
    </TableRow>
  );
}
