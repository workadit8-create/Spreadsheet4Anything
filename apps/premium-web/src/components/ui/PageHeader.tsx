export function PageHeader({
  badge,
  title,
  description,
  children
}: {
  badge?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        {badge && (
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-600">{badge}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </header>
  );
}
