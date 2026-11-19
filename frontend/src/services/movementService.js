import { api } from "./api";
const query = params => new URLSearchParams(Object.entries(params).filter(([,v]) => v !== "" && v !== null && v !== undefined)).toString();
export const movementService = {
  capabilities: async token => {
    try { return await api("/inventario-movimientos/capacidades", token); }
    catch (error) {
      if (error.status === 404) error.code = "MOVEMENT_BACKEND_OUTDATED";
      throw error;
    }
  },
  list: (kind, token, params) => api(`/${kind}?${query(params)}`,token),
  detail: (kind, id, token) => api(`/${kind}/${encodeURIComponent(id)}`,token),
  saveDraft: (kind, body, token) => api(`/${kind}`,token,{ method: "POST", body }),
  confirm: (kind,id,body,token) => api(`/${kind}/${encodeURIComponent(id)}/confirmar`,token,{method:"POST",body}),
  stock: (id,token) => api(`/productos/${encodeURIComponent(id)}/existencias`,token),
  history: (id,token) => api(`/productos/${encodeURIComponent(id)}/movimientos`,token)
};
