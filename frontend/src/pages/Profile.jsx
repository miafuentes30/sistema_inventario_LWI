import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { UserRound, ShieldCheck, KeyRound, Save } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../services/api";
import {
  useCopy,
  Notice,
  date,
  strongPassword,
  Status,
} from "../components/AccountUI";
export default function Profile() {
  const { token, updateUser, logout } = useAuth();
  const { language } = useLanguage();
  const c = useCopy();
  const { hash } = useLocation();
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState({
    actual: "",
    nueva: "",
    confirmacion: "",
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (user && hash === "#contrasena") {
      const section = document.getElementById("contrasena");
      section?.scrollIntoView?.({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      section?.querySelector("input")?.focus({ preventScroll: true });
    }
  }, [hash, user]);
  useEffect(() => {
    let active = true;
    setError(null);
    api("/perfil", token)
      .then((u) => {
        if (active) {
          setUser(u);
          setName(u.nombre);
        }
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [token, revision]);
  async function saveName(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess("");
    try {
      const u = await api("/perfil", token, {
        method: "PATCH",
        body: { nombre: name.trim() },
      });
      setUser(u);
      updateUser(u);
      setSuccess(c("Nombre actualizado.", "Name updated."));
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }
  async function change(e) {
    e.preventDefault();
    setError(null);
    setSuccess("");
    if (
      !strongPassword(password.nueva) ||
      password.nueva !== password.confirmacion
    ) {
      setError(
        new Error(
          c(
            "Revisa la fortaleza y confirmación de la contraseña.",
            "Check password strength and confirmation.",
          ),
        ),
      );
      return;
    }
    setSaving(true);
    try {
      await api("/perfil/contrasena", token, {
        method: "POST",
        body: password,
      });
      setPassword({ actual: "", nueva: "", confirmacion: "" });
      try {
        sessionStorage.setItem("lwi_password_changed", "1");
      } catch {}
      logout();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="lw-content account-page">
      <div className="account-heading">
        <div>
          <div className="account-crumb">
            {c("Inicio / Mi perfil", "Home / My profile")}
          </div>
          <h1>{c("Mi perfil", "My profile")}</h1>
          <p>
            {c(
              "Consulta y administra la información de tu cuenta.",
              "View and manage your account information.",
            )}
          </p>
        </div>
      </div>
      <Notice error={error} success={success} />
      {!user ? (
        <div className="lw-panel">
          {error ? (
            <button
              className="account-secondary"
              onClick={() => setRevision((v) => v + 1)}
            >
              {c("Reintentar", "Retry")}
            </button>
          ) : (
            c("Cargando perfil…", "Loading profile…")
          )}
        </div>
      ) : (
        <div className="account-two-col">
          <section className="lw-panel">
            <div className="account-profile-summary">
              <span className="account-large-avatar">
                {user.nombre
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")}
              </span>
              <div>
                <h2>{user.nombre}</h2>
                <p>{user.correo}</p>
                <span className="account-badge role">
                  {user.rol.nombre}
                </span>{" "}
                <Status active={user.activo} />
              </div>
            </div>
            <form className="account-form" onSubmit={saveName}>
              <h2>
                <UserRound size={20} />
                {c("Información personal", "Personal information")}
              </h2>
              <label>
                {c("Nombre completo", "Full name")}
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                {c("Correo institucional", "Institutional email")}
                <input value={user.correo} readOnly />
              </label>
              <p className="account-hint">
                {c(
                  "El correo y el rol solo pueden modificarse por un administrador.",
                  "Only an administrator can change your email and role.",
                )}
              </p>
              <p>
                {c("Último acceso: ", "Last sign-in: ")}
                {date(user.ultimoAcceso, language)}
              </p>
              <button className="account-primary" disabled={saving}>
                <Save size={17} />
                {c("Guardar nombre", "Save name")}
              </button>
            </form>
          </section>
          <section className="lw-panel" id="contrasena">
            <h2>
              <KeyRound size={21} />
              {c("Cambiar contraseña", "Change password")}
            </h2>
            <p>
              {c(
                "Al cambiarla se cerrarán todas tus sesiones. Deberás iniciar sesión nuevamente.",
                "Changing your password ends all your sessions. You will need to sign in again.",
              )}
            </p>
            <form className="account-form" onSubmit={change}>
              {[
                ["actual", c("Contraseña actual", "Current password")],
                ["nueva", c("Nueva contraseña", "New password")],
                [
                  "confirmacion",
                  c("Confirmar nueva contraseña", "Confirm new password"),
                ],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="password"
                    required
                    autoComplete={
                      key === "actual" ? "current-password" : "new-password"
                    }
                    value={password[key]}
                    onChange={(e) =>
                      setPassword({ ...password, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <p className="account-hint">
                {c(
                  "12 a 72 bytes; incluye mayúsculas, minúsculas, números y símbolos.",
                  "12–72 bytes; include uppercase, lowercase, numbers and symbols.",
                )}
              </p>
              <button className="account-primary" disabled={saving}>
                <ShieldCheck size={17} />
                {saving
                  ? c("Guardando…", "Saving…")
                  : c("Actualizar contraseña", "Update password")}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
