import { api } from "./api";
const query = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== "" && value !== null && value !== undefined)).toString();
const request = (route, token, method, body) => api(route, token, { method, body });
export const catalogService = {
  listProducts: (token, params = {}) => api(`/productos?${query(params)}`, token),
  listSuppliers: (token, params = {}) => api(`/proveedores?${query(params)}`, token),
  getProduct: (id, token) => api(`/productos/${encodeURIComponent(id)}`, token),
  getSupplier: (id, token) => api(`/proveedores/${encodeURIComponent(id)}`, token),
  saveProduct: (id, body, token) => request(id ? `/productos/${id}` : "/productos", token, id ? "PATCH" : "POST", body),
  saveSupplier: (id, body, token) => request(id ? `/proveedores/${id}` : "/proveedores", token, id ? "PATCH" : "POST", body),
  setState: (suppliers, id, active, token) => request(`/${suppliers ? "proveedores" : "productos"}/${id}/estado`, token, "PATCH", { active }),
  listBrands: (token, params = {}) => api(`/marcas?${query(params)}`, token),
  saveBrand: (id, body, token) => request(id ? `/marcas/${id}` : "/marcas", token, id ? "PATCH" : "POST", body),
  setBrandState: (id, active, token) => request(`/marcas/${id}/estado`, token, "PATCH", { active }),
  catalogs: async token => {
    const names = ["categorias", "subcategorias", "marcas", "unidades-medida", "tipos-inventario", "bodegas"];
    const lists = await Promise.all(names.map(name => api(`/catalogos/${name}`, token)));
    return Object.fromEntries(names.map((name, i) => [name, lists[i]]));
  },
};
