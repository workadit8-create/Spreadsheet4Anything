"use client";

import { Label, Select } from "@/components/ui/Input";
import type { OutletOption } from "@/lib/outlets/bootstrap-options";
import { OUTLET_PUSAT_CODE } from "@/lib/outlets/constants";

export function OutletSelect({
  enabled = true,
  options,
  value,
  onChange,
  className,
  required,
  allowPusat = true,
  label = "Outlet"
}: {
  enabled?: boolean;
  options: OutletOption[];
  value: string;
  onChange: (outletCode: string) => void;
  className?: string;
  required?: boolean;
  allowPusat?: boolean;
  label?: string;
}) {
  if (!enabled) return null;

  return (
    <div className={className}>
      <Label>
        {label}
        {required ? " *" : " (opsional)"}
      </Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        {!required ? <option value="">— {allowPusat ? "pusat / umum" : "pilih outlet"} —</option> : null}
        {allowPusat ? (
          <option value={OUTLET_PUSAT_CODE}>
            PUSAT — Umum / Pusat
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.outletCode} value={o.outletCode}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
