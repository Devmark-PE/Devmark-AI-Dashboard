"use client";

import { AlertTriangle, Check, CircleDashed, CircleHelp, Copy, Inbox, Loader2, X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import type { Status } from "@/lib/types";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Button                                                               */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]",
  secondary: "bg-surface-2 text-fg border border-line-strong hover:bg-surface-3",
  ghost: "text-fg-2 hover:text-fg hover:bg-surface-2",
  danger: "bg-critical/10 text-critical-text border border-critical/30 hover:bg-critical/20",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/* Card                                                                 */
/* ------------------------------------------------------------------ */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("min-w-0 rounded-xl border border-line bg-surface", className)}>{children}</section>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-fg-3">{description}</p>}
      </div>
      {action}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Badges de estado: color + icono + texto (nunca solo color)           */
/* ------------------------------------------------------------------ */

const STATUS_STYLE: Record<string, { dot: string; ring: string; text: string; label: string }> = {
  online: { dot: "bg-good", ring: "border-good/30 bg-good/10", text: "text-good-text", label: "Online" },
  active: { dot: "bg-good", ring: "border-good/30 bg-good/10", text: "text-good-text", label: "Activa" },
  success: { dot: "bg-good", ring: "border-good/30 bg-good/10", text: "text-good-text", label: "OK" },
  warning: { dot: "bg-warning", ring: "border-warning/30 bg-warning/10", text: "text-fg", label: "Atención" },
  expired: { dot: "bg-warning", ring: "border-warning/30 bg-warning/10", text: "text-fg", label: "Expirada" },
  offline: { dot: "bg-critical", ring: "border-critical/30 bg-critical/10", text: "text-critical-text", label: "Offline" },
  error: { dot: "bg-critical", ring: "border-critical/30 bg-critical/10", text: "text-critical-text", label: "Error" },
  revoked: { dot: "bg-critical", ring: "border-critical/30 bg-critical/10", text: "text-critical-text", label: "Revocada" },
  disabled: { dot: "bg-fg-3", ring: "border-line-strong bg-surface-2", text: "text-fg-2", label: "Deshabilitada" },
  unknown: { dot: "bg-fg-3", ring: "border-line-strong bg-surface-2", text: "text-fg-2", label: "Sin comprobar" },
  not_configured: { dot: "", ring: "border-line bg-transparent", text: "text-fg-3", label: "No configurado" },
};

export function StatusBadge({ status, label, className }: { status: Status | string; label?: string; className?: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.unknown;
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap", style.ring, style.text, className)}>
      {status === "not_configured" ? (
        <CircleDashed className="size-3" aria-hidden />
      ) : status === "unknown" ? (
        <CircleHelp className="size-3" aria-hidden />
      ) : (
        <span className={cx("size-1.5 rounded-full", style.dot)} aria-hidden />
      )}
      {label ?? style.label}
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-5 items-center rounded-md border border-line bg-surface-2 px-1.5 font-mono text-[11px] text-fg-2", className)}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Formularios                                                          */
/* ------------------------------------------------------------------ */

const fieldBase =
  "rounded-lg border border-line-strong bg-bg-subtle px-3 text-sm text-fg placeholder:text-fg-3 " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60";

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-fg-2">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-xs text-critical-text">{error}</p> : hint ? <p className="text-xs text-fg-3">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(fieldBase, "h-9", !className?.match(/\bw-/) && "w-full", className)} {...props} />;
});

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, "min-h-20 w-full py-2", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, !className?.match(/\bw-/) && "w-full", "h-9 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236d7382' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-bg-subtle p-3 hover:border-line-strong">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="block text-xs text-fg-3">{description}</span>}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Modal y ConfirmDialog                                                */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-line-strong bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        size === "lg" ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="animate-in">
          <header className="flex items-start justify-between gap-4 px-6 pt-5">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
            </div>
            {dismissible && (
              <button type="button" onClick={onClose} className="-mr-2 rounded-md p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Cerrar">
                <X className="size-4" />
              </button>
            )}
          </header>
          <div className="px-6 py-5">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line bg-surface-2/50 px-6 py-3.5">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-fg-2">{description}</div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Estados vacíos / carga / error                                       */
/* ------------------------------------------------------------------ */

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-fg-3">{icon ?? <Inbox className="size-5" />}</div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-fg-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Cargando…", rows = 0 }: { label?: string; rows?: number }) {
  if (rows > 0) {
    return (
      <div className="space-y-2 p-5" aria-busy="true" aria-label={label}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-sm text-fg-3" aria-busy="true">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid size-10 place-items-center rounded-xl border border-critical/30 bg-critical/10 text-critical-text">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-sm text-fg-2">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-[13px] text-critical-text" role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {message}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Copiar al portapapeles                                               */
/* ------------------------------------------------------------------ */

export function CopyButton({ value, label = "Copiar", className, variant = "secondary" }: { value: string; label?: string; className?: string; variant?: Variant }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <Button size="sm" variant={variant} onClick={copy} className={className} icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}>
      {copied ? "Copiado" : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Encabezado de página                                                 */
/* ------------------------------------------------------------------ */

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Selector segmentado (rangos de tiempo)                               */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg border border-line-strong bg-bg-subtle p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            "h-7 rounded-md px-3 text-[13px] font-medium transition-colors",
            value === option.value ? "bg-surface-3 text-fg shadow-sm" : "text-fg-3 hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
