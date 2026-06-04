import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orgDataToCsvMemberRows } from '../src/services/csvToOrgData.ts';
import type { OrgData } from '../src/types/org.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const orgData = JSON.parse(
  readFileSync(resolve(root, 'src/data/org-data.json'), 'utf8'),
) as OrgData;

const header = [
  '# 成員歸屬 CSV：一列一筆 assignment',
  '# 主管工號以 | 分隔；isPrimaryGroup 填 1/0',
  '#',
].join('\n');

const csv = orgDataToCsvMemberRows(orgData);
const out = resolve(root, 'src/data/templates/org-members.sample.csv');
writeFileSync(out, `\uFEFF${header}\n${csv}\n`, 'utf8');
console.log(`Wrote ${out}`);
