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
