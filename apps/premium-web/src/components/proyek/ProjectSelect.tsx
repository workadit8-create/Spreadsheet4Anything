"use client";

import { Label, Select } from "@/components/ui/Input";
import type { ProjectOption } from "@/lib/proyek/bootstrap-options";

export function ProjectSelect({
  options,
  value,
  onChange,
  className
}: {
  options: ProjectOption[];
  value: string;
  onChange: (projectCode: string) => void;
  className?: string;
}) {
  if (!options.length) return null;

  return (
    <div className={className}>
      <Label>Proyek event (opsional)</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— tanpa proyek —</option>
        {options.map((o) => (
          <option key={o.projectCode} value={o.projectCode}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
