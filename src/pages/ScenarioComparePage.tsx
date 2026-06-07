import { useMemo, useState } from 'react';
import { Plus, Star, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { buttonIntent } from '@/lib/uiSemantics';
import { selectOptionLabel, toSelectOptions } from '@/lib/selectOptions';
import { useOrg } from '../context/useOrg';
import type { DataVersionInfo } from '../services/dataVersions';
import {
  buildScenarioComparison,
  type ScenarioInput,
  type ScenarioResult,
} from '../services/scenarioCompare';

/** UI 限制：最多 4 個情境槽（契約 §3）。 */
const MAX_SLOTS = 4;
/** 至少 2 個情境才開始呈現對照（契約 §3）。 */
const MIN_SCENARIOS_FOR_COMPARE = 2;

/** 槽位狀態：空字串＝未選版本。第一個槽為基準。 */
type SlotState = string;

/**
 * 預設槽位：第一槽預設指向當前 active 版本（若存在），其餘留空，
 * 讓使用者主動選第二個情境後才觸發比對。
 */
function initialSlots(activeVersionId: string): SlotState[] {
  return [activeVersionId, ''];
}

/** 依 versionId 解析到 DataVersionInfo（含 valid 篩選）。 */
function findVersion(
  dataVersions: DataVersionInfo[],
  versionId: string,
): DataVersionInfo | undefined {
  if (!versionId) return undefined;
  return dataVersions.find((v) => v.id === versionId);
}

/** 將槽位陣列攤平成有效的 ScenarioInput[]（剔除空槽與無效版本）。 */
function toScenarioInputs(
  slots: SlotState[],
  dataVersions: DataVersionInfo[],
): ScenarioInput[] {
  const inputs: ScenarioInput[] = [];
  for (const id of slots) {
    const v = findVersion(dataVersions, id);
    if (!v || !v.valid) continue;
    inputs.push({ versionId: v.id, label: v.label, data: v.data });
  }
  return inputs;
}

/** 槽位選擇器（單一槽）。 */
function ScenarioSlotSelect({
  value,
  versions,
  onChange,
  disabledIds,
  placeholder,
}: {
  value: string;
  versions: DataVersionInfo[];
  onChange: (id: string) => void;
  /** 已被其他槽選走的 id（避免重複比較同一版本）。 */
  disabledIds: Set<string>;
  placeholder: string;
}) {
  const options = useMemo(
    () =>
      toSelectOptions(
        versions,
        value,
        (v) => v.id,
        (v) => `${v.valid ? '' : '✗ '}${v.label}`,
      ),
    [versions, value],
  );

  /** 快速以 id 查回原始 version 以判斷 valid。 */
  const versionById = useMemo(() => {
    const map = new Map<string, DataVersionInfo>();
    for (const v of versions) map.set(v.id, v);
    return map;
  }, [versions]);

  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger className="w-full min-w-[220px] bg-background">
        <SelectValue placeholder={placeholder}>
          {selectOptionLabel(options, value) ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => {
          const isOtherUsed = disabledIds.has(o.value) && o.value !== value;
          const isInvalid = versionById.get(o.value)?.valid === false;
          return (
            <SelectItem
              key={o.value}
              value={o.value}
              disabled={isOtherUsed || isInvalid}
            >
              {o.label}
              {isOtherUsed && (
                <span className="ml-2 text-xs text-muted-foreground">
                  （其他槽已選）
                </span>
              )}
              {isInvalid && !isOtherUsed && (
                <span className="ml-2 text-xs text-muted-foreground">
                  （格式錯誤）
                </span>
              )}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/** 單一情境槽卡片：版本選擇 + 健檢摘要 + 刪除。 */
function ScenarioSlotCard({
  index,
  isBaseline,
  slot,
  versions,
  disabledIds,
  result,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  isBaseline: boolean;
  slot: SlotState;
  versions: DataVersionInfo[];
  disabledIds: Set<string>;
  /** 已選定版本時對應的計算結果（可能為 undefined：尚未選或無效）。 */
  result?: ScenarioResult;
  canRemove: boolean;
  onChange: (id: string) => void;
  onRemove: () => void;
}) {
  return (
    <Card size="sm" className="flex flex-1 min-w-[240px] flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="flex items-center gap-1.5">
            {isBaseline ? (
              <Badge variant="info" className="gap-1">
                <Star className="size-3" />
                基準
              </Badge>
            ) : (
              <Badge variant="outline">情境 {index}</Badge>
            )}
          </CardDescription>
          {canRemove && (
            <Button
              type="button"
              variant={buttonIntent.quiet}
              size="icon"
              onClick={onRemove}
              aria-label="移除此情境"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <ScenarioSlotSelect
          value={slot}
          versions={versions}
          onChange={onChange}
          disabledIds={disabledIds}
          placeholder={isBaseline ? '選擇基準版本' : '選擇情境版本'}
        />
      </CardHeader>
      {result && (
        <CardContent className="flex flex-col gap-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">在職人數</span>
            <span className="font-medium">
              {result.health.summary.activeEmployees}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">部門 / 職能</span>
            <span className="font-medium">
              {result.health.summary.departments} /{' '}
              {result.health.summary.functions}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">警示</span>
            <span
              className={
                result.health.summary.warningCount > 0
                  ? 'font-medium text-warning-foreground'
                  : 'font-medium'
              }
            >
              {result.health.summary.warningCount}
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/** 對「down 方向」指標的著色：最大值 warning、最小值 success；只有差異時才上色。 */
function resolveCellTone(
  values: (number | string)[],
  index: number,
  direction: 'up' | 'down' | 'neutral',
): 'warning' | 'success' | undefined {
  if (direction !== 'down') return undefined;
  const nums = values.map((v) => (typeof v === 'number' ? v : Number(v)));
  if (nums.some((n) => Number.isNaN(n))) return undefined;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max === min) return undefined; // 全相同不需強調
  if (nums[index] === max) return 'warning';
  if (nums[index] === min) return 'success';
  return undefined;
}

const toneClass: Record<'warning' | 'success', string> = {
  warning: 'text-warning-foreground font-semibold',
  success: 'text-success font-semibold',
};

/** 結構差異摘要（每個非基準情境一張卡）。 */
function DiffSummaryCard({
  result,
  baselineLabel,
  baselineAssignmentTotal,
}: {
  result: ScenarioResult;
  baselineLabel: string;
  /** 基準歸屬總數（對齊 retained.unchangedRatio 的分母群體）。 */
  baselineAssignmentTotal: number;
}) {
  const s = result.diffSummary;
  const totalEmployeeChange =
    s.addedEmployees + s.removedEmployees + s.modifiedEmployees;
  const totalAssignmentChange =
    s.addedAssignments + s.removedAssignments + s.modifiedAssignments;
  const noChange = totalEmployeeChange + totalAssignmentChange === 0;

  // R0.4 保留事項（安定感訊號）：大部分配置不變先講（以歸屬為準）。
  const { unchangedAssignments, unchangedRatio } = result.retained;
  const retainedPercent = Math.round(unchangedRatio * 100);
  const showRetained = baselineAssignmentTotal > 0;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">
          {result.input.label}
        </CardTitle>
        <CardDescription>
          相對基準「{baselineLabel}」的結構差異
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {noChange ? (
          <p className="text-sm text-muted-foreground">
            與基準結構完全相同。
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {s.addedEmployees > 0 && (
              <Badge variant="success">新增 {s.addedEmployees} 人</Badge>
            )}
            {s.removedEmployees > 0 && (
              <Badge variant="destructive">移除 {s.removedEmployees} 人</Badge>
            )}
            {s.modifiedEmployees > 0 && (
              <Badge variant="warning">員工異動 {s.modifiedEmployees} 筆</Badge>
            )}
            {s.addedAssignments > 0 && (
              <Badge variant="success">
                新增 {s.addedAssignments} 筆歸屬
              </Badge>
            )}
            {s.removedAssignments > 0 && (
              <Badge variant="destructive">
                移除 {s.removedAssignments} 筆歸屬
              </Badge>
            )}
            {s.modifiedAssignments > 0 && (
              <Badge variant="warning">
                調整 {s.modifiedAssignments} 筆歸屬
              </Badge>
            )}
            {s.addedEdges > 0 && (
              <Badge variant="info">新增 {s.addedEdges} 條匯報線</Badge>
            )}
            {s.removedEdges > 0 && (
              <Badge variant="muted">
                移除 {s.removedEdges} 條匯報線
              </Badge>
            )}
          </ul>
        )}

        {/* R0.4 保留事項：先講「大部分不變」以降低焦慮（CM）。 */}
        {showRetained && (
          <p className="flex items-start gap-1.5 text-sm text-success">
            <span aria-hidden="true">✓</span>
            <span>
              <strong className="font-semibold">
                {retainedPercent}% 的人員配置維持不變
              </strong>
              （{baselineAssignmentTotal} 筆歸屬中 {unchangedAssignments}{' '}
              筆不受影響）
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ScenarioComparePage() {
  const { dataVersions, activeVersionId } = useOrg();
  const [slots, setSlots] = useState<SlotState[]>(() =>
    initialSlots(activeVersionId),
  );

  const inputs = useMemo(
    () => toScenarioInputs(slots, dataVersions),
    [slots, dataVersions],
  );

  const comparison = useMemo(
    () => buildScenarioComparison(inputs),
    [inputs],
  );

  /** 對每個槽：除了自己以外其他槽已選的 id（避免重複比較同一版本）。 */
  const disabledIdsPerSlot = useMemo(() => {
    return slots.map(
      (_, i) =>
        new Set(slots.filter((id, j) => j !== i && id !== '')),
    );
  }, [slots]);

  /** 由 versionId 對應到計算結果（順序＝inputs 順序）。 */
  const resultByVersionId = useMemo(() => {
    const map = new Map<string, ScenarioResult>();
    for (const r of comparison.scenarios) {
      map.set(r.input.versionId, r);
    }
    return map;
  }, [comparison]);

  const handleSlotChange = (index: number, id: string) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? id : s)));
  };

  const handleRemoveSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddSlot = () => {
    setSlots((prev) => (prev.length >= MAX_SLOTS ? prev : [...prev, '']));
  };

  const canAddSlot = slots.length < MAX_SLOTS;
  const baselineResult = comparison.scenarios[0];
  const hasEnoughScenarios =
    comparison.scenarios.length >= MIN_SCENARIOS_FOR_COMPARE;

  /**
   * 真正會被當基準的槽位 index：
   * 對齊 `buildScenarioComparison`──它把 `inputs[0]` 當基準，
   * 而 `toScenarioInputs` 會跳過空字串與無效版本。
   * 因此第一個「有選版本且 valid」的槽，才是 UI 上應標示「基準」的那一槽。
   * 沒有任何有效槽時為 -1（不顯示基準徽章）。
   */
  const baselineSlotIndex = useMemo(() => {
    for (let i = 0; i < slots.length; i++) {
      const v = findVersion(dataVersions, slots[i]);
      if (v && v.valid) return i;
    }
    return -1;
  }, [slots, dataVersions]);

  /** 若基準不在第 0 槽，提示使用者目前基準對應的槽位與版本名。 */
  const baselineCalloutText =
    baselineSlotIndex > 0 && baselineResult
      ? `目前基準＝第 ${baselineSlotIndex + 1} 槽（${baselineResult.input.label}）`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">情境比較</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          選 2~4
          個發布版本或內建範例並排比較：左到右為基準與其他情境，下方呈現規劃指標對照與結構差異摘要，協助試算多案後選擇。
        </p>
      </header>

      {/* 1. 情境槽列 */}
      {baselineCalloutText && (
        <p className="text-xs text-muted-foreground">{baselineCalloutText}</p>
      )}
      <section className="flex flex-wrap gap-3">
        {slots.map((slot, index) => (
          <ScenarioSlotCard
            key={index}
            index={index}
            isBaseline={index === baselineSlotIndex}
            slot={slot}
            versions={dataVersions}
            disabledIds={disabledIdsPerSlot[index]}
            result={resultByVersionId.get(slot)}
            canRemove={slots.length > 1}
            onChange={(id) => handleSlotChange(index, id)}
            onRemove={() => handleRemoveSlot(index)}
          />
        ))}
        {canAddSlot && (
          <button
            type="button"
            onClick={handleAddSlot}
            className="flex min-h-[160px] min-w-[200px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            aria-label="加入情境"
          >
            <Plus className="size-5" />
            加入情境
          </button>
        )}
      </section>

      {/* 至少 2 個情境才呈現對照 */}
      {!hasEnoughScenarios ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            請選擇至少 2 個有效版本，即可進行情境對照。
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 2. 指標對照表 */}
          <Card>
            <CardHeader>
              <CardTitle>規劃指標對照</CardTitle>
              <CardDescription>
                橫向比較各情境的健檢指標；缺口／風險類指標（警示／無成員職能／無
                lead／單點風險）以最大值警示、最小值正向標示。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">指標</TableHead>
                    {comparison.scenarios.map((r, i) => (
                      <TableHead
                        key={r.input.versionId}
                        className="text-right"
                      >
                        <div className="flex flex-col items-end gap-0.5">
                          {i === 0 && (
                            <Badge variant="info" className="gap-1">
                              <Star className="size-3" />
                              基準
                            </Badge>
                          )}
                          <span className="font-normal text-foreground">
                            {r.input.label}
                          </span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.metricMatrix.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">
                        {row.label}
                        {row.direction === 'down' && (
                          <span
                            className="ml-1 text-xs text-muted-foreground"
                            title="此指標越少越好"
                          >
                            （越少越好）
                          </span>
                        )}
                      </TableCell>
                      {row.values.map((v, i) => {
                        const tone = resolveCellTone(
                          row.values,
                          i,
                          row.direction,
                        );
                        return (
                          <TableCell
                            key={i}
                            className={`text-right ${
                              tone ? toneClass[tone] : ''
                            }`}
                          >
                            {v}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 3. 結構差異摘要（每個非基準情境一張卡） */}
          <section className="grid gap-4 lg:grid-cols-2">
            {comparison.scenarios.slice(1).map((r) => (
              <DiffSummaryCard
                key={r.input.versionId}
                result={r}
                baselineLabel={baselineResult?.input.label ?? ''}
                baselineAssignmentTotal={
                  baselineResult?.input.data.assignments.length ?? 0
                }
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
