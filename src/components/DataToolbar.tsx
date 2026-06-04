import { useRef } from 'react';
import {
  Input,
  Label,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
} from '@fluentui/react-components';
import {
  ArrowDownload24Regular,
  ArrowUpload24Regular,
} from '@fluentui/react-icons';
import { parseOrgDataFile } from '../services/exportImport';
import { useOrg } from '../context/OrgContext';
import { VersionSelector } from './VersionSelector';

export function DataToolbar() {
  const { exportData, loadFromFile, operator, setOperator } = useOrg();
  const fileRef = useRef<HTMLInputElement>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseOrgDataFile(file);
      loadFromFile(parsed);
    } catch (err) {
      alert(err instanceof Error ? err.message : '載入失敗');
    }
    e.target.value = '';
  };

  return (
    <Toolbar className="data-toolbar">
      <ToolbarGroup className="data-toolbar-versions">
        <VersionSelector />
      </ToolbarGroup>
      <ToolbarGroup>
        <Label htmlFor="operator">操作者</Label>
        <Input
          id="operator"
          value={operator}
          onChange={(_e, d) => setOperator(d.value)}
          size="small"
          style={{ width: 140 }}
        />
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton
          icon={<ArrowDownload24Regular />}
          onClick={() => exportData()}
        >
          匯出目前資料
        </ToolbarButton>
        <ToolbarButton
          icon={<ArrowUpload24Regular />}
          onClick={() => fileRef.current?.click()}
        >
          從檔案載入
        </ToolbarButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onFileChange}
        />
      </ToolbarGroup>
    </Toolbar>
  );
}
