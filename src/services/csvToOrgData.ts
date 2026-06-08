import type { EntityStatus, OrgData } from '../types/org';
import { ORG_SCHEMA_VERSION } from './migrations/orgMigrations';
import { validateOrgData } from './validators';
import { parseCsv } from './csvParse';

/** 成員歸屬 CSV 欄位（一列 = 一筆 assignment） */
export const CSV_MEMBER_COLUMNS = [
  'employeeNo',
  'employeeName',
  'employeeStatus',
  'groupCode',
  'groupName',
  'parentGroupCode',
  'groupStatus',
  'jobLevelCode',
  'jobLevelName',
  'jobLevelRank',
  'supervisorEmployeeNos',
  'primarySupervisorEmployeeNo',
  'isPrimaryGroup',
] as const;

export type CsvMemberColumn = (typeof CSV_MEMBER_COLUMNS)[number];

/**
 * 欄位中文對應（R5.3 單一事實來源）。
 * - key：既有英文 const，型別／匯出／UI 多處沿用，不變。
 * - zh：中文主名，用於匯出 header、範本、缺欄位錯誤訊息。
 * - aliases：可被 header 接受的其他寫法（至少含英文 key；英文比對採 lowercase）。
 * 原則：中文為主、英文向後相容。中文欄名不得含逗號（避免 CSV 欄位歧義）。
 */
export interface CsvColumnDef {
  key: CsvMemberColumn;
  zh: string;
  aliases: string[];
}

export const CSV_MEMBER_COLUMN_DEFS: CsvColumnDef[] = [
  { key: 'employeeNo', zh: '員工工號', aliases: ['employeeNo'] },
  { key: 'employeeName', zh: '員工姓名', aliases: ['employeeName'] },
  { key: 'employeeStatus', zh: '在職狀態', aliases: ['employeeStatus'] },
  { key: 'groupCode', zh: '組別代碼', aliases: ['groupCode'] },
  { key: 'groupName', zh: '組別名稱', aliases: ['groupName'] },
  { key: 'parentGroupCode', zh: '上層組別代碼', aliases: ['parentGroupCode'] },
  { key: 'groupStatus', zh: '組別狀態', aliases: ['groupStatus'] },
  { key: 'jobLevelCode', zh: '職級代碼', aliases: ['jobLevelCode'] },
  { key: 'jobLevelName', zh: '職級名稱', aliases: ['jobLevelName'] },
  { key: 'jobLevelRank', zh: '職級層級', aliases: ['jobLevelRank'] },
  { key: 'supervisorEmployeeNos', zh: '主管工號', aliases: ['supervisorEmployeeNos'] },
  {
    key: 'primarySupervisorEmployeeNo',
    zh: '直屬主管工號',
    aliases: ['primarySupervisorEmployeeNo'],
  },
  { key: 'isPrimaryGroup', zh: '是否主要組別', aliases: ['isPrimaryGroup'] },
];

/** 依 CSV_MEMBER_COLUMNS 的順序回傳中文主名。 */
const CSV_COLUMN_DEF_BY_KEY = new Map(
  CSV_MEMBER_COLUMN_DEFS.map((def) => [def.key, def]),
);

/** 取某欄位的中文主名（匯出 header／錯誤訊息用）。 */
export function csvColumnZh(key: CsvMemberColumn): string {
  return CSV_COLUMN_DEF_BY_KEY.get(key)?.zh ?? key;
}

/** 匯出／範本用的中文 header 陣列，順序與 CSV_MEMBER_COLUMNS 一致。 */
export const CSV_MEMBER_COLUMNS_ZH: string[] = CSV_MEMBER_COLUMNS.map(csvColumnZh);

export interface CsvToOrgResult {
  data: OrgData;
  parseErrors: string[];
  validationErrors: string[];
  valid: boolean;
  rowCount: number;
}

function slugKey(value: string): string {
  return value.trim().replace(/\s+/g, '_');
}

function employeeId(employeeNo: string): string {
  return `e-${slugKey(employeeNo)}`;
}

function groupId(groupCode: string): string {
  return `g-${slugKey(groupCode)}`;
}

function jobLevelId(code: string): string {
  return `jl-${slugKey(code)}`;
}

function assignmentId(employeeNo: string, groupCode: string): string {
  return `a-${slugKey(employeeNo)}-${slugKey(groupCode)}`;
}

function parseStatus(raw: string): EntityStatus | null {
  const v = raw.trim().toLowerCase();
  if (!v || v === 'active' || v === '在職' || v === 'y' || v === 'yes' || v === '1') {
    return 'active';
  }
  if (v === 'inactive' || v === '停用' || v === 'n' || v === 'no' || v === '0') {
    return 'inactive';
  }
  return null;
}

function parseBoolean(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'y' || v === 'yes' || v === '是';
}

function parseSupervisorList(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[|;、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseRank(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function csvMemberRowsToOrgData(
  csvText: string,
  options?: { version?: number; exportedAt?: string },
): CsvToOrgResult {
  return matrixToOrgData(parseCsv(csvText), options);
}

/** 由「員工 × 組別」二維表（來源可為 CSV 或 Excel）建立 OrgData。 */
export function matrixToOrgData(
  rawMatrix: string[][],
  options?: { version?: number; exportedAt?: string },
): CsvToOrgResult {
  const parseErrors: string[] = [];
  const matrix = rawMatrix.filter(
    (row) => !row[0]?.startsWith('#') && row.some((c) => c.length > 0),
  );

  if (matrix.length === 0) {
    return {
      data: emptyOrgData(options),
      parseErrors: ['資料為空'],
      validationErrors: [],
      valid: false,
      rowCount: 0,
    };
  }

  // header 每欄 trim；英文比對採 lowercase、中文 trim 即可。
  const header = matrix[0].map((h) => h.trim());
  const headerLower = header.map((h) => h.toLowerCase());
  const colIndex = new Map<CsvMemberColumn, number>();
  for (const def of CSV_MEMBER_COLUMN_DEFS) {
    // 依序找「中文主名 → 英文 key → 其他 alias」第一個命中的欄位 index。
    let idx = header.indexOf(def.zh);
    if (idx < 0) {
      for (const alias of def.aliases) {
        idx = headerLower.indexOf(alias.toLowerCase());
        if (idx >= 0) break;
      }
    }
    if (idx >= 0) colIndex.set(def.key, idx);
  }

  const missing = CSV_MEMBER_COLUMNS.filter((c) => !colIndex.has(c));
  if (missing.length > 0) {
    return {
      data: emptyOrgData(options),
      parseErrors: [`缺少必要欄位：${missing.map(csvColumnZh).join(', ')}`],
      validationErrors: [],
      valid: false,
      rowCount: 0,
    };
  }

  const get = (row: string[], col: CsvMemberColumn): string =>
    row[colIndex.get(col)!] ?? '';

  const employees = new Map<string, OrgData['employees'][0]>();
  const groups = new Map<string, OrgData['groups'][0]>();
  const jobLevels = new Map<string, OrgData['jobLevels'][0]>();
  interface PendingAssignment {
    id: string;
    employeeId: string;
    groupId: string;
    jobLevelId: string;
    isPrimaryGroup: boolean;
    supervisorNos: string[];
    primarySupervisorNo: string | null;
  }
  const pendingAssignments: PendingAssignment[] = [];
  const assignmentKeys = new Set<string>();

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    const rowNum = i + 1;

    const employeeNo = get(row, 'employeeNo');
    const employeeName = get(row, 'employeeName');
    const groupCode = get(row, 'groupCode');
    const groupName = get(row, 'groupName');
    const jobLevelCode = get(row, 'jobLevelCode');
    const jobLevelName = get(row, 'jobLevelName');

    if (!employeeNo) parseErrors.push(`第 ${rowNum} 列：employeeNo 不可為空`);
    if (!employeeName) parseErrors.push(`第 ${rowNum} 列：employeeName 不可為空`);
    if (!groupCode) parseErrors.push(`第 ${rowNum} 列：groupCode 不可為空`);
    if (!groupName) parseErrors.push(`第 ${rowNum} 列：groupName 不可為空`);
    if (!jobLevelCode) parseErrors.push(`第 ${rowNum} 列：jobLevelCode 不可為空`);
    if (parseErrors.some((e) => e.includes(`第 ${rowNum} 列`))) continue;

    const empStatus = parseStatus(get(row, 'employeeStatus'));
    if (!empStatus) {
      parseErrors.push(`第 ${rowNum} 列：employeeStatus 無效`);
      continue;
    }

    const grpStatus = parseStatus(get(row, 'groupStatus'));
    if (!grpStatus) {
      parseErrors.push(`第 ${rowNum} 列：groupStatus 無效`);
      continue;
    }

    const rank = parseRank(get(row, 'jobLevelRank'));
    if (rank === null) {
      parseErrors.push(`第 ${rowNum} 列：jobLevelRank 必須為數字`);
      continue;
    }

    const eid = employeeId(employeeNo);
    const gid = groupId(groupCode);
    const jlid = jobLevelId(jobLevelCode);
    const parentCode = get(row, 'parentGroupCode').trim();
    const parentId = parentCode ? groupId(parentCode) : null;

    const existingEmp = employees.get(employeeNo);
    if (existingEmp && existingEmp.name !== employeeName) {
      parseErrors.push(
        `第 ${rowNum} 列：員工 ${employeeNo} 姓名與先前列不一致（${existingEmp.name} / ${employeeName}）`,
      );
    } else {
      employees.set(employeeNo, {
        id: eid,
        employeeNo,
        name: employeeName,
        status: empStatus,
      });
    }

    const existingGrp = groups.get(groupCode);
    if (existingGrp) {
      if (existingGrp.name !== groupName) {
        parseErrors.push(`第 ${rowNum} 列：組別 ${groupCode} 名稱與先前列不一致`);
      }
      if (existingGrp.parentId !== parentId) {
        parseErrors.push(`第 ${rowNum} 列：組別 ${groupCode} 上層與先前列不一致`);
      }
    } else {
      groups.set(groupCode, {
        id: gid,
        code: groupCode,
        name: groupName,
        parentId,
        status: grpStatus,
        // v1 匯入一律視為部門；職能標記在 App 內後設。
        kind: 'department',
      });
    }

    const existingJl = jobLevels.get(jobLevelCode);
    if (existingJl) {
      if (existingJl.name !== jobLevelName || existingJl.rank !== rank) {
        parseErrors.push(`第 ${rowNum} 列：職級 ${jobLevelCode} 與先前列定義不一致`);
      }
    } else {
      jobLevels.set(jobLevelCode, {
        id: jlid,
        code: jobLevelCode,
        name: jobLevelName || jobLevelCode,
        rank,
      });
    }

    const assignKey = `${employeeNo}::${groupCode}`;
    if (assignmentKeys.has(assignKey)) {
      parseErrors.push(`第 ${rowNum} 列：重複的員工+組別組合 ${employeeNo} / ${groupCode}`);
      continue;
    }
    assignmentKeys.add(assignKey);

    const supervisorNos = parseSupervisorList(get(row, 'supervisorEmployeeNos'));
    const primaryNo = get(row, 'primarySupervisorEmployeeNo').trim();

    pendingAssignments.push({
      id: assignmentId(employeeNo, groupCode),
      employeeId: eid,
      groupId: gid,
      jobLevelId: jlid,
      isPrimaryGroup: parseBoolean(get(row, 'isPrimaryGroup')),
      supervisorNos,
      primarySupervisorNo: primaryNo || null,
    });
  }

  const employeeNoToId = new Map(
    [...employees.values()].map((e) => [e.employeeNo, e.id]),
  );

  const resolvedAssignments: OrgData['assignments'] = pendingAssignments.map(
    (raw) => {
      const supervisorIds: string[] = [];
      for (const no of raw.supervisorNos) {
        const sid = employeeNoToId.get(no);
        if (!sid) {
          parseErrors.push(
            `assignment ${raw.id}：找不到主管工號 ${no}`,
          );
        } else {
          supervisorIds.push(sid);
        }
      }
      let primarySupervisorId: string | null = null;
      if (raw.primarySupervisorNo) {
        primarySupervisorId =
          employeeNoToId.get(raw.primarySupervisorNo) ?? null;
        if (!primarySupervisorId) {
          parseErrors.push(
            `assignment ${raw.id}：找不到主主管工號 ${raw.primarySupervisorNo}`,
          );
        }
      }
      return {
        id: raw.id,
        employeeId: raw.employeeId,
        groupId: raw.groupId,
        jobLevelId: raw.jobLevelId,
        supervisorIds: [...new Set(supervisorIds)],
        primarySupervisorId,
        isPrimaryGroup: raw.isPrimaryGroup,
      };
    },
  );

  const data: OrgData = {
    schemaVersion: ORG_SCHEMA_VERSION,
    contentVersion: options?.version ?? 1,
    exportedAt: options?.exportedAt ?? new Date().toISOString(),
    employees: [...employees.values()],
    groups: [...groups.values()],
    jobLevels: [...jobLevels.values()].sort((a, b) => b.rank - a.rank),
    assignments: resolvedAssignments,
    changeLog: [],
  };

  const validationErrors =
    parseErrors.length === 0 ? validateOrgData(data) : [];

  return {
    data,
    parseErrors: [...new Set(parseErrors)],
    validationErrors: [...new Set(validationErrors)],
    valid: parseErrors.length === 0 && validationErrors.length === 0,
    rowCount: matrix.length - 1,
  };
}

function emptyOrgData(options?: { version?: number; exportedAt?: string }): OrgData {
  return {
    schemaVersion: ORG_SCHEMA_VERSION,
    contentVersion: options?.version ?? 1,
    exportedAt: options?.exportedAt ?? new Date().toISOString(),
    employees: [],
    groups: [],
    jobLevels: [],
    assignments: [],
    changeLog: [],
  };
}

export function orgDataToCsvMemberRows(data: OrgData): string {
  const employeeById = new Map(data.employees.map((e) => [e.id, e]));
  const groupById = new Map(data.groups.map((g) => [g.id, g]));
  const jobLevelById = new Map(data.jobLevels.map((j) => [j.id, j]));
  const groupCodeById = new Map(data.groups.map((g) => [g.id, g.code]));
  const parentCode = (parentId: string | null) =>
    parentId ? (groupCodeById.get(parentId) ?? '') : '';

  // 匯出 header 用中文主名（HR 友善；雙認故匯出→再匯入仍 OK）。
  const lines = [CSV_MEMBER_COLUMNS_ZH.map(csvEscape).join(',')];

  for (const a of data.assignments) {
    const emp = employeeById.get(a.employeeId);
    const grp = groupById.get(a.groupId);
    const jl = jobLevelById.get(a.jobLevelId);
    if (!emp || !grp || !jl) continue;

    const supervisorNos = a.supervisorIds
      .map((id) => employeeById.get(id)?.employeeNo ?? '')
      .filter(Boolean)
      .join('|');

    const primaryNo = a.primarySupervisorId
      ? (employeeById.get(a.primarySupervisorId)?.employeeNo ?? '')
      : '';

    const row = [
      emp.employeeNo,
      emp.name,
      emp.status,
      grp.code,
      grp.name,
      parentCode(grp.parentId),
      grp.status,
      jl.code,
      jl.name,
      String(jl.rank),
      supervisorNos,
      primaryNo,
      a.isPrimaryGroup ? '1' : '0',
    ].map(csvEscape);

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
