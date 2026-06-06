import { render } from '@testing-library/react';
import { assertNoA11yViolations } from '@/test/axe';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Badge } from './badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

/**
 * 核心 UI 元件的無障礙基準測試。
 *
 * 這些是設計系統的最小單元，務求預設即可及（accessible by default），
 * 任何回歸都會被此處攔下。color-contrast 因 jsdom 限制由 helper 停用，
 * 需於真實瀏覽器或視覺工具另行驗證。
 */
describe('UI 元件無障礙基準', () => {
  it('Button（含文字標籤）無違規', async () => {
    const { container } = render(
      <div>
        <Button>儲存</Button>
        <Button variant="outline">取消</Button>
        <Button variant="destructive">刪除</Button>
      </div>,
    );
    await assertNoA11yViolations(container);
  });

  it('純圖示 Button 搭配 aria-label 無違規', async () => {
    const { container } = render(
      <Button size="icon-sm" aria-label="關閉">
        <svg aria-hidden="true" />
      </Button>,
    );
    await assertNoA11yViolations(container);
  });

  it('Input 以 Label htmlFor 關聯時無違規', async () => {
    const { container } = render(
      <div>
        <Label htmlFor="ui-name">姓名</Label>
        <Input id="ui-name" defaultValue="王小明" />
      </div>,
    );
    await assertNoA11yViolations(container);
  });

  it('Badge 各語意變體無違規', async () => {
    const { container } = render(
      <div>
        <Badge variant="success">在職</Badge>
        <Badge variant="muted">離職</Badge>
        <Badge variant="destructive">停用</Badge>
        <Badge variant="info">主組別</Badge>
      </div>,
    );
    await assertNoA11yViolations(container);
  });

  it('Select 以 Label htmlFor 關聯 SelectTrigger 時無違規', async () => {
    const { container } = render(
      <div>
        <Label htmlFor="ui-status">狀態</Label>
        <Select value="active">
          <SelectTrigger id="ui-status" className="w-full">
            <SelectValue>在職</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">在職</SelectItem>
            <SelectItem value="inactive">離職</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    );
    await assertNoA11yViolations(container);
  });

  it('Tabs（tablist/tab/tabpanel）無違規', async () => {
    const { container } = render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">總覽</TabsTrigger>
          <TabsTrigger value="detail">明細</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">總覽內容</TabsContent>
        <TabsContent value="detail">明細內容</TabsContent>
      </Tabs>,
    );
    await assertNoA11yViolations(container);
  });
});
