// No HTTP requests or persistence until backend contracts are implemented.
export const catalogService = {
  async listProducts() { return { connected: false, items: [] }; },
  async listSuppliers() { return { connected: false, items: [] }; },
  async getProduct() { return { connected: false, item: null }; },
};
