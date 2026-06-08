import * as XLSX from '@e965/xlsx';
import { matrixToOrgData, type CsvToOrgResult } from './csvToOrgData';

/**
 * 將 .xlsx 內容（ArrayBuffer）的第一張工作表轉成二維字串陣列。
 * 空白儲存格以空字串表示；數字／日期以顯示文字輸出（raw: false）。
 */
export function parseXlsxToMatrix(buffer: ArrayBuffer): string[][] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  return rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
}

/** 由 .xlsx（員工 × 組別）建立 OrgData，重用 CSV 的轉換核心。 */
export function xlsxToOrgData(
  buffer: ArrayBuffer,
  options?: { version?: number; exportedAt?: string },
): CsvToOrgResult {
  return matrixToOrgData(parseXlsxToMatrix(buffer), options);
}
