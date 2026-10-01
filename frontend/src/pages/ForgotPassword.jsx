import { useState } from "react";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
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
    <Link className="back-link" to="/login"><ArrowLeft size={18} />{t("back")}</Link>
    <header className="login-header"><h1 className="recovery-title">{t("recover")}</h1><p>{t("recoveryText")}</p></header>
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <label className="input-container"><Mail className="input-icon" size={22} aria-hidden="true" /><span className="sr-only">{t("email")}</span><input type="email" name="correo" placeholder={t("email")} autoComplete="email" value={correo} onChange={event => { setCorreo(event.target.value); setMensaje(""); }} required aria-describedby={mensaje ? "recovery-message" : undefined} /></label>
      <button className="login-submit" type="submit">{t("send")}<ArrowRight size={22} aria-hidden="true" /></button>
      {mensaje && <div id="recovery-message" className="login-error" role="alert">{t(mensaje)}</div>}
    </form>
  </AuthLayout>;
}