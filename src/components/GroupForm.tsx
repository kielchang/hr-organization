import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Option,
} from '@fluentui/react-components';
import type { OptionOnSelectData, SelectionEvents } from '@fluentui/react-components';
import { useState } from 'react';
import type { Group } from '../types/org';
import { useOrg } from '../context/OrgContext';

interface GroupFormProps {
  open: boolean;
  group: Group | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function GroupForm({
  open,
  group: initial,
  isNew,
  onClose,
  onSaved,
}: GroupFormProps) {
  const { data, saveGroup } = useOrg();
  const [group, setGroup] = useState<Group>(
    initial ?? {
      id: `g_${crypto.randomUUID().slice(0, 8)}`,
      code: '',
      name: '',
      parentId: null,
      status: 'active',
    },
  );
  const [error, setError] = useState<string | null>(null);

  const parentOptions = data.groups.filter((g) => g.id !== group.id);

  const onSave = () => {
    if (!group.code.trim() || !group.name.trim()) {
      setError('請填寫代碼與名稱');
      return;
    }
    const err = saveGroup(group, isNew);
    if (err) {
      setError(err);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(_e, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{isNew ? '新增組別' : '編輯組別'}</DialogTitle>
          <DialogContent>
            {error && <p className="form-error">{error}</p>}
            <Field label="代碼" required>
              <Input
                value={group.code}
                onChange={(_e, d) => setGroup((g) => ({ ...g, code: d.value }))}
              />
            </Field>
            <Field label="名稱" required>
              <Input
                value={group.name}
                onChange={(_e, d) => setGroup((g) => ({ ...g, name: d.value }))}
              />
            </Field>
            <Field label="上層組別">
              <Dropdown
                value={
                  group.parentId
                    ? (data.groups.find((g) => g.id === group.parentId)?.name ??
                      '')
                    : '（無）'
                }
                selectedOptions={group.parentId ? [group.parentId] : ['']}
                onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
                  setGroup((g) => ({
                    ...g,
                    parentId: opt.optionValue || null,
                  }));
                }}
              >
                <Option value="">（無）</Option>
                {parentOptions.map((g) => (
                  <Option key={g.id} value={g.id} text={g.name}>
                    {g.name}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="狀態">
              <Dropdown
                value={group.status === 'active' ? '啟用' : '停用'}
                selectedOptions={[group.status]}
                onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
                  if (opt.optionValue) {
                    setGroup((g) => ({
                      ...g,
                      status: opt.optionValue as Group['status'],
                    }));
                  }
                }}
              >
                <Option value="active">啟用</Option>
                <Option value="inactive">停用</Option>
              </Dropdown>
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              取消
            </Button>
            <Button appearance="primary" onClick={onSave}>
              儲存
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
