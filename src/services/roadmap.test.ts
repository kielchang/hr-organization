import { describe, it, expect } from 'vitest';
import {
  countByStatus,
  getRoadmapData,
  groupItemsByPhase,
  type RoadmapData,
} from './roadmap';

/**
 * 單元測試：services/roadmap.ts
 * 對應契約 docs/契約-Roadmap頁面.md §2。
 *
 * - getRoadmapData() 回傳 frozen 物件、含必要鍵與必要 phases
 * - 已完成 7 項 + commit hash 對應
 * - countByStatus() 5 個欄位加總等於 total，done >= 7
 * - groupItemsByPhase() phase 按 order、item 按 id 字串升冪，且無孤兒
 */

describe('services/roadmap.ts', () => {
  describe('getRoadmapData()', () => {
    const data = getRoadmapData();

    it('回傳結果是 frozen', () => {
      expect(Object.isFrozen(data)).toBe(true);
    });

    it('包含必要鍵：phases / items / redLines / validationQuestions / lastUpdated', () => {
      expect(data).toHaveProperty('phases');
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('redLines');
      expect(data).toHaveProperty('validationQuestions');
      expect(data).toHaveProperty('lastUpdated');

      expect(Array.isArray(data.phases)).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(Array.isArray(data.redLines)).toBe(true);
      expect(Array.isArray(data.validationQuestions)).toBe(true);
      expect(typeof data.lastUpdated).toBe('string');
      expect(data.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('phases 至少含契約規定的 8 個 phase id', () => {
      const requiredPhaseIds = [
        'phase-completed',
        'phase-0',
        'phase-1',
        'phase-2',
        'phase-3',
        'phase-4',
        'phase-5',
        'phase-observing',
      ];
      const actualIds = data.phases.map((p) => p.id);
      for (const id of requiredPhaseIds) {
        expect(actualIds).toContain(id);
      }
    });

    it('phases 內 order 為唯一數字', () => {
      const orders = data.phases.map((p) => p.order);
      const uniqueOrders = new Set(orders);
      expect(uniqueOrders.size).toBe(orders.length);
      for (const o of orders) {
        expect(typeof o).toBe('number');
      }
    });

    it('已完成 7 個項目存在且帶 commitHash / completedAt（涵蓋 7 個指定 commit）', () => {
      const expectedCommits = [
        '13f5d4a', // 雙維度
        'e9da58d', // 健檢
        '01c29d0', // M1
        '7b81a2a', // M2
        'a37e4b2', // M3
        '2368961', // M4
        'd09c289', // flaky
      ];

      const doneItems = data.items.filter((it) => it.status === 'done');
      expect(doneItems.length).toBeGreaterThanOrEqual(7);

      const doneCommits = doneItems.map((it) => it.commitHash);
      for (const sha of expectedCommits) {
        expect(doneCommits).toContain(sha);
      }

      for (const it of doneItems) {
        expect(it.commitHash, `done item ${it.id} 必須帶 commitHash`).toBeTruthy();
        expect(it.completedAt, `done item ${it.id} 必須帶 completedAt`).toBeTruthy();
        expect(it.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // 已完成項目應該分到 phase-completed
        expect(it.phaseId).toBe('phase-completed');
      }
    });

    it('紅線清單不為空', () => {
      expect(data.redLines.length).toBeGreaterThan(0);
      for (const line of data.redLines) {
        expect(typeof line).toBe('string');
        expect(line.length).toBeGreaterThan(0);
      }
    });

    it('validationQuestions 恰好有 8 個問題', () => {
      expect(data.validationQuestions).toHaveLength(8);
      for (const q of data.validationQuestions) {
        expect(typeof q).toBe('string');
        expect(q.length).toBeGreaterThan(0);
      }
    });

    it('items 中每個 phaseId 都對應到實際存在的 phase', () => {
      const phaseIds = new Set(data.phases.map((p) => p.id));
      for (const item of data.items) {
        expect(phaseIds.has(item.phaseId)).toBe(true);
      }
    });

    it('多次呼叫回傳同一份（資料源是穩定的）', () => {
      expect(getRoadmapData()).toBe(data);
    });
  });

  describe('countByStatus()', () => {
    const data = getRoadmapData();
    const counts = countByStatus(data);

    it('5 個狀態欄位加總 === total', () => {
      const sum =
        counts.done +
        counts.inProgress +
        counts.planned +
        counts.researching +
        counts.observing;
      expect(sum).toBe(counts.total);
    });

    it('total 等於 data.items 長度', () => {
      expect(counts.total).toBe(data.items.length);
    });

    it('done 應 >= 7（含 7 個已完成項目）', () => {
      expect(counts.done).toBeGreaterThanOrEqual(7);
    });

    it('planned / researching / observing 數字非負', () => {
      expect(counts.planned).toBeGreaterThanOrEqual(0);
      expect(counts.researching).toBeGreaterThanOrEqual(0);
      expect(counts.observing).toBeGreaterThanOrEqual(0);
      expect(counts.inProgress).toBeGreaterThanOrEqual(0);
    });

    it('空 items 時所有計數為 0', () => {
      const emptyData: RoadmapData = {
        phases: [],
        items: [],
        redLines: [],
        validationQuestions: [],
        lastUpdated: '2026-06-06',
      };
      const c = countByStatus(emptyData);
      expect(c).toEqual({
        done: 0,
        inProgress: 0,
        planned: 0,
        researching: 0,
        observing: 0,
        total: 0,
      });
    });

    it('能正確計數 in-progress（內部映射為 inProgress key）', () => {
      const fakeData: RoadmapData = {
        phases: [],
        items: [
          {
            id: 'X1',
            title: 't',
            description: 'd',
            status: 'in-progress',
            sources: ['pm'],
            size: 'small',
            phaseId: 'phase-0',
          },
          {
            id: 'X2',
            title: 't',
            description: 'd',
            status: 'in-progress',
            sources: ['pm'],
            size: 'small',
            phaseId: 'phase-0',
          },
          {
            id: 'X3',
            title: 't',
            description: 'd',
            status: 'done',
            sources: ['pm'],
            size: 'small',
            phaseId: 'phase-0',
          },
        ],
        redLines: [],
        validationQuestions: [],
        lastUpdated: '2026-06-06',
      };
      const c = countByStatus(fakeData);
      expect(c.inProgress).toBe(2);
      expect(c.done).toBe(1);
      expect(c.total).toBe(3);
    });
  });

  describe('groupItemsByPhase()', () => {
    const data = getRoadmapData();
    const grouped = groupItemsByPhase(data);

    it('phases 按 order 升冪', () => {
      for (let i = 1; i < grouped.length; i++) {
        expect(grouped[i].phase.order).toBeGreaterThanOrEqual(
          grouped[i - 1].phase.order,
        );
      }
    });

    it('每個 phase 內 items 按 id 字串升冪', () => {
      for (const { items } of grouped) {
        for (let i = 1; i < items.length; i++) {
          expect(
            items[i].id.localeCompare(items[i - 1].id),
          ).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('所有 items 都被分到某個 phase（無孤兒）', () => {
      const totalItemsInGroups = grouped.reduce(
        (sum, g) => sum + g.items.length,
        0,
      );
      expect(totalItemsInGroups).toBe(data.items.length);
    });

    it('每個 phase 內 items 的 phaseId 都對應 phase.id', () => {
      for (const { phase, items } of grouped) {
        for (const item of items) {
          expect(item.phaseId).toBe(phase.id);
        }
      }
    });

    it('phase-completed 排在最前面（order = 0）', () => {
      expect(grouped[0].phase.id).toBe('phase-completed');
    });

    it('phase-observing 排在最後面（order 最大）', () => {
      expect(grouped[grouped.length - 1].phase.id).toBe('phase-observing');
    });

    it('輸入無 items 但有 phases 時，回傳每個 phase 對應空陣列', () => {
      const noItems: RoadmapData = {
        phases: [
          {
            id: 'p-a',
            title: 'A',
            description: '',
            order: 1,
            status: 'planned',
          },
          {
            id: 'p-b',
            title: 'B',
            description: '',
            order: 0,
            status: 'planned',
          },
        ],
        items: [],
        redLines: [],
        validationQuestions: [],
        lastUpdated: '2026-06-06',
      };
      const result = groupItemsByPhase(noItems);
      expect(result.map((g) => g.phase.id)).toEqual(['p-b', 'p-a']);
      expect(result[0].items).toHaveLength(0);
      expect(result[1].items).toHaveLength(0);
    });
  });
});
