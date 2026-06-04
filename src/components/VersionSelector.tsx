import {
  Badge,
  Label,
  MessageBar,
  MessageBarBody,
  Select,
  Text,
} from '@fluentui/react-components';
import { useOrg } from '../context/useOrg';

export function VersionSelector() {
  const {
    dataVersions,
    activeVersionId,
    selectDataVersion,
    activeVersion,
  } = useOrg();

  if (dataVersions.length === 0) {
    return (
      <Text size={200} className="version-selector-empty">
        尚無可載入的資料版本
      </Text>
    );
  }

  return (
    <div className="version-selector">
      <Label htmlFor="data-version">資料版本</Label>
      <Select
        id="data-version"
        value={activeVersionId}
        onChange={(_e, d) => selectDataVersion(d.value)}
        size="small"
        style={{ minWidth: 260 }}
      >
        {dataVersions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.valid ? '✓ ' : '✗ '}
            {v.label}
          </option>
        ))}
      </Select>
      {activeVersion && (
        <Badge
          appearance={activeVersion.valid ? 'filled' : 'ghost'}
          color={activeVersion.valid ? 'success' : 'danger'}
        >
          {activeVersion.valid ? '驗證通過' : '驗證失敗'}
        </Badge>
      )}
      {activeVersion && !activeVersion.valid && activeVersion.errors.length > 0 && (
        <MessageBar intent="error" className="version-validation-bar">
          <MessageBarBody>
            <ul className="version-validation-list">
              {activeVersion.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}
