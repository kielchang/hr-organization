/**
 * 將成員歸屬 CSV 轉成 org JSON 並寫入 src/data/mock/
 *
 * 用法：
 *   npm run import:csv -- --input ./src/data/templates/org-members.sample.csv --output org-data-imported
 *   npm run import:csv -- -i members.csv -o org-data-v3 -v 3
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvMemberRowsToOrgData } from '../src/services/csvToOrgData.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const mockDir = resolve(projectRoot, 'src/data/mock');

function printUsage(): void {
  console.log(`
用法: npm run import:csv -- [選項]

選項:
  -i, --input <path>     輸入 CSV 路徑（必填）
  -o, --output <name>    輸出檔名（不含 .json，寫入 src/data/mock/）
  -v, --version <n>     JSON version 欄位（預設 1）
  -h, --help             顯示說明

範例:
  npm run import:csv -- -i ./src/data/templates/org-members.sample.csv -o org-data-imported -v 3
`);
}

function parseArgs(argv: string[]): {
  input: string;
  output: string;
  version: number;
} {
  let input = '';
  let output = '';
  let version = 1;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }
    if (arg === '-i' || arg === '--input') {
      input = argv[++i] ?? '';
    } else if (arg === '-o' || arg === '--output') {
      output = argv[++i] ?? '';
    } else if (arg === '-v' || arg === '--version') {
      version = Number(argv[++i] ?? '1');
    }
  }

  if (!input) {
    console.error('錯誤：請指定 --input CSV 路徑');
    printUsage();
    process.exit(1);
  }

  if (!output) {
    const base = basename(input, extname(input));
    output = base.replace(/\.csv$/i, '') || 'org-data-imported';
  }

  if (!Number.isFinite(version) || version < 1) {
    console.error('錯誤：--version 必須為正整數');
    process.exit(1);
  }

  return { input, output, version };
}

function main(): void {
  const { input, output, version } = parseArgs(process.argv.slice(2));
  const inputPath = resolve(projectRoot, input);
  const csvText = readFileSync(inputPath, 'utf8');

  const result = csvMemberRowsToOrgData(csvText, {
    version,
    exportedAt: new Date().toISOString(),
  });

  console.log(`已解析 ${result.rowCount} 列資料`);

  if (result.parseErrors.length > 0) {
    console.error('\n解析錯誤：');
    for (const e of result.parseErrors) console.error(`  - ${e}`);
  }

  if (result.validationErrors.length > 0) {
    console.error('\n驗證錯誤：');
    for (const e of result.validationErrors) console.error(`  - ${e}`);
  }

  if (!result.valid) {
    console.error('\n轉換失敗，未寫入檔案。');
    process.exit(1);
  }

  mkdirSync(mockDir, { recursive: true });
  const outName = output.endsWith('.json') ? output : `${output}.json`;
  const outPath = resolve(mockDir, outName);
  writeFileSync(outPath, `${JSON.stringify(result.data, null, 2)}\n`, 'utf8');

  console.log(`\n✓ 驗證通過`);
  console.log(`✓ 已寫入 ${outPath}`);
  console.log(`\n請重新啟動 npm run dev，即可在「資料版本」選單看到 ${basename(outName, '.json')}`);
}

main();
