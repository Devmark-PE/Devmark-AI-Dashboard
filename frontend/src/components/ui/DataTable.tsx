"use client";

import type { ReactNode } from "react";

import { cx } from "./index";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** Oculta la columna en pantallas pequeñas. */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  dense?: boolean;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="scrollbar-thin relative overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cx(
                  "px-5 py-2.5 text-xs font-medium whitespace-nowrap text-fg-3",
                  col.align === "right" ? "text-right" : "text-left",
                  col.hideOnMobile && "hidden md:table-cell",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cx(
                "border-b border-line last:border-0 transition-colors",
                onRowClick && "cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx(
                    "px-5 align-middle text-fg-2",
                    dense ? "py-2" : "py-3",
                    col.align === "right" ? "text-right tabular" : "text-left",
                    col.hideOnMobile && "hidden md:table-cell",
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
