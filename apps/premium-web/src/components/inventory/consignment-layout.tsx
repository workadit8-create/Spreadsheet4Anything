import { Card } from "@/components/ui/Card";

export function ConsignmentPageShell({
  children,
  wide = false
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main className={`mx-auto px-4 py-8 sm:px-6 ${wide ? "max-w-7xl" : "max-w-5xl"}`}>
      {children}
    </main>
  );
}

export function ConsignmentFormCard({ children }: { children: React.ReactNode }) {
  return <Card className="p-6 sm:p-8">{children}</Card>;
}

/** Shared spacing for titip jual forms */
export const consignmentFormClass = "space-y-6";
export const consignmentFieldGridClass = "grid gap-x-6 gap-y-5 sm:grid-cols-2";
export const consignmentLineCardClass =
  "grid gap-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4 sm:p-5 sm:grid-cols-4";
export const consignmentLineCardReturnClass =
  "grid gap-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4 sm:p-5 sm:grid-cols-3";
export const consignmentHintClass =
  "rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600";
export const consignmentSectionClass = "space-y-4 border-t border-slate-100 pt-6";
export const consignmentActionsClass =
  "flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6";
