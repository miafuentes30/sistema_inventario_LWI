import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/auth/AuthLayout";
import { useLanguage } from "../context/LanguageContext";

export default function Login() {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [recordar, setRecordar] = useState(true);
  const [mostrar, setMostrar] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  if (isAuthenticated) return <Navigate to="/" replace />;
  async function handleSubmit(event) {
    event.preventDefault();
    if (cargando) return;
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()) || !contrasena) {
      setError({ key: "invalidLogin" });
      return;
    }
    try {
      setCargando(true);
      await login(correo.trim(), contrasena, recordar);
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (err) {
      setError(err.code ? { key: err.code, message: err.message } : { key: "loginError" });
    } finally { setCargando(false); }
  }
  return <AuthLayout>
    <header className="login-header"><h1>{t("welcome")}</h1><p>{t("system")}<br />Living Water Guatemala</p></header>
    <form className="login-form" onSubmit={handleSubmit} noValidate aria-busy={cargando}>
      <label className="input-container"><Mail className="input-icon" size={22} aria-hidden="true" /><span className="sr-only">{t("email")}</span><input type="email" name="correo" placeholder={t("email")} value={correo} onChange={event => setCorreo(event.target.value)} autoComplete="email" required /></label>
      <div className="input-container"><LockKeyhole className="input-icon" size={22} aria-hidden="true" /><label htmlFor="contrasena" className="sr-only">{t("password")}</label><input id="contrasena" name="contrasena" type={mostrar ? "text" : "password"} placeholder={t("password")} value={contrasena} onChange={event => setContrasena(event.target.value)} autoComplete="current-password" required /><button type="button" className="password-button" onClick={() => setMostrar(!mostrar)} aria-label={mostrar ? t("hidePassword") : t("showPassword")} aria-pressed={mostrar}>{mostrar ? <EyeOff size={21} /> : <Eye size={21} />}</button></div>
      <div className="login-options"><label className="remember-option"><input type="checkbox" checked={recordar} onChange={event => setRecordar(event.target.checked)} /><span>{t("remember")}</span></label><Link to="/recuperar-contrasena">{t("forgot")}</Link></div>
      <button type="submit" className="login-submit" disabled={cargando}><span>{cargando ? t("signingIn") : t("signIn")}</span>{!cargando && <ArrowRight size={22} aria-hidden="true" />}</button>
      {error && <div className="login-error" role="alert">{language === "es" && error.message ? error.message : t(error.key || "loginError")}</div>}
    </form>
  </AuthLayout>;
}