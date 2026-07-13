// Excel 公式注入防護：任何儲存格值若以 = + - @ \t \r 開頭，
// Excel/Numbers 開啟時會嘗試當公式執行（CVE 級風險）。
// 修法：對字串型 cell 前綴單引號（Excel 視為文字不執行）。
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export function sanitizeCell(v: unknown): unknown {
  if (typeof v !== "string" || v.length === 0) return v;
  return FORMULA_PREFIXES.includes(v[0]) ? "'" + v : v;
}

export async function exportRowsToXlsx(
  rows: Record<string, unknown>[],
  fileName: string,
  sheetName = "參與者",
): Promise<void> {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}
