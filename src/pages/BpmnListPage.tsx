import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Pencil, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBpmn } from '../context/BpmnProvider';
import type { BpmnProcess } from '../types/bpmn';

function newProcess(): BpmnProcess {
  const id = `proc-${Date.now()}`;
  const now = new Date().toISOString();
  return {
    id,
    name: '新流程',
    description: '',
    category: '一般',
    nodes: [
      { id: 'n-start', type: 'bpmnStart', position: { x: 60, y: 200 }, data: { label: '開始' } },
      { id: 'n-end', type: 'bpmnEnd', position: { x: 400, y: 200 }, data: { label: '結束' } },
    ],
    edges: [{ id: 'e-se', source: 'n-start', target: 'n-end' }],
    approvalThresholds: [],
    status: 'draft',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function BpmnListPage() {
  const { store, upsertProcess, deleteProcess } = useBpmn();
  const navigate = useNavigate();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function handleCreate() {
    const p = newProcess();
    upsertProcess(p);
    navigate(`/bpmn/${p.id}`);
  }

  function handleDelete(id: string) {
    deleteProcess(id);
    setConfirmId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">BPMN 流程管理</h2>
          <p className="text-sm text-muted-foreground">設計核決流程並模擬費用申請審批</p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="size-4" />新增流程
        </Button>
      </div>

      {store.processes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <FileText className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">尚無流程，點擊「新增流程」開始設計</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {store.processes.map((p) => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{p.name}</p>
                  <Badge variant="outline" className="text-[10px]">{p.category}</Badge>
                  <Badge
                    variant={p.status === 'active' ? 'success' : p.status === 'archived' ? 'muted' : 'warning'}
                    className="text-[10px]"
                  >
                    {p.status === 'active' ? '啟用' : p.status === 'draft' ? '草稿' : '封存'}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">{p.nodes.length} 節點</Badge>
                  <Badge variant="ghost" className="text-[10px]">v{p.version ?? 1}</Badge>
                </div>
                {p.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground truncate">{p.description}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  更新：{new Date(p.updatedAt).toLocaleString('zh-TW')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/bpmn/${p.id}/simulate`)}>
                  <Play className="size-3.5" />模擬
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/bpmn/${p.id}`)}>
                  <Pencil className="size-3.5" />設計
                </Button>
                {confirmId === p.id ? (
                  <div className="flex items-center gap-1">
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(p.id)}>確認刪除</Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmId(null)}>取消</Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmId(p.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
