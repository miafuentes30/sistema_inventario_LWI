import { useState } from "react";
import { ArrowRight, Info, LockKeyhole, Mail, Send } from "lucide-react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { useLanguage } from "../context/LanguageContext";

export default function ForgotPassword() {
  const { t } = useLanguage();
  const [correo, setCorreo] = useState("");
  const [mensaje, setMensaje] = useState("");
  function handleSubmit(event) {
    event.preventDefault();
    setMensaje(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())
      ? "recoveryUnavailable"
      : "invalidEmail");
  }
  return <AuthLayout variant="recovery">
    <section className="recovery-card">
      <div className="recovery-lock-icon"><LockKeyhole size={32} aria-hidden="true" /></div>
      <header className="login-header">
        <h1 className="recovery-title">{t("recover")}</h1>
        <p>{t("recoveryText")}</p>
      </header>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <label className="recovery-email-label" htmlFor="recovery-email">{t("email")} <span aria-hidden="true">*</span></label>
        <div className="input-container"><Mail className="input-icon" size={22} aria-hidden="true" /><input id="recovery-email" type="email" name="correo" placeholder={t("emailPlaceholder")} autoComplete="email" value={correo} onChange={event => { setCorreo(event.target.value); setMensaje(""); }} required aria-describedby={mensaje ? "recovery-message" : undefined} /></div>
        <button className="login-submit" type="submit"><Send size={19} aria-hidden="true" />{t("sendRecoveryLink")}<ArrowRight className="recovery-submit-arrow" size={20} aria-hidden="true" /></button>
        {mensaje && <div id="recovery-message" className="login-error" role="alert">{t(mensaje)}</div>}
      </form>
      <div className="recovery-divider"><span>{t("or")}</span></div>
      <Link className="recovery-back-link" to="/login">{t("back")}</Link>
      <aside className="recovery-note">
        <Info size={23} aria-hidden="true" />
        <div><strong>{t("checkInbox")}</strong><p>{t("checkInboxText")}</p></div>
      </aside>
    </section>
  </AuthLayout>;
}