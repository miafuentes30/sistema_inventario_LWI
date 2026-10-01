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
