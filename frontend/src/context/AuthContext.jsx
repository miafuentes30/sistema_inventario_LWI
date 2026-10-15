import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { loginRequest } from "../services/authService";

const AuthContext = createContext(null);

function expiresAt(session) {
  try {
    const payload = JSON.parse(
      atob(session.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : 0;
  } catch {
    return 0;
  }
}

function getInitialSession() {
  try {
    const raw =
      localStorage.getItem("lwi_session") ||
      sessionStorage.getItem("lwi_session");
    const session = raw ? JSON.parse(raw) : null;
    if (session?.usuario && expiresAt(session) > Date.now()) return session;
    localStorage.removeItem("lwi_session");
    sessionStorage.removeItem("lwi_session");
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(getInitialSession);
  const [verifying, setVerifying] = useState(true);
  useEffect(() => {
    let active = true;
    if (!session?.token) {
      setVerifying(false);
      return;
    }
    setVerifying(true);
    api("/perfil", session.token)
      .then((user) => {
        if (active) updateUser(user);
      })
      .catch((error) => {
        if (active && error.status === 401) logout();
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [session?.token]);

  useEffect(() => {
    if (!session) return;
    function checkExpiry() {
      if (expiresAt(session) <= Date.now()) logout();
    }
    const timer = setTimeout(
      checkExpiry,
      Math.min(Math.max(expiresAt(session) - Date.now(), 0), 2147483647),
    );
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [session]);

  useEffect(() => {
    const unauthorized = () => logout();
    window.addEventListener("lwi:unauthorized", unauthorized);
    return () => window.removeEventListener("lwi:unauthorized", unauthorized);
  }, []);

  function updateUser(usuario) {
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, usuario };
      const storage = localStorage.getItem("lwi_session")
        ? localStorage
        : sessionStorage;
      storage.setItem("lwi_session", JSON.stringify(next));
      return next;
    });
  }

  async function login(correo, contrasena, recordar) {
    const data = await loginRequest(correo, contrasena);
    if (expiresAt(data) <= Date.now()) {
      throw Object.assign(
        new Error("El servidor no devolvió una sesión válida."),
        { code: "invalidSession" },
      );
    }
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
      verifying,
      session,
      usuario: session?.usuario ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(
        session?.usuario && expiresAt(session) > Date.now(),
      ),
      login,
      logout,
      updateUser,
    }),
    [session, verifying],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context)
    throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return context;
}
