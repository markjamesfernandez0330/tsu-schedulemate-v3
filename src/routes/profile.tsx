import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Complete your profile" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [noMiddleName, setNoMiddleName] = useState(false);
  const [idNumber, setIdNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  const email = user?.email ?? "";
  const isEmployee = useMemo(() => {
    const e = email.toLowerCase();
    return e.endsWith("@tsu.edu.ph") && !e.endsWith("@student.tsu.edu.ph");
  }, [email]);

  const idLabel = isEmployee ? "Employee Number" : "Student Number";
  const idPlaceholder = isEmployee ? "00-00000" : "0000000000";
  const idHelper = isEmployee
    ? "Format: 2 digits, dash, 5 digits (e.g. 12-34567)"
    : "10 digits (e.g. 2018300330)";

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/login" });
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      const d = snap.data() as any;
      if (d?.firstName || d?.lastName) {
        setFirstName(d.firstName || "");
        setMiddleName(d.middleName || "");
        setLastName(d.lastName || "");
        setNoMiddleName(!!d.noMiddleName);
      } else {
        // Fallback: split legacy fullName / displayName
        const parts = ((d?.fullName as string) || user.displayName || "").trim().split(/\s+/);
        if (parts.length === 1) {
          setFirstName(parts[0] ?? "");
        } else if (parts.length === 2) {
          setFirstName(parts[0]);
          setLastName(parts[1]);
        } else if (parts.length >= 3) {
          setFirstName(parts[0]);
          setLastName(parts[parts.length - 1]);
          setMiddleName(parts.slice(1, -1).join(" "));
        }
      }
      setIdNumber(d?.studentNumber || d?.idNumber || "");
      setHydrating(false);
    })();
  }, [user]);

  const handleIdChange = (v: string) => {
    if (isEmployee) {
      // Keep digits only, auto-insert dash after 2 digits, max 7 digits
      const digits = v.replace(/\D/g, "").slice(0, 7);
      setIdNumber(digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits);
    } else {
      setIdNumber(v.replace(/\D/g, "").slice(0, 10));
    }
  };

  const save = async () => {
    if (!user) return;
    const fn = firstName.trim();
    const mn = noMiddleName ? "" : middleName.trim();
    const ln = lastName.trim();
    const id = idNumber.trim();

    if (!fn) return toast.error("Please enter your first name.");
    if (!ln) return toast.error("Please enter your last name.");
    if (!noMiddleName && !mn) {
      return toast.error("Enter your middle name or tick 'No middle name'.");
    }

    if (isEmployee) {
      if (!/^\d{2}-\d{5}$/.test(id)) {
        return toast.error("Enter a valid Employee Number (format 00-00000).");
      }
    } else {
      if (!/^\d{10}$/.test(id)) {
        return toast.error("Enter a valid Student Number (10 digits).");
      }
    }

    const fullName = [fn, mn, ln].filter(Boolean).join(" ");

    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          firstName: fn,
          middleName: mn,
          lastName: ln,
          noMiddleName,
          fullName,
          displayName: fullName,
          studentNumber: id,
          idNumber: id,
          idType: isEmployee ? "employee" : "student",
          updatedAt: serverTimestamp(),
        },
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
          <p className="text-sm text-muted-foreground">
            We need your {idLabel.toLowerCase()} before booking.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <Input value={email} disabled />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">First Name</label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Juan" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                Middle Name {noMiddleName && <span className="italic">(none)</span>}
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={noMiddleName}
                  onCheckedChange={(v) => {
                    const on = !!v;
                    setNoMiddleName(on);
                    if (on) setMiddleName("");
                  }}
                />
                No middle name
              </label>
            </div>
            <Input
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              placeholder="Fernandez"
              disabled={noMiddleName}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Last Name</label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dela Cruz" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{idLabel}</label>
            <Input
              value={idNumber}
              onChange={(e) => handleIdChange(e.target.value)}
              placeholder={idPlaceholder}
              inputMode="numeric"
            />
            <p className="text-[11px] text-muted-foreground mt-1">{idHelper}</p>
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
