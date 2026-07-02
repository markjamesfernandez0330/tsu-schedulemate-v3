import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TSU Scheduling System" },
      { name: "description", content: "Sign in to book or manage schedules." },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.navigate({ to: "/login" });
    } else if (role === "admin") {
      router.navigate({ to: "/admin" });
    } else {
      router.navigate({ to: "/book" });
    }
  }, [user, role, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Loading…
    </div>
  );
}
