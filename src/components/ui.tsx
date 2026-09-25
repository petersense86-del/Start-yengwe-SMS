import { type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode, useEffect } from "react";
import { twMerge } from "tailwind-merge";
import clsx from "clsx";

export function Button({ className, variant = "primary", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "success" | "ghost" | "gold" }) {
  const variants = {
    primary: "bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-800",
    danger: "bg-red-600 hover:bg-red-700 text-white",
    success: "bg-green-600 hover:bg-green-700 text-white",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-700 border border-gray-300",
    gold: "bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white shadow-sm",
  };
  return (
    <button
      className={twMerge(clsx("px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm", variants[variant]), className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, error, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <input
        className={twMerge(
          clsx("px-3 py-2 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-sm bg-white"),
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function Select({ label, children, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <select
        className={twMerge(clsx("px-3 py-2 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-sm bg-white"), className)}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <textarea
        className={twMerge(clsx("px-3 py-2 rounded-lg border border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none text-sm bg-white"), className)}
        {...props}
      />
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={twMerge("bg-white rounded-xl shadow-sm border border-gray-100 p-5", className)}>{children}</div>
  );
}

export function Modal({ open, onClose, title, children, size = "md" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;
  const sizeCls = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className={twMerge("bg-white rounded-xl shadow-2xl w-full max-h-[90vh] overflow-y-auto", sizeCls)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, color = "gray", pulse = false, className }: { children: ReactNode; color?: "green" | "red" | "yellow" | "gray" | "blue" | "emerald"; pulse?: boolean; className?: string }) {
  const colors = {
    green: "bg-green-100 text-green-800 border-green-300",
    red: "bg-red-100 text-red-800 border-red-300",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
    gray: "bg-gray-100 text-gray-800 border-gray-300",
    blue: "bg-blue-100 text-blue-800 border-blue-300",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-300",
  };
  return (
    <span className={twMerge(
      clsx("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border", colors[color]),
      pulse && "animate-pulse",
      className
    )}>
      {pulse && <span className={twMerge("w-2 h-2 rounded-full",
        color === "green" ? "bg-green-500" : color === "red" ? "bg-red-500" : color === "yellow" ? "bg-yellow-500" : color === "blue" ? "bg-blue-500" : "bg-emerald-500"
      )} />}
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
    <div className={twMerge(clsx("rounded-full inline-block", sizes[size], colorMap[color]))} />
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 text-gray-500 text-sm">
      <div className="text-4xl mb-2 opacity-50">📭</div>
      {message}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
