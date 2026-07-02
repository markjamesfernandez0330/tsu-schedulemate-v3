import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Complete your profile" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/login" });
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      const d = snap.data();
      setFullName(d?.fullName || user.displayName || "");
      setStudentNumber(d?.studentNumber || "");
      setHydrating(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    const sn = studentNumber.trim();
    const fn = fullName.trim();
    if (!fn) return toast.error("Please enter your full name.");
    if (!/^\d{6,12}$/.test(sn)) return toast.error("Enter a valid Student Number (digits only).");
    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { fullName: fn, studentNumber: sn, displayName: fn, updatedAt: serverTimestamp() },
        { merge: true },
      );
      toast.success("Profile saved");
      router.navigate({ to: "/book" });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading || hydrating) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete your profile</CardTitle>
          <p className="text-sm text-muted-foreground">We need your Student Number before booking.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Full Name</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Dela Cruz" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Student Number</label>
            <Input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value.replace(/\D/g, ""))} placeholder="2022200110" />
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}