export function Card({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200/80 bg-white p-5 shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </section>
  );
}
