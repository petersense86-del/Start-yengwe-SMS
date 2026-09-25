import { type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode, useEffect, useId, useRef } from "react";
import { twMerge } from "tailwind-merge";
import clsx from "clsx";
import { Inbox, Loader2, X } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost" | "gold";

export function Button({ className, variant = "primary", loading = false, disabled, children, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm focus-visible:ring-emerald-500",
    secondary: "bg-gray-100 hover:bg-gray-200 text-gray-800 focus-visible:ring-gray-400",
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm focus-visible:ring-red-500",
    success: "bg-green-600 hover:bg-green-700 text-white shadow-sm focus-visible:ring-green-500",
    ghost: "bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 focus-visible:ring-gray-400",
    gold: "bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white shadow-sm focus-visible:ring-amber-500",
  };
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={twMerge(
        clsx(
          "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap",
          "transition-all duration-150 active:scale-[0.98] select-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          variants[variant]
        ),
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const fieldBase =
  "w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 shadow-sm " +
  "transition-colors outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 " +
  "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">{children}</label>;
}

export function Input({ label, error, hint, className, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string }) {
  const autoId = useId();
  const inputId = id || autoId;
  // Layout classes (grid span, flex grow) belong on the wrapper, the rest on the input.
  const classes = (className || "").split(/\s+/).filter(Boolean);
  const isLayout = (c: string) => /(^|:)(col-span|flex-1|w-full)/.test(c);
  return (
    <div className={twMerge("flex flex-col gap-1.5 min-w-0", classes.filter(isLayout).join(" "))}>
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <input
        id={inputId}
        aria-invalid={!!error || undefined}
        aria-describedby={error || hint ? `${inputId}-msg` : undefined}
        className={twMerge(fieldBase, error && "border-red-500 focus:border-red-500 focus:ring-red-200", classes.filter((c) => !isLayout(c)).join(" "))}
        {...props}
      />
      {(error || hint) && <span id={`${inputId}-msg`} className={clsx("text-xs", error ? "text-red-600" : "text-gray-500")}>{error || hint}</span>}
    </div>
  );
}

export function Select({ label, children, className, id, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={selectId}>{label}</FieldLabel>}
      <select id={selectId} className={twMerge(fieldBase, "pr-8 cursor-pointer", className)} {...props}>
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, className, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const autoId = useId();
  const textareaId = id || autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={textareaId}>{label}</FieldLabel>}
      <textarea id={textareaId} className={twMerge(fieldBase, "resize-y min-h-[80px]", className)} {...props} />
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={twMerge("bg-white rounded-xl shadow-sm ring-1 ring-gray-900/5 p-4 sm:p-5", className)}>{children}</div>
  );
}

export function Modal({ open, onClose, title, children, size = "md" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const sizeCls = { sm: "sm:max-w-md", md: "sm:max-w-2xl", lg: "sm:max-w-4xl", xl: "sm:max-w-6xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-gray-950/50 backdrop-blur-[2px] animate-overlayIn" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={twMerge("bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none animate-modalIn", sizeCls)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-10">
          <h2 id={titleId} className="text-base sm:text-lg font-semibold text-gray-900 truncate">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, color = "gray", pulse = false, className }: { children: ReactNode; color?: "green" | "red" | "yellow" | "gray" | "blue" | "emerald"; pulse?: boolean; className?: string }) {
  const colors = {
    green: "bg-green-50 text-green-800 ring-green-600/20",
    red: "bg-red-50 text-red-800 ring-red-600/20",
    yellow: "bg-yellow-50 text-yellow-800 ring-yellow-600/25",
    gray: "bg-gray-50 text-gray-700 ring-gray-500/20",
    blue: "bg-blue-50 text-blue-800 ring-blue-600/20",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  };
  const dot = { green: "bg-green-500", red: "bg-red-500", yellow: "bg-yellow-500", blue: "bg-blue-500", emerald: "bg-emerald-500", gray: "bg-gray-400" };
  return (
    <span className={twMerge(clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset whitespace-nowrap", colors[color]), className)}>
      {pulse && (
        <span className="relative flex w-2 h-2">
          <span className={twMerge("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", dot[color])} />
          <span className={twMerge("relative inline-flex w-2 h-2 rounded-full", dot[color])} />
        </span>
      )}
      {children}
    </span>
  );
}

export function StatusLight({ color, size = "md" }: { color: "red" | "yellow" | "green" | "gray"; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-3 h-3", md: "w-5 h-5", lg: "w-8 h-8" };
  const colorMap = {
    red: "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]",
    yellow: "bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.8)]",
    green: "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)]",
    gray: "bg-gray-400",
  };
  return (
    <span role="img" aria-label={`Status: ${color}`} className={twMerge(clsx("rounded-full inline-block flex-shrink-0", sizes[size], colorMap[color]))} />
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 sm:rounded-lg ring-1 ring-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50/80">
          <tr>
            {headers.map((h, i) => (
              <th key={`${h}-${i}`} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ message, icon, action }: { message: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mb-3">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <p className="text-sm text-gray-500 max-w-sm">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2 flex-shrink-0">{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={twMerge("w-5 h-5 animate-spin text-emerald-700", className)} aria-label="Loading" />;
}

export function Avatar({ name, src, size = "md", className }: { name: string; src?: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-16 h-16 text-xl", xl: "w-28 h-28 text-4xl" };
  const initials = name.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  if (src) return <img src={src} alt="" className={twMerge("rounded-full object-cover flex-shrink-0", sizes[size], className)} />;
  return (
    <div aria-hidden className={twMerge("rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-white font-semibold flex items-center justify-center flex-shrink-0", sizes[size], className)}>
      {initials}
    </div>
  );
}

/** Small text-style action used in table rows. */
export function RowAction({ onClick, children, tone = "default" }: { onClick: () => void; children: ReactNode; tone?: "default" | "primary" | "warn" | "danger" | "success" }) {
  const tones = {
    default: "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
    primary: "text-blue-700 hover:text-blue-900 hover:bg-blue-50",
    warn: "text-amber-700 hover:text-amber-900 hover:bg-amber-50",
    danger: "text-red-600 hover:text-red-800 hover:bg-red-50",
    success: "text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50",
  };
  return (
    <button type="button" onClick={onClick} className={twMerge("px-2 py-1 rounded-md text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", tones[tone])}>
      {children}
    </button>
  );
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "success" | "warning" | "error"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-blue-50 text-blue-900 ring-blue-200",
    success: "bg-green-50 text-green-900 ring-green-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
    error: "bg-red-50 text-red-800 ring-red-200",
  };
  return <div role={tone === "error" ? "alert" : "status"} className={twMerge("p-3 rounded-lg text-sm ring-1 ring-inset", tones[tone], className)}>{children}</div>;
}
