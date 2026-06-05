import { GitBranch, Clock } from 'lucide-react';

const branch = import.meta.env.VITE_BRANCH_NAME as string | undefined;
const deployTime = import.meta.env.VITE_DEPLOY_TIME as string | undefined;

export function DeployInfo() {
  if (!branch) return null;

  const formattedTime = deployTime
    ? new Date(deployTime).toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <GitBranch className="size-3" />
        <span className="font-mono font-medium text-foreground">{branch}</span>
      </span>
      {formattedTime && (
        <>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formattedTime}
          </span>
        </>
      )}
    </div>
  );
}
