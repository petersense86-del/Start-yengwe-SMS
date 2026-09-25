import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Copy, Info, KeyRound, X, XCircle } from "lucide-react";
import { Button, Modal } from "./ui";

/*
 * App-wide feedback: toasts, confirmation dialogs and one-time credential
 * display. Callable from anywhere (no hooks needed), rendered by <FeedbackHost />.
 */

type ToastTone = "success" | "error" | "info" | "warning";
interface ToastItem { id: number; tone: ToastTone; message: string }
interface ConfirmRequest { title: string; message: string; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void }
interface CredentialsRequest { title: string; name: string; username: string; password: string }

interface State { toasts: ToastItem[]; confirm: ConfirmRequest | null; credentials: CredentialsRequest | null }
let state: State = { toasts: [], confirm: null, credentials: null };
const listeners = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
let nextId = 1;

function push(tone: ToastTone, message: string) {
  const id = nextId++;
  set({ toasts: [...state.toasts, { id, tone, message }].slice(-4) });
  setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
}
function dismiss(id: number) {
  set({ toasts: state.toasts.filter((t) => t.id !== id) });
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m),
  info: (m: string) => push("info", m),
  warning: (m: string) => push("warning", m),
};

export function confirmDialog(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => set({ confirm: { ...opts, resolve } }));
}

export function showCredentials(req: CredentialsRequest) {
  set({ credentials: req });
}

const TONE = {
  success: { icon: CheckCircle2, cls: "text-green-600" },
  error: { icon: XCircle, cls: "text-red-600" },
  info: { icon: Info, cls: "text-blue-600" },
  warning: { icon: AlertTriangle, cls: "text-amber-600" },
};

export function FeedbackHost() {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
  return (
    <>
      <div aria-live="polite" className="fixed z-[60] bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 flex flex-col gap-2 sm:w-96 pointer-events-none">
        {s.toasts.map((t) => {
          const { icon: Icon, cls } = TONE[t.tone];
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex items-start gap-3 bg-white rounded-xl shadow-lg ring-1 ring-gray-900/10 p-3.5 animate-toastIn">
              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cls}`} aria-hidden />
              <p className="text-sm text-gray-800 flex-1">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600 p-0.5 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {s.confirm && <ConfirmModal req={s.confirm} />}
      {s.credentials && <CredentialsModal req={s.credentials} />}
    </>
  );
}

function ConfirmModal({ req }: { req: ConfirmRequest }) {
  const close = (ok: boolean) => { set({ confirm: null }); req.resolve(ok); };
  return (
    <Modal open onClose={() => close(false)} title={req.title} size="sm">
      <div className="flex gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${req.danger ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-gray-600 pt-2">{req.message}</p>
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
        <Button variant={req.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>{req.confirmLabel || "Confirm"}</Button>
      </div>
    </Modal>
  );
}

function CredentialsModal({ req }: { req: CredentialsRequest }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); }, [req]);
  const text = `Yengwe YPMS login\nUsername: ${req.username}\nTemporary password: ${req.password}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Please write the details down.");
    }
  }
  return (
    <Modal open onClose={() => set({ credentials: null })} title={req.title} size="sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><KeyRound className="w-5 h-5" /></div>
        <p className="text-sm text-gray-600">Give these details to <strong className="text-gray-900">{req.name}</strong>. They will be asked to choose a new password when they first sign in.</p>
      </div>
      <dl className="rounded-xl bg-gray-50 ring-1 ring-gray-200 divide-y divide-gray-200 text-sm">
        <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-gray-500">Username</dt><dd className="font-mono font-semibold text-gray-900">{req.username}</dd></div>
        <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-gray-500">Temporary password</dt><dd className="font-mono font-semibold text-gray-900 tracking-wider">{req.password}</dd></div>
      </dl>
      <p className="text-xs text-amber-700 mt-3">This password is shown only once and is not stored anywhere readable.</p>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={copy}><Copy className="w-4 h-4" />{copied ? "Copied" : "Copy details"}</Button>
        <Button onClick={() => set({ credentials: null })}>Done</Button>
      </div>
    </Modal>
  );
}
