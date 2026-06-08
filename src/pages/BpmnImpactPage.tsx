import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBpmn } from '../context/useBpmn';
import { useOrg } from '../context/useOrg';
import { diffProcessImpact, analyzeProcessHealth } from '../services/processImpact';
import { BaselineSelector } from '../components/bpmn/impact/BaselineSelector';
import { ImpactSummaryCards } from '../components/bpmn/impact/ImpactSummaryCards';
import { ProcessImpactRow } from '../components/bpmn/impact/ProcessImpactRow';
import { ProcessHealthRow } from '../components/bpmn/impact/ProcessHealthRow';

type BaselineSource = 'snapshot' | 'version';

export function BpmnImpactPage() {
  const navigate = useNavigate();
  const { store, captureBaseline, clearBaseline } = useBpmn();
  const { data: currentOrg, dataVersions } = useOrg();

  const [source, setSource] = useState<BaselineSource>('snapshot');
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    dataVersions[0]?.id ?? '',
  );

  // Resolve baseline OrgData depending on source
  const baselineOrg = useMemo(() => {
    if (source === 'snapshot') return store.impactBaseline?.data ?? null;
    const v = dataVersions.find((v) => v.id === selectedVersionId);
    return v?.valid ? v.data : null;
  }, [source, store.impactBaseline, selectedVersionId, dataVersions]);

  // Compute impact for all processes (memoized)
  const processImpacts = useMemo(() => {
    if (!baselineOrg) return [];
    return store.processes.map((p) => diffProcessImpact(p, baselineOrg, currentOrg));
  }, [store.processes, baselineOrg, currentOrg]);

  // Health check for all processes (memoized, no baseline needed)
  const processHealthList = useMemo(
    () => store.processes.map((p) => analyzeProcessHealth(p, currentOrg)),
    [store.processes, currentOrg],
  );

  const affectedCount = processImpacts.filter((i) => i.severity !== 'none').length;
  const noProcesses = store.processes.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">變更影響分析</h2>
          <p className="text-sm text-muted-foreground">
            比較組織調整前後，動到哪些作業／決策流程的核准人與路徑——協助規劃決策
          </p>
        </div>
      </div>

      {/* HR-friendly intro callout（§5.1 文案：「找不到核准人」） */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        完成組織調整後，這裡會告訴你：哪些作業／決策流程的
        <strong className="font-semibold text-foreground">核准人</strong>
        因人事變動而改變、哪些流程因主管異動
        <strong className="font-semibold text-foreground">找不到核准人</strong>
        。沒有流程資料時，可至下方「進階：管理流程定義」設定。
      </div>

      {noProcesses ? (
        // §5.2：無流程定義時的主要 CTA。隱藏 Tabs 與頁尾「進階」連結，
        // 用單一卡片把使用者導向 /bpmn——避免雙重入口造成選擇疲勞。
        <Card className="border-sidebar-primary/30 bg-sidebar-primary/5">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              先建立流程，才能比對影響
            </CardDescription>
            <CardTitle className="text-xl">還沒有任何流程定義</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm text-muted-foreground">
              影響分析需要先有 BPMN 流程才能比對。建立第一個流程後再回到這頁。
            </p>
            <Button variant="brand" onClick={() => navigate('/bpmn')}>
              前往管理流程定義
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Baseline Selector */}
          <BaselineSelector
            baseline={store.impactBaseline}
            dataVersions={dataVersions}
            selectedVersionId={selectedVersionId}
            onCapture={() => captureBaseline(currentOrg)}
            onClear={clearBaseline}
            onSelectVersion={setSelectedVersionId}
            onSourceChange={setSource}
            source={source}
          />

          <Tabs defaultValue="impact">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="impact" className="gap-1.5">
                變更影響比對
                {affectedCount > 0 && (
                  <Badge variant="destructive" className="text-[9px] ml-1">{affectedCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="health" className="gap-1.5">
                流程健檢
                {processHealthList.some((h) => h.severity !== 'ok') && (
                  <Badge variant="warning" className="text-[9px] ml-1">
                    {processHealthList.filter((h) => h.severity !== 'ok').length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Impact diff ── */}
            <TabsContent value="impact" className="space-y-4 mt-4">
              {!baselineOrg ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
                  <RefreshCw className="size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {source === 'snapshot'
                      ? '請先建立基準快照，再調整組織資料，即可比對影響'
                      : '請選擇一個已存版本作為比對基準'}
                  </p>
                </div>
              ) : (
                <>
                  <ImpactSummaryCards impacts={processImpacts} />

                  <div className="space-y-3">
                    {processImpacts.every((i) => i.severity === 'none') ? (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 py-10 text-center">
                        <p className="text-sm font-medium text-emerald-700">所有流程均未受影響</p>
                        <p className="text-xs text-muted-foreground">
                          基準與目前組織的核准人及路徑完全相同
                        </p>
                      </div>
                    ) : (
                      processImpacts
                        .filter((i) => i.severity !== 'none')
                        .sort((a, b) => {
                          const order = { critical: 0, high: 1, medium: 2, none: 3 };
                          return order[a.severity] - order[b.severity];
                        })
                        .map((impact) => (
                          <ProcessImpactRow key={impact.processId} impact={impact} />
                        ))
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── Tab 2: Health check ── */}
            <TabsContent value="health" className="space-y-4 mt-4">
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                以目前組織資料（即時）對所有流程進行健檢，無需設定基準。
                統計各核准節點的「找不到核准人」及「僅一位核准人（無備援）」情況。
              </div>

              <ScrollArea>
                <div className="space-y-3">
                  {processHealthList.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">尚無流程</p>
                  ) : (
                    processHealthList
                      .sort((a, b) => {
                        const order = { critical: 0, warning: 1, ok: 2 };
                        return order[a.severity] - order[b.severity];
                      })
                      .map((health) => (
                        <ProcessHealthRow key={health.processId} health={health} />
                      ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Secondary entry to manage BPMN process definitions */}
          <div className="flex justify-end border-t border-border pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => navigate('/bpmn')}
            >
              進階：管理流程定義 →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
