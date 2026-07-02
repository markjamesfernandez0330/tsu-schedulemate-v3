import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, CheckCircle2, Clock, AlertCircle, XCircle, ShieldAlert } from "lucide-react";
import { Loader } from "@/components/loader";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/receipt/$id")({
  head: () => ({ meta: [{ title: "Booking receipt" }] }),
  component: ReceiptPage,
});

function ReceiptPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    const unsub = onSnapshot(doc(db, "bookings", id), (snap) => {
      if (snap.exists()) setData({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
    return () => unsub();
  }, [id, user, authLoading, navigate]);

  if (authLoading || loading) return <div className="min-h-screen flex items-center justify-center"><Loader label="Loading receipt…" /></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center">Receipt not found.</div>;

  const isOwner = !!user && (data.userId === user.uid || (data.userEmail && user.email && String(data.userEmail).toLowerCase() === user.email.toLowerCase()));
  const isAdmin = role === "admin";
  if (!isOwner && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="max-w-md w-full bg-white rounded-xl border shadow-sm p-8 text-center">
          <ShieldAlert className="h-12 w-12 text-red-600 mx-auto mb-3" />
          <h1 className="text-xl font-semibold mb-2">Not authorized</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This receipt is private. Only the student who created this booking or an admin can view it.
          </p>
          <Button asChild size="sm"><Link to="/">Go home</Link></Button>
        </div>
      </div>
    );
  }

  const createdAt = data.createdAt?.toDate?.() ?? new Date();
  const status: string = data.status || "pending";
  const statusMap: Record<string, { label: string; className: string; icon: any }> = {
    pending: { label: "Pending confirmation", className: "text-amber-700", icon: Clock },
    confirmed: { label: "Booking confirmed", className: "text-green-600", icon: CheckCircle2 },
    rescheduled: { label: "Rescheduled by admin", className: "text-blue-700", icon: AlertCircle },
    cancelled: { label: "Cancelled", className: "text-red-600", icon: XCircle },
    completed: { label: "Completed", className: "text-slate-700", icon: CheckCircle2 },
  };
  const st = statusMap[status] ?? statusMap.pending;
  const StIcon = st.icon;

  return (
    <div className="min-h-screen bg-muted/30 py-10 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex justify-between mb-4 print:hidden">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/book"><ArrowLeft className="h-4 w-4 mr-1" /> Book another</Link>
          </Button>
          <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Print receipt</Button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-8 print:shadow-none print:border-none">
       <div className="text-center border-b pb-4 mb-4">
            {data.photoUrl ? (
              // <img src={data.photoUrl} alt="" className="mx-auto h-16 w-16 rounded-full object-cover border" />
                 <img src="/tsu-logo.png" alt="TSU" className="mx-auto h-16 w-16 rounded-full object-cover border" />
            ) : (
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-lg">
                {(data.fullName || data.userName || data.userEmail || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className="text-xl font-semibold mt-2">Booking Receipt</h1>
            <p className="text-xs text-muted-foreground">TSU Scheduling System</p>
          </div>

          <div className={`flex items-center gap-2 mb-4 ${st.className}`}>
            <StIcon className="h-5 w-5" />
            <span className="font-medium">{st.label}</span>
          </div>
          {status === "rescheduled" && data.rescheduleNote && (
            <div className="mb-4 text-sm rounded border border-blue-200 bg-blue-50 text-blue-800 p-3">
              <div className="font-medium">Admin note</div>
              <div>{data.rescheduleNote}</div>
            </div>
          )}

          <dl className="grid grid-cols-3 gap-y-3 text-sm">
            <Row label="Booking ID" value={<code className="text-xs">{data.id}</code>} />
            <Row label="Status" value={<span className="uppercase text-xs">{status}</span>} />
            <Row label="Full Name" value={data.fullName || data.userName || "—"} />
            <Row label="Student Number" value={data.studentNumber || "—"} />
            <Row label="Email" value={data.userEmail} />
            <Row label="Date" value={data.date} />
            <Row label="Period" value={data.period === "AM" ? "AM (Morning)" : "PM (Afternoon)"} />
            <Row label="Purpose" value={data.reason} />
            <Row label="Issued" value={createdAt.toLocaleString()} />
          </dl>

          <div className="mt-6 pt-4 border-t flex items-end justify-between gap-4">
            <div className="text-xs text-muted-foreground max-w-[60%]">
              Please present this receipt on your scheduled date. Contact the admin office for changes.
            </div>
            <QrPlaceholder id={data.id} />
          </div>
        </div>
      </div>
    </div>
  );
}


function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="col-span-1 text-muted-foreground">{label}</dt>
      <dd className="col-span-2 font-medium break-all">{value}</dd>
    </>
  );
}

function QrPlaceholder({ id }: { id: string }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/receipt/${id}` : `/receipt/${id}`;
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={url}>
      <img src={src} alt="Scan to view receipt" className="h-24 w-24 rounded border" />
    </a>
  );
}