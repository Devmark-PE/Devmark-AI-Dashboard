import type { ReactNode } from "react";

import { cx } from "./index";

/** Stat tile: etiqueta · valor · detalle opcional. */
export function StatCard({ label, value, detail, icon, className }: { label: string; value: ReactNode; detail?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface px-5 py-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-fg-3">{label}</p>
        {icon && <span className="text-fg-3">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-fg">{value}</p>
      {detail && <p className="mt-1 text-xs text-fg-3">{detail}</p>}
    </div>
  );
}
