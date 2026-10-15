const base = (
  import.meta.env.VITE_API_URL || "http://localhost:3000/api"
).replace(/\/+$/, "");
export async function api(path, token, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const result = await response.json().catch(() => null);
  if (response.status === 401)
    window.dispatchEvent(new Event("lwi:unauthorized"));
  if (!response.ok)
    throw Object.assign(
      new Error(result?.message || "No se pudo completar la solicitud."),
      { status: response.status, code: result?.code, errors: result?.errors },
    );
  return result?.data;
}
