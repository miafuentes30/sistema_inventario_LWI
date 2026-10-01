import { createContext, useContext, useEffect, useState } from "react";

const translations = {
  es: {
    language: "Idioma", spanish: "Español", english: "Inglés", welcome: "Bienvenido", system: "Sistema de Inventario",
    recoveryMissionLines: ["“Agua,", "para la vida,", "en el nombre", "de Jesús.”"], impact: "Impacto",
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
    recoveryMissionLines: ["“Water,", "for life,", "in Jesus’", "name.”"], impact: "Impact",
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
