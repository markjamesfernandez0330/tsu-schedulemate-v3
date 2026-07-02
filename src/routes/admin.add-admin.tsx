import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { DEFAULT_ADMIN_EMAIL } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/admin/add-admin")({
  component: AddAdmin,
});

function AddAdmin() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [admins, setAdmins] = useState<any[]>([]);

  const load = async () => {
    const snap = await getDocs(collection(db, "admins"));
    setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    try {
      await setDoc(doc(db, "admins", e), { email: e, addedBy: user?.email ?? "unknown", createdAt: serverTimestamp() });
      toast.success(`${e} added as admin`);
      setEmail("");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    }
  };

  const remove = async (id: string) => {
    if (id.trim().toLowerCase() === DEFAULT_ADMIN_EMAIL) {
      toast.error("The default admin cannot be removed.");
      return;
    }
    await deleteDoc(doc(db, "admins", id));
    toast.success("Admin removed");
    load();
  };


  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Add Admin</h1>
        <p className="text-sm text-muted-foreground">Grant admin access by email. They become admin on their next sign-in.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>New admin</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input type="email" placeholder="name@tsu.edu.ph" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={add}>Add admin</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Existing admins</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {admins.map((a) => {
            const isDefault = String(a.id).toLowerCase() === DEFAULT_ADMIN_EMAIL;
            return (
              <div key={a.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {a.email}
                    {isDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/20">
                        <ShieldCheck className="h-3 w-3" /> Default admin
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">Added by {a.addedBy}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isDefault}
                  title={isDefault ? "The default admin cannot be removed." : "Remove admin"}
                  onClick={() => remove(a.id)}
                >
                  <Trash2 className={`h-4 w-4 ${isDefault ? "text-muted-foreground" : "text-destructive"}`} />
                </Button>
              </div>
            );
          })}

          {admins.length === 0 && <div className="text-sm text-muted-foreground py-4">No admins yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
}