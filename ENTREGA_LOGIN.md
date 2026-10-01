# Login Living Water Guatemala: archivos completos

## frontend/src/components/auth/AuthVisual.jsx

~~~
import loginImage from "../../assets/images/login-living-water.png";
import recoveryImage from "../../assets/images/Olvidastetucontraseña.png";
import logo from "../../assets/images/living-water-logo.png";
import { useLanguage } from "../../context/LanguageContext";

export default function AuthVisual({ variant = "login" }) {
  const { t } = useLanguage();
  const image = variant === "recovery" ? recoveryImage : loginImage;
  return (
    <aside
      className="auth-visual auth-visual-background"
      style={{ backgroundImage: `url("${image}")` }}
      aria-label="Living Water Guatemala"
    >
      <div className="auth-visual-overlay" aria-hidden="true" />
      <div className="auth-visual-content">
        <div className="auth-brand"><img src={logo} alt="Living Water International" /><strong>Guatemala</strong></div>
        <div className="auth-mission">
          <h2>{t("missionLines").map(line => <span key={line}>{line}</span>)}</h2>
          <div className="mission-line" aria-hidden="true" />
          <p>{t("institutionLines").map(line => <span key={line}>{line}</span>)}</p>
        </div>
      </div>
    </aside>
  );
}

~~~

## frontend/src/components/auth/AuthLayout.jsx

~~~
import { Shield } from "lucide-react";
import AuthVisual from "./AuthVisual";
import { useLanguage } from "../../context/LanguageContext";

export default function AuthLayout({ children, variant = "login" }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <main className="login-page">
      <AuthVisual variant={variant} />
      <section className="login-form-panel">
        <div className="language-selector">
          <label htmlFor="auth-language" className="sr-only">{t("language")}</label>
          <select id="auth-language" value={language} onChange={event => setLanguage(event.target.value)}>
            <option value="es">{t("spanish")}</option>
            <option value="en">{t("english")}</option>
          </select>
        </div>
        <div className="login-form-container">
          {children}
          <div className="login-divider"><span>{t("or")}</span></div>
          <div className="restricted-access"><Shield size={24} aria-hidden="true" /><div><strong>{t("restricted")}</strong><p>{t("restrictedText")}</p></div></div>
        </div>
        <footer className="login-footer"><p>Living Water Guatemala</p><p>{t("updated")}</p></footer>
      </section>
    </main>
  );
}
~~~

## frontend/src/pages/Login.jsx

~~~
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
~~~

## frontend/src/pages/ForgotPassword.jsx

~~~
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
~~~

## frontend/src/styles/global.css

~~~
:root {
  --navy:#001d39; --blue:#0a4174; --light-blue:#bdd8e9; --yellow:#fec20f;
  --text:#111827; --border:#dce3eb; --muted:#667085; --error:#b42318;
  font-family:Arial,Helvetica,sans-serif; color:var(--text); background:#fff;
}
* { box-sizing:border-box; }
html,body,#root { margin:0; width:100%; min-height:100%; }
body { min-height:100vh; }
button,input,select { font:inherit; }
button { cursor:pointer; }
a { color:var(--blue); text-decoration:none; }
a:hover { text-decoration:underline; }
button:focus-visible,a:focus-visible,select:focus-visible { outline:3px solid var(--blue); outline-offset:4px; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.login-page { width:100%; min-height:100vh; min-height:100dvh; display:grid; grid-template-columns:minmax(0,42fr) minmax(0,58fr); }
.auth-visual { position:relative; isolation:isolate; min-width:0; display:flex; background:var(--navy); color:#fff; }
.auth-visual-photo { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:60% center; z-index:-2; }
.auth-visual-overlay { position:absolute; inset:0; z-index:-1; background:linear-gradient(180deg,rgba(0,29,57,.1) 0%,rgba(0,29,57,.2) 45%,rgba(0,29,57,.65) 100%); }
.auth-visual-content { width:100%; display:flex; flex-direction:column; justify-content:space-between; gap:64px; padding:clamp(32px,4.2vw,80px); }
.auth-brand { display:flex; flex-direction:column; align-items:flex-start; gap:12px; }
.auth-brand img { width:clamp(76px,6.5vw,112px); height:auto; }
.auth-brand strong { font-size:clamp(16px,1.4vw,23px); }
.auth-mission h2 { margin:0; font-size:clamp(36px,3.4vw,64px); font-weight:700; line-height:1.08; letter-spacing:-1px; }
.auth-mission h2 span,.auth-mission p span { display:block; }
.mission-line { height:6px; width:88px; border-radius:2px; margin:24px 0; background:var(--yellow); }
.auth-mission p { margin:0; font-size:clamp(17px,1.5vw,24px); line-height:1.5; }
.login-form-panel { min-width:0; min-height:100vh; min-height:100dvh; padding:26px clamp(32px,5vw,100px) 24px; display:flex; flex-direction:column; align-items:center; gap:28px; background:#fff; }
.language-selector { align-self:flex-end; }
.language-selector select { border:0; background:transparent; color:var(--navy); font-size:14px; padding:8px; cursor:pointer; }
.login-form-container { width:100%; max-width:500px; margin:auto 0; padding:16px 0; }
.login-header { margin-bottom:32px; }
.login-header h1 { font-size:clamp(36px,3vw,52px); line-height:1.12; letter-spacing:-1.2px; margin:0 0 12px; color:var(--text); }
.login-header .recovery-title { font-size:clamp(30px,2.6vw,44px); }
.login-header p { font-size:18px; color:var(--muted); line-height:1.5; margin:0; }
.input-container { width:100%; height:58px; display:flex; align-items:center; gap:12px; padding:0 16px; margin-bottom:16px; border:1px solid var(--border); border-radius:6px; color:var(--muted); }
.input-container:focus-within { border-color:var(--blue); box-shadow:0 0 0 3px #bdd8e950; }
.input-icon { flex-shrink:0; }
.input-container input { width:100%; min-width:0; height:100%; border:0; outline:0; background:transparent; color:var(--text); font-size:16px; }
.input-container input::placeholder { color:#7c8799; }
.password-button { display:flex; flex-shrink:0; padding:6px; border:0; background:transparent; color:var(--muted); }
.login-options { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; font-size:14px; margin:20px 0 26px; }
.remember-option { display:flex; align-items:center; gap:8px; cursor:pointer; }
.remember-option input { width:17px; height:17px; margin:0; accent-color:var(--blue); }
.login-submit { display:flex; align-items:center; justify-content:center; gap:20px; width:100%; min-height:56px; padding:12px; border:0; border-radius:6px; background:var(--yellow); color:var(--navy); font-size:16px; font-weight:700; }
.login-submit:hover:not(:disabled) { filter:brightness(.97); }
.login-submit:disabled { cursor:wait; opacity:.7; }
.login-error { margin:14px 0 0; padding:12px; border:1px solid #fecaca; border-radius:5px; background:#fef2f2; color:var(--error); font-size:14px; line-height:1.5; overflow-wrap:anywhere; }
.login-divider { display:flex; align-items:center; gap:16px; margin:28px 0; font-size:13px; color:var(--muted); }
.login-divider::before,.login-divider::after { content:""; flex:1; height:1px; background:var(--border); }
.restricted-access { display:flex; align-items:flex-start; gap:14px; padding:20px; border-radius:6px; background:#f1f5f9; color:var(--navy); }
.restricted-access svg { flex-shrink:0; }
.restricted-access strong { display:block; font-size:14px; margin-bottom:5px; }
.restricted-access p { margin:0; font-size:13px; line-height:1.5; color:var(--muted); }
.login-footer { width:100%; text-align:center; font-size:12px; color:var(--muted); }
.login-footer p { margin:4px 0; }
.back-link { display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:28px; }
@media(min-width:821px) and (max-height:800px) {
  .auth-visual-content { padding:32px clamp(28px,4vw,64px); gap:36px; }
  .auth-brand img { width:76px; }
  .auth-mission h2 { font-size:clamp(34px,3vw,48px); }
  .auth-mission p { font-size:18px; }
  .login-form-panel { padding-top:18px; padding-bottom:18px; gap:18px; }
  .login-form-container { padding:6px 0; }
  .login-header { margin-bottom:24px; }
  .login-header h1 { font-size:40px; }
  .login-header p { font-size:16px; }
  .login-divider { margin:22px 0; }
}
@media(max-width:820px) {
  .login-page { grid-template-columns:minmax(0,1fr); }
  .auth-visual-content { padding:32px; gap:32px; flex-direction:row; align-items:flex-start; }
  .auth-brand img { width:76px; }
  .auth-brand strong { font-size:16px; }
  .auth-mission h2 { font-size:32px; }
  .mission-line { margin:16px 0; height:5px; width:64px; }
  .auth-mission p { font-size:14px; }
  .login-form-panel { min-height:auto; padding:20px 32px 28px; gap:22px; }
  .login-form-container { padding:12px 0; }
}
@media(max-width:480px) {
  .auth-visual-content { padding:28px 24px; gap:24px; }
  .auth-brand img { width:60px; }
  .auth-brand strong { font-size:14px; }
  .auth-mission h2 { font-size:26px; }
  .auth-mission p { font-size:12px; }
  .login-form-panel { padding:18px 24px 24px; }
  .login-header h1 { font-size:36px; }
  .login-header .recovery-title { font-size:30px; }
  .login-header p { font-size:16px; }
}
@media(max-width:359px) {
  .auth-visual-content { flex-direction:column; }
  .login-form-panel { padding-inline:18px; }
}
.home-page {
  width: 100%;
  min-height: 100vh;

  display: grid;

  grid-template-columns:
    280px
    1fr;

  background: #f5f8fb;
}

.home-sidebar {
  padding: 32px 24px;

  color: #ffffff;
  background: var(--navy);
}

.sidebar-logo {
  width: 90px;

  display: block;

  margin-bottom: 20px;
}

.sidebar-brand {
  display: flex;
  flex-direction: column;

  gap: 5px;
}

.sidebar-brand span {
  color: #bdd8e9;

  font-size: 13px;
}

.home-content {
  padding: 46px;
}

.home-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  gap: 30px;
}

.home-header h1 {
  margin: 5px 0;

  color: var(--navy);
}

.home-header p {
  color: #667085;
}

.eyebrow {
  color: #0a6fb6;

  font-weight: 700;
}

.logout-button {
  display: flex;
  align-items: center;

  gap: 8px;

  padding: 11px 15px;

  border: 1px solid #d0d5dd;
  border-radius: 8px;

  background: #ffffff;
}

.home-card,
.user-card {
  display: flex;
  align-items: center;

  gap: 18px;

  margin-top: 34px;
  padding: 28px;

  border: 1px solid #e4e7ec;
  border-radius: 14px;

  background: #ffffff;

  box-shadow:
    0 6px
    22px
    rgba(16, 24, 40, 0.05);
}

.home-card h2 {
  margin:
    0
    0
    5px;
}

.home-card p {
  margin: 0;

  color: #667085;
}

.user-card {
  margin-top: 16px;
}

.user-card div {
  display: flex;
  flex-direction: column;

  gap: 4px;
}

.user-card span {
  color: #667085;
}


/* =========================================================
   HOME RESPONSIVE
========================================================= */

@media (max-width: 800px) {

  .home-page {
    grid-template-columns: 1fr;
  }

  .home-sidebar {
    display: none;
  }

  .home-content {
    padding: 30px 22px;
  }

  .home-header {
    flex-direction: column;
  }

}

.auth-visual-background {
  background-size:cover;
  background-position:center;
  background-repeat:no-repeat;
}
@media(max-width:820px) {
  .auth-visual-background { min-height:clamp(360px,100vw,620px); }
}

~~~

## frontend/src/context/LanguageContext.jsx

~~~
import { createContext, useContext, useEffect, useState } from "react";

const translations = {
  es: {
    language: "Idioma", spanish: "Español", english: "Inglés", welcome: "Bienvenido", system: "Sistema de Inventario",
    missionLines: ["Agua,", "para la vida,", "en el nombre", "de Jesús."],
    institutionLines: ["“Servir con excelencia", "para transformar", "comunidades.”"],
    invalidCredentials: "Correo o contraseña incorrectos.", rateLimited: "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
    invalidInput: "Datos de entrada inválidos.", serverError: "Ocurrió un error interno en el servidor.",
    email: "Correo electrónico", password: "Contraseña", showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña", remember: "Recordarme", forgot: "¿Olvidaste tu contraseña?",
    signIn: "Iniciar sesión", signingIn: "Ingresando...", or: "o", restricted: "Acceso restringido",
    restrictedText: "Este sistema es de uso exclusivo para personal autorizado de Living Water Guatemala.",
    updated: "Actualizado 2026", back: "Volver al inicio de sesión", recover: "Recuperar contraseña",
    recoveryText: "Ingresa tu correo electrónico registrado para solicitar la recuperación de tu acceso.",
    send: "Enviar solicitud", invalidLogin: "Ingresa un correo electrónico válido y tu contraseña.",
    invalidEmail: "Ingresa un correo electrónico válido.",
    recoveryUnavailable: "La recuperación de contraseña aún no está disponible. Contacta al administrador para recuperar tu acceso.",
    loginError: "No fue posible iniciar sesión.", connectionError: "No se pudo conectar con el servidor. Intenta nuevamente.",
    invalidSession: "El servidor no devolvió una sesión válida.",
    mission: "Agua, para la vida, en el nombre de Jesús.", service: "Servicio", integrity: "Integridad", love: "Amor"
  },
  en: {
    language: "Language", spanish: "Spanish", english: "English", welcome: "Welcome", system: "Inventory System",
    missionLines: ["Water,", "for life,", "in Jesus’", "name."],
    institutionLines: ["“Serving with excellence", "to transform", "communities.”"],
    invalidCredentials: "Incorrect email or password.", rateLimited: "Too many sign-in attempts. Please try again later.",
    invalidInput: "Invalid input data.", serverError: "An internal server error occurred.",
    email: "Email address", password: "Password", showPassword: "Show password",
    hidePassword: "Hide password", remember: "Remember me", forgot: "Forgot your password?",
    signIn: "Sign in", signingIn: "Signing in...", or: "or", restricted: "Restricted access",
    restrictedText: "This system is for authorized Living Water Guatemala personnel only.",
    updated: "Updated 2026", back: "Back to sign in", recover: "Recover password",
    recoveryText: "Enter your registered email address to request access recovery.",
    send: "Send request", invalidLogin: "Enter a valid email address and your password.",
    invalidEmail: "Enter a valid email address.",
    recoveryUnavailable: "Password recovery is not available yet. Contact your administrator to recover access.",
    loginError: "Unable to sign in.", connectionError: "Unable to connect to the server. Please try again.",
    invalidSession: "The server did not return a valid session.",
    mission: "Water, for life, in Jesus’ name.", service: "Service", integrity: "Integrity", love: "Love"
  }
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem("lwi_language") === "en" ? "en" : "es"; }
    catch { return "es"; }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem("lwi_language", language); } catch { /* Language works without storage. */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, t: key => translations[language][key] ?? key }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used within LanguageProvider.");
  return value;
}

~~~

## frontend/src/services/authService.js

~~~
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace(/\/+$/, "");

export async function loginRequest(correo, contrasena) {
  let response;
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo, contrasena })
    });
  } catch {
    throw Object.assign(new Error("No se pudo conectar con el servidor. Intenta nuevamente."), { code: "connectionError" });
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.code === "INVALID_CREDENTIALS" || response.status === 401 ? "invalidCredentials"
      : response.status === 429 ? "rateLimited"
      : response.status === 400 ? "invalidInput"
      : response.status >= 500 ? "serverError" : "loginError";
    throw Object.assign(new Error(data?.message || "No fue posible iniciar sesión."), { code });
  }
  if (typeof data?.data?.token !== "string" || !data.data.token || !data.data.usuario) {
    throw Object.assign(new Error("El servidor no devolvió una sesión válida."), { code: "invalidSession" });
  }
  return { token: data.data.token, usuario: data.data.usuario, expiresIn: data.data.expiresIn };
}

~~~

## frontend/src/context/AuthContext.jsx

~~~
import { createContext, useContext, useMemo, useState } from "react";
import { loginRequest } from "../services/authService";

const AuthContext = createContext(null);

function getInitialSession() {
  try {
    const raw = localStorage.getItem("lwi_session") || sessionStorage.getItem("lwi_session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(getInitialSession);

  async function login(correo, contrasena, recordar) {
    const data = await loginRequest(correo, contrasena);
    const storage = recordar ? localStorage : sessionStorage;
    localStorage.removeItem("lwi_session");
    sessionStorage.removeItem("lwi_session");
    storage.setItem("lwi_session", JSON.stringify(data));
    setSession(data);
    return data;
  }

  function logout() {
    localStorage.removeItem("lwi_session");
    sessionStorage.removeItem("lwi_session");
    setSession(null);
  }

  const value = useMemo(
    () => ({
      session,
      usuario: session?.usuario ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(session?.token),
      login,
      logout
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return context;
}

~~~

## frontend/src/routes/ProtectedRoute.jsx

~~~
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

~~~

## frontend/src/pages/Home.jsx

~~~
import { LogOut, Package, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/images/living-water-logo.png";

export default function Home() {
  const { usuario, logout } = useAuth();

  return (
    <main className="home-page">
      <aside className="home-sidebar">
        <img src={logo} alt="Living Water International" className="sidebar-logo" />
        <div className="sidebar-brand">
          <strong>Sistema de Inventario</strong>
          <span>Living Water Guatemala</span>
        </div>
      </aside>
      <section className="home-content">
        <header className="home-header">
          <div>
            <span className="eyebrow">Inicio</span>
            <h1>Bienvenido, {usuario?.nombre || "usuario"}</h1>
            <p>La autenticación está conectada correctamente con el backend.</p>
          </div>
          <button className="logout-button" onClick={logout}><LogOut size={18} /> Cerrar sesión</button>
        </header>
        <div className="home-card">
          <Package size={34} />
          <div>
            <h2>Sistema de Inventario</h2>
            <p>El Dashboard completo se incorporará en el siguiente bloque del desarrollo.</p>
          </div>
        </div>
        <div className="user-card">
          <UserRound size={22} />
          <div>
            <strong>{usuario?.nombre}</strong>
            <span>{usuario?.correo} · {usuario?.rol?.nombre}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

~~~

## frontend/src/App.jsx

~~~
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import Home from "./pages/Home";
import ProtectedRoute from "./routes/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/recuperar-contrasena" element={<ForgotPassword />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

~~~

## frontend/src/main.jsx

~~~
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider><App /></LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

~~~

## frontend/package.json

~~~
{
  "name": "frontend-sistema-inventario-lwi",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.1.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.5"
  }
}

~~~

## README_LOGIN.md

~~~
# Login y recuperación comparten AuthVisual.jsx con branding HTML y textos traducibles. El login utiliza frontend/src/assets/images/login-living-water.png y recuperación utiliza frontend/src/assets/images/Olvidastetucontraseña.png. Ambos archivos actuales son imágenes limpias, sin logo ni textos incrustados. Los fondos cubren el panel con background-size:cover; el logo y las frases son elementos independientes. Ya no falta la fotografía. Se conserva la distribución 42%/58%, formulario de hasta 500px e idioma persistente.

El backend solo expone POST /api/auth/login. Recuperación valida el correo y muestra que el servicio no está disponible; no envía correos ni muestra éxito ficticio. Home sigue siendo la pantalla protegida provisional existente, no el dashboard completo de la referencia.

## Archivos creados

- frontend/src/components/auth/AuthVisual.jsx
- frontend/src/components/auth/AuthLayout.jsx
- frontend/src/context/LanguageContext.jsx
- ENTREGA_LOGIN.md (contenido completo listo para copiar)
- README_LOGIN.md se actualizó.

## Archivos reemplazados

- frontend/src/pages/Login.jsx
- frontend/src/pages/ForgotPassword.jsx
- frontend/src/styles/global.css
- frontend/src/services/authService.js

main.jsx se actualizó para incluir LanguageProvider. AuthContext.jsx, ProtectedRoute.jsx, Home.jsx, App.jsx y package.json existentes se mantienen y se incluyen completos en ENTREGA_LOGIN.md.

## Arranque

En una terminal desde la raíz:
```powershell
cd backend
npm install
# Si falta .env, copia .env.example a .env y configura PostgreSQL y JWT_SECRET.
npm run prisma:generate
npm run dev
```

La base PostgreSQL debe estar creada y tener el esquema del backend. Sigue backend/README.md para su configuración. npm run seed crea el usuario inicial definido en backend/.env; úsalo únicamente si necesitas preparar datos de desarrollo.

En otra terminal desde la raíz:
```powershell
cd frontend
npm install
# Si falta .env, copia .env.example a .env.
npm run dev
```

frontend/.env debe contener:
```env
VITE_API_URL=http://localhost:3000/api
```
backend/.env: FRONTEND_URL=http://localhost:5173
Abre http://localhost:5173/login. Para compilar: npm run build dentro de frontend.

## Comprobar petición real

1. Abre DevTools > Network > Fetch/XHR.
2. Ingresa un correo válido y contraseña, pulsa Iniciar sesión.
3. Busca la petición POST a http://localhost:3000/api/auth/login.
4. En Payload verifica las claves correo y contrasena.
5. En Response verifica el estado y el mensaje. Un error se muestra debajo del botón y no redirige.
6. Con credenciales válidas, el backend debe responder data.token y data.usuario; el frontend redirige a /.

No compartas capturas que revelen contraseñas o tokens.

## Comprobar JWT y Recordarme

DevTools > Application > Storage:
- Activado: Local Storage > lwi_session.
- Desactivado: Session Storage > lwi_session.
El JSON contiene token, usuario y expiresIn. La otra ubicación se limpia al iniciar sesión.
Recarga y comprueba que la sesión se conserva. Cierra sesión para limpiar ambas ubicaciones.
Repite el inicio de sesión con Recordarme desactivado para comprobar sessionStorage.

## Verificación

npm run build pasó. El renderizado del panel compartido, el selector y el aviso de acceso se comprobó en español e inglés. No se verificó un inicio de sesión contra PostgreSQL ni la fidelidad visual en navegador. Revisa ambos formularios en 1920x1080, 1600x900, 1366x768, 768x1024 y 375x812. El layout evita alturas fijas y permite desplazamiento vertical en pantallas bajas.
~~~
