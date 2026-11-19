export const proposedEntryTypes = ["LOCAL_PURCHASE","IMPORT","DONATION","INVENTORY_ADJUSTMENT"];
export function scaled(value, decimals) {
  const text = String(value);
  if (!new RegExp(`^\\d{1,15}(\\.\\d{1,${decimals}})?$`).test(text)) throw new Error("INVALID_DECIMAL");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}
export function decimal(value, places) {
  const str = value.toString().padStart(places + 1, "0");
  return `${str.slice(0,-places)}.${str.slice(-places)}`;
}
export function totals(lines, outgoing = false) {
  const quantities = Object.create(null), subtotals = [];
  let known = true, sum = 0n;
  for (const line of lines) {
    try {
      const qty = scaled(line.quantity,3);
      if (qty <= 0n) throw new Error("INVALID_QUANTITY");
      const unit = line.unit || "—";
      quantities[unit] = (quantities[unit] || 0n) + qty;
      if (!outgoing && line.unitCost !== "" && line.unitCost !== null && line.unitCost !== undefined) {
        const subtotal = qty * scaled(line.unitCost,6); sum += subtotal; subtotals.push(decimal(subtotal,9));
      } else { subtotals.push(null); known = false; }
    } catch { subtotals.push(null); known = false; }
  }
  return { quantities: Object.fromEntries(Object.entries(quantities).map(([unit,qty]) => [unit,decimal(qty,3)])), subtotals, total: lines.length && known ? decimal(sum,9) : null };
}
export function formatDecimal(value, language, minimum = 0) {
  if (value === null || value === undefined || value === "") return "—";
  const [integer, fractional = ""] = String(value).split(".");
  const fraction = fractional.replace(/0+$/, "").padEnd(minimum,"0");
  const separator = new Intl.NumberFormat(language).formatToParts(1.1).find(p => p.type === "decimal").value;
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(BigInt(integer)) + (fraction ? separator + fraction : "");
}
