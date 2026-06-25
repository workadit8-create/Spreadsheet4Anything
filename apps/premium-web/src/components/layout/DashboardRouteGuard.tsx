"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { canAccessDashboardPath, type MembershipRole } from "@/lib/org/roles";

export function DashboardRouteGuard({
  role,
  children
}: {
  role: MembershipRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!canAccessDashboardPath(role, pathname)) {
      router.replace("/dashboard");
    }
  }, [role, pathname, router]);

  if (!canAccessDashboardPath(role, pathname)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Memuat…
      </div>
    );
  }

  return <>{children}</>;
}
