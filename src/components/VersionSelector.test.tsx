import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionSelector } from './VersionSelector';
import { useOrg } from '../context/useOrg';
import { renderWithProviders } from '../test/renderWithProviders';

/**
 * VersionSelector 的 R4.3「調整理由」顯示測試。
 *
 * VersionSelector 直接讀取 useOrg().activeVersion，無法以純 props 注入，
 * 因此以 OrgProvider 包裹的小型 harness：透過按鈕呼叫 publishVersion 發布
 * 一個帶／不帶 note 的本機版本（發布後即成為 activeVersion），再驗證
 * 「調整理由：…」一行是否依 note 有無顯示。
 *
 * 不重測下拉本體與生效日後綴（已由其他測試/服務層覆蓋）。
 */

/** 點此按鈕發布一個帶 note 的版本，使其成為 activeVersion。 */
function PublishWithNote({ note }: { note?: string }) {
  const { data, publishVersion } = useOrg();
  return (
    <button
      type="button"
      onClick={() => publishVersion(data, { label: '測試版', note })}
    >
      發布測試版
    </button>
  );
}

function renderSelector(note?: string) {
  return renderWithProviders(
    <>
      <PublishWithNote note={note} />
      <VersionSelector />
    </>,
  );
}

describe('VersionSelector — R4.3 調整理由顯示', () => {
  it('active 版本有 note 時顯示「調整理由：…」', async () => {
    const user = userEvent.setup();
    renderSelector('整併重疊職能');

    // 發布前：尚未有帶 note 的 active 版本
    expect(screen.queryByText(/調整理由：/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '發布測試版' }));

    expect(
      screen.getByText('調整理由：整併重疊職能'),
    ).toBeInTheDocument();
  });

  it('active 版本無 note 時不顯示理由行', async () => {
    const user = userEvent.setup();
    renderSelector(undefined);

    await user.click(screen.getByRole('button', { name: '發布測試版' }));

    // 已切換為剛發布的版本（無 note）→ 不顯示理由行
    expect(screen.queryByText(/調整理由：/)).not.toBeInTheDocument();
  });
});
