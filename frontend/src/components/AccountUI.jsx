import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
export function useCopy() {
  const { language } = useLanguage();
  return (es, en) => (language === "en" ? en : es);
}
export function Notice({ error, success }) {
  const c = useCopy();
  return error ? (
    <div className="account-message error" role="alert">
      {c(
        error.message || String(error),
        error.status === 403
          ? "You do not have permission."
          : error.status === 409
            ? "This email is already registered or the account changed."
            : error.status === 401
              ? "Your session expired. Please sign in again."
              : "Unable to complete the request. Check the fields and try again.",
      )}
      {error.errors && (
        <ul>
          {Object.entries(error.errors).map(([field, messages]) => (
            <li key={field}>
              {field}: {c(messages.join(" "), "Check this field.")}
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : success ? (
    <div className="account-message success" role="status">
      {success}
    </div>
  ) : null;
}
export function Modal({ title, children, onClose, busy = false }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const c = useCopy();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    dialog.querySelector("input,select,button")?.focus();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="account-modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close.current();
      }}
    >
      <div className="account-modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          type="button"
          disabled={busy}
          className="account-icon"
          onClick={onClose}
          aria-label={c("Cerrar", "Close")}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function date(value, language) {
  return value
    ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-GT", {
        timeZone: "America/Guatemala",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "?";
}
export function strongPassword(value) {
  return (
    value.length >= 12 &&
    new TextEncoder().encode(value).length <= 72 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^a-zA-Z0-9]/.test(value)
  );
}
export function Status({ active }) {
  const c = useCopy();
  return (
    <span className={`account-badge ${active ? "active" : "inactive"}`}>
      {active ? c("Activo", "Active") : c("Inactivo", "Inactive")}
    </span>
  );
}
