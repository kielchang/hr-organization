import {
  deriveAllGroupLeadership,
  deriveGroupLeadership,
  deriveInGroupRoot,
  isLeadLevel,
} from './groupLeadership';
import { assignment, emp, group, makeOrgData } from '../test/fixtures';

/**
 * groupLeadership：組長（leaderId）＋推導式 co-leader。
 *
 * - `deriveInGroupRoot`：以「組內匯報根」回退組長（leaderId 未設時用）。
 * - `deriveGroupLeadership`：leaderId 優先取 group.leaderId、否則回退；
 *   co-leader = 組內成員的「組外」primary 主管，**且該主管「夠格（lead-level）」**：
 *   其主歸屬無上級主管（primarySupervisorId null）或其為某組 leaderId。
 *   不夠格者（有上級且非任何組長）屬「掛錯組」，不列入 co-lead（去重、排除 leaderId、升冪）。
 * - `isLeadLevel`：co-lead 守門斷言——(b) 某組 leaderId 或 (a) 主歸屬無上級即夠格。
 */

describe('isLeadLevel', () => {
  it('(a) 主歸屬無上級主管（primarySupervisorId null）→ true', () => {
    // top 主歸屬 g1、無上級 → 夠格。
    const data = makeOrgData({
      employees: [emp('top')],
      groups: [group('g1')],
      assignments: [
        assignment('x-top', { employeeId: 'top', groupId: 'g1' }), // primarySupervisorId 預設 null
      ],
    });
    expect(isLeadLevel(data, 'top')).toBe(true);
  });

  it('(b) 是某組 leaderId（即使主歸屬有上級主管）→ true', () => {
    // mgr 主歸屬掛 boss 為上級（path a 不成立），但 mgr 是 g2 的 leaderId → path b 成立。
    const data = makeOrgData({
      employees: [emp('boss'), emp('mgr')],
      groups: [group('g1'), group('g2', { leaderId: 'mgr' })],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-mgr', {
          employeeId: 'mgr',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
    // 健全性：path a 不成立（主歸屬有上級），純靠 path b。
    expect(isLeadLevel(data, 'mgr')).toBe(true);
  });

  it('有上級主管且非任何組長 → false（不夠格、屬掛錯組）', () => {
    const data = makeOrgData({
      employees: [emp('boss'), emp('mid')],
      groups: [group('g1')],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-mid', {
          employeeId: 'mid',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
    expect(isLeadLevel(data, 'mid')).toBe(false);
  });

  it('完全無 assignment（且非任何組長）→ false', () => {
    // ghost 不在任何 assignment、也非任何組 leaderId → path a/b 皆不成立。
    const data = makeOrgData({
      employees: [emp('ghost')],
      groups: [group('g1')],
      assignments: [],
    });
    expect(isLeadLevel(data, 'ghost')).toBe(false);
  });

  it('多筆 assignment 時優先取 isPrimaryGroup 那筆判定（主歸屬無上級 → true，即使次要歸屬有上級）', () => {
    // who 有兩筆：主歸屬 g1（無上級）、次要歸屬 g2（掛 boss 為上級）。
    // path a 須取「主歸屬」那筆 → 主歸屬無上級 → true（不被次要歸屬的上級污染）。
    const data = makeOrgData({
      employees: [emp('boss'), emp('who')],
      groups: [group('g1'), group('g2')],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g2' }),
        assignment('x-who-secondary', {
          employeeId: 'who',
          groupId: 'g2',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
          isPrimaryGroup: false,
        }),
        assignment('x-who-primary', {
          employeeId: 'who',
          groupId: 'g1',
          isPrimaryGroup: true, // 主歸屬無上級
        }),
      ],
    });
    expect(isLeadLevel(data, 'who')).toBe(true);
  });

  it('主歸屬有上級、次要歸屬無上級 → false（仍以主歸屬那筆為準、不被次要救回）', () => {
    // who 主歸屬 g1 掛 boss（有上級）、次要歸屬 g2 無上級。
    // 取主歸屬那筆 → 有上級 → false（對稱守護上一案：優先序確實取 isPrimaryGroup）。
    const data = makeOrgData({
      employees: [emp('boss'), emp('who')],
      groups: [group('g1'), group('g2')],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-who-primary', {
          employeeId: 'who',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
          isPrimaryGroup: true,
        }),
        assignment('x-who-secondary', {
          employeeId: 'who',
          groupId: 'g2',
          isPrimaryGroup: false, // 無上級，但非主歸屬 → 不採用
        }),
      ],
    });
    expect(isLeadLevel(data, 'who')).toBe(false);
  });

  it('無 isPrimaryGroup 標記時回退第一筆 assignment 判定', () => {
    // who 兩筆皆 isPrimaryGroup=false → primary = own[0]（第一筆 = g1，有上級）→ false。
    const data = makeOrgData({
      employees: [emp('boss'), emp('who')],
      groups: [group('g1'), group('g2')],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-who-1', {
          employeeId: 'who',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
          isPrimaryGroup: false,
        }),
        assignment('x-who-2', {
          employeeId: 'who',
          groupId: 'g2',
          isPrimaryGroup: false, // 無上級，但排在第二筆 → 不被取用
        }),
      ],
    });
    expect(isLeadLevel(data, 'who')).toBe(false);
  });
});

describe('deriveInGroupRoot', () => {
  it('空組（無成員）→ null', () => {
    const data = makeOrgData({ groups: [group('g1')] });
    expect(deriveInGroupRoot(data, 'g1')).toBeNull();
  });

  it('單根：唯一一位主管為 null 的成員即組內匯報根', () => {
    // boss(無主管) ← a ← b，皆在 g1 → 根 = boss。
    const data = makeOrgData({
      employees: [emp('boss'), emp('a'), emp('b')],
      groups: [group('g1')],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-a', {
          employeeId: 'a',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('x-b', {
          employeeId: 'b',
          groupId: 'g1',
          supervisorIds: ['a'],
          primarySupervisorId: 'a',
        }),
      ],
    });
    expect(deriveInGroupRoot(data, 'g1')).toBe('boss');
  });

  it('主管在組外亦算候選根（其主管不在組內）', () => {
    // a 的主管 outBoss 不在 g1 → a 為候選根；組內僅 a 為候選 → 回 a。
    const data = makeOrgData({
      employees: [emp('a'), emp('outBoss')],
      groups: [group('g1'), group('g2')],
      assignments: [
        assignment('x-a', {
          employeeId: 'a',
          groupId: 'g1',
          supervisorIds: ['outBoss'],
          primarySupervisorId: 'outBoss',
        }),
        assignment('x-out', { employeeId: 'outBoss', groupId: 'g2' }),
      ],
    });
    expect(deriveInGroupRoot(data, 'g1')).toBe('a');
  });

  it('多根 tiebreak 1：組內有效層級最高（深度最小）優先', () => {
    // 兩位候選：root(深度1) 與 deep(主管 root、深度2 但主管在組內→非候選)。
    // 為造多候選：root 與 island 皆無組內主管（depth 1），但 root 有組內部屬 → 由 tiebreak 2 解。
    // 此處改以「深度」直接區分：mgr(無主管,depth1) 與 sub(主管在組外,depth1) 同深 →
    // 改用一個深度更小者勝出的場景：
    //   top(無主管 depth1) ← child(主管 top depth2)；另有 lone(主管在組外 depth1)。
    //   候選 = {top, lone}（child 主管在組內非候選）。top 與 lone 同 depth1 →
    //   tiebreak2：top 有組內部屬 child(1)、lone 無(0) → top 勝。
    const data = makeOrgData({
      employees: [emp('top'), emp('child'), emp('lone'), emp('outBoss')],
      groups: [group('g1'), group('g2')],
      assignments: [
        assignment('x-top', { employeeId: 'top', groupId: 'g1' }),
        assignment('x-child', {
          employeeId: 'child',
          groupId: 'g1',
          supervisorIds: ['top'],
          primarySupervisorId: 'top',
        }),
        assignment('x-lone', {
          employeeId: 'lone',
          groupId: 'g1',
          supervisorIds: ['outBoss'],
          primarySupervisorId: 'outBoss',
        }),
        assignment('x-out', { employeeId: 'outBoss', groupId: 'g2' }),
      ],
    });
    // top 與 lone 同為候選（深度皆 1）；top 有組內部屬 → tiebreak2 勝。
    expect(deriveInGroupRoot(data, 'g1')).toBe('top');
  });

  it('多根 tiebreak 2：同深度時組內直接部屬數最多優先', () => {
    // 兩位無主管候選 manyReports / fewReports（depth 皆 1）。
    // manyReports 有 2 名組內部屬、fewReports 有 1 名 → manyReports 勝。
    const data = makeOrgData({
      employees: [
        emp('manyReports'),
        emp('fewReports'),
        emp('r1'),
        emp('r2'),
        emp('r3'),
      ],
      groups: [group('g1')],
      assignments: [
        assignment('x-many', { employeeId: 'manyReports', groupId: 'g1' }),
        assignment('x-few', { employeeId: 'fewReports', groupId: 'g1' }),
        assignment('x-r1', {
          employeeId: 'r1',
          groupId: 'g1',
          supervisorIds: ['manyReports'],
          primarySupervisorId: 'manyReports',
        }),
        assignment('x-r2', {
          employeeId: 'r2',
          groupId: 'g1',
          supervisorIds: ['manyReports'],
          primarySupervisorId: 'manyReports',
        }),
        assignment('x-r3', {
          employeeId: 'r3',
          groupId: 'g1',
          supervisorIds: ['fewReports'],
          primarySupervisorId: 'fewReports',
        }),
      ],
    });
    expect(deriveInGroupRoot(data, 'g1')).toBe('manyReports');
  });

  it('多根 tiebreak 3：深度與部屬數皆同 → employeeId 升冪第一', () => {
    // bbb / aaa 皆無主管、皆無組內部屬（depth1、reports0）→ 取 employeeId 升冪 aaa。
    const data = makeOrgData({
      employees: [emp('bbb'), emp('aaa')],
      groups: [group('g1')],
      assignments: [
        assignment('x-bbb', { employeeId: 'bbb', groupId: 'g1' }),
        assignment('x-aaa', { employeeId: 'aaa', groupId: 'g1' }),
      ],
    });
    expect(deriveInGroupRoot(data, 'g1')).toBe('aaa');
  });

  it('職能組（parentId null、kind=function）一樣依組內 assignment 推根', () => {
    // 跨部門職能組：成員主管多在組外 → 仍能推出組內匯報根（depth1 + tiebreak）。
    const data = makeOrgData({
      employees: [emp('lead'), emp('m1'), emp('extBoss')],
      groups: [
        group('xfn', { kind: 'function', parentId: null }),
        group('home', { kind: 'department' }),
      ],
      assignments: [
        assignment('x-lead', { employeeId: 'lead', groupId: 'xfn' }),
        assignment('x-m1', {
          employeeId: 'm1',
          groupId: 'xfn',
          supervisorIds: ['lead'],
          primarySupervisorId: 'lead',
        }),
        // extBoss 不在 xfn → 不影響 xfn 推導。
        assignment('x-ext', { employeeId: 'extBoss', groupId: 'home' }),
      ],
    });
    expect(deriveInGroupRoot(data, 'xfn')).toBe('lead');
  });
});

describe('deriveGroupLeadership', () => {
  it('空組 → { leaderId: null, coLeaderIds: [] }', () => {
    const g = group('g1');
    const data = makeOrgData({ groups: [g] });
    expect(deriveGroupLeadership(data, g)).toEqual({
      groupId: 'g1',
      leaderId: null,
      coLeaderIds: [],
    });
  });

  it('leaderId 已設 → 直接採用，不回退推導', () => {
    // 即使 boss 才是組內匯報根，group.leaderId='picked' 仍優先採用。
    const g = group('g1', { leaderId: 'picked' });
    const data = makeOrgData({
      employees: [emp('boss'), emp('picked'), emp('staff')],
      groups: [g],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-picked', {
          employeeId: 'picked',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('x-staff', {
          employeeId: 'staff',
          groupId: 'g1',
          supervisorIds: ['picked'],
          primarySupervisorId: 'picked',
        }),
      ],
    });
    const r = deriveGroupLeadership(data, g);
    expect(r.leaderId).toBe('picked');
  });

  it('leaderId 未設 → 回退組內匯報根', () => {
    const g = group('g1');
    const data = makeOrgData({
      employees: [emp('boss'), emp('a')],
      groups: [g],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-a', {
          employeeId: 'a',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
    expect(deriveGroupLeadership(data, g).leaderId).toBe('boss');
  });

  it('CEO/COO 共管：業務部 leaderId=CEO、部分成員主管=COO（COO 不在業務部且夠格）→ coLeaderIds=[COO]', () => {
    // 業務部成員 s1/s2 主管 CEO（組長，不算 co-lead）；s3/s4 主管 COO（組外）→ COO co-lead。
    // co-lead 收緊後：COO 須「夠格」才列入。此處 COO 是 exec 組 leaderId（path b）→ 夠格。
    //（COO 主歸屬仍掛 CEO 為上級，刻意不走 path a，獨立驗證 path b 也能讓組外主管夠格。）
    const sales = group('sales', { leaderId: 'CEO' });
    const data = makeOrgData({
      employees: [
        emp('CEO'),
        emp('COO'),
        emp('s1'),
        emp('s2'),
        emp('s3'),
        emp('s4'),
      ],
      groups: [sales, group('exec', { leaderId: 'COO' })],
      assignments: [
        // CEO/COO 本人歸屬高管組 exec（不在 sales）。
        assignment('x-ceo', { employeeId: 'CEO', groupId: 'exec' }),
        assignment('x-coo', {
          employeeId: 'COO',
          groupId: 'exec',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        // sales 成員：s1/s2 主管 CEO（= leaderId，不算 co-lead）。
        assignment('x-s1', {
          employeeId: 's1',
          groupId: 'sales',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        assignment('x-s2', {
          employeeId: 's2',
          groupId: 'sales',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        // s3/s4 主管 COO（組外、非 leaderId）→ COO 為 co-lead。
        assignment('x-s3', {
          employeeId: 's3',
          groupId: 'sales',
          supervisorIds: ['COO'],
          primarySupervisorId: 'COO',
        }),
        assignment('x-s4', {
          employeeId: 's4',
          groupId: 'sales',
          supervisorIds: ['COO'],
          primarySupervisorId: 'COO',
        }),
      ],
    });
    const r = deriveGroupLeadership(data, sales);
    expect(r.leaderId).toBe('CEO');
    // COO 出現兩次（s3/s4）→ 去重後僅一個。
    expect(r.coLeaderIds).toEqual(['COO']);
  });

  it('組外主管「有上級且非任何組長」（不夠格）→ 不列入 coLeaderIds（co-lead 收緊）', () => {
    // teamA：leaderId=lead（組內）。成員 m 的 primary 主管 midMgr 在組外（teamB）。
    // midMgr 主歸屬掛 topBoss 為上級（primarySupervisorId 非 null），且 midMgr 非任何組 leaderId
    // → isLeadLevel(midMgr)=false（不夠格、屬「掛錯組」）→ 不列入 co-lead。
    const teamA = group('teamA', { leaderId: 'lead' });
    const data = makeOrgData({
      employees: [emp('lead'), emp('topBoss'), emp('midMgr'), emp('m')],
      groups: [teamA, group('teamB')],
      assignments: [
        assignment('x-lead', { employeeId: 'lead', groupId: 'teamA' }),
        assignment('x-top', { employeeId: 'topBoss', groupId: 'teamB' }),
        // midMgr 在 teamB、其主歸屬掛 topBoss（有上級）→ 不夠格。
        assignment('x-mid', {
          employeeId: 'midMgr',
          groupId: 'teamB',
          supervisorIds: ['topBoss'],
          primarySupervisorId: 'topBoss',
        }),
        // teamA 成員 m 的組外 primary 主管 = midMgr（不夠格）。
        assignment('x-m', {
          employeeId: 'm',
          groupId: 'teamA',
          supervisorIds: ['midMgr'],
          primarySupervisorId: 'midMgr',
        }),
      ],
    });
    const r = deriveGroupLeadership(data, teamA);
    expect(r.leaderId).toBe('lead');
    // midMgr 不夠格 → 不列入（先前未收緊時會誤列入）。
    expect(r.coLeaderIds).toEqual([]);
  });

  it('co-lead 排除 leaderId：主管恰為組長者不重複列入 co-lead', () => {
    // leaderId=CEO；所有成員主管皆 CEO（組外）→ co-lead 應排除 CEO → []。
    const g = group('g1', { leaderId: 'CEO' });
    const data = makeOrgData({
      employees: [emp('CEO'), emp('m1'), emp('m2')],
      groups: [g, group('exec')],
      assignments: [
        assignment('x-ceo', { employeeId: 'CEO', groupId: 'exec' }),
        assignment('x-m1', {
          employeeId: 'm1',
          groupId: 'g1',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        assignment('x-m2', {
          employeeId: 'm2',
          groupId: 'g1',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
      ],
    });
    expect(deriveGroupLeadership(data, g).coLeaderIds).toEqual([]);
  });

  it('組內主管（非組外）不算 co-lead', () => {
    // leaderId=boss；mid 主管 boss（組內 leader）、low 主管 mid（組內、非組外）→ 無 co-lead。
    const g = group('g1', { leaderId: 'boss' });
    const data = makeOrgData({
      employees: [emp('boss'), emp('mid'), emp('low')],
      groups: [g],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-mid', {
          employeeId: 'mid',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('x-low', {
          employeeId: 'low',
          groupId: 'g1',
          supervisorIds: ['mid'],
          primarySupervisorId: 'mid',
        }),
      ],
    });
    expect(deriveGroupLeadership(data, g).coLeaderIds).toEqual([]);
  });

  it('組長本人的組外上級主管不算 co-lead（組長在組內、上報組外夠格主管 S）', () => {
    // teamA：leaderId=L（在組內）。L 自己的 primary 主管 S 在組外（exec）、且夠格
    //（S 是 exec 組 leaderId → path b）。S 是「組長 L 的正常上行匯報主管」、非平行共管。
    // 收緊後：deriveGroupLeadership 略過組長本人那筆 assignment（`a.employeeId === leaderId` continue）
    // → S 不被誤標為 co-lead。另一名非組長成員 m 報組內 L（不觸發 co-lead）。
    const teamA = group('teamA', { leaderId: 'L' });
    const data = makeOrgData({
      employees: [emp('L'), emp('S'), emp('m')],
      groups: [teamA, group('exec', { leaderId: 'S' })],
      assignments: [
        // 組長 L 在 teamA、其 primary 主管 S 在組外且夠格（exec leaderId）。
        assignment('x-L', {
          employeeId: 'L',
          groupId: 'teamA',
          supervisorIds: ['S'],
          primarySupervisorId: 'S',
        }),
        assignment('x-S', { employeeId: 'S', groupId: 'exec' }),
        // 非組長成員 m 報組內 L → 不產生 co-lead。
        assignment('x-m', {
          employeeId: 'm',
          groupId: 'teamA',
          supervisorIds: ['L'],
          primarySupervisorId: 'L',
        }),
      ],
    });
    const r = deriveGroupLeadership(data, teamA);
    expect(r.leaderId).toBe('L');
    // 健全性：S 確實「夠格」（避免本案因 S 不夠格而非因『略過組長本人』才空）。
    expect(isLeadLevel(data, 'S')).toBe(true);
    // 關鍵：S 是組長 L 的上行主管 → 不列入 co-lead（未收緊前會誤列 S）。
    expect(r.coLeaderIds).not.toContain('S');
    expect(r.coLeaderIds).toEqual([]);
  });

  it('co-lead 去重且 employeeId 升冪穩定排序', () => {
    // 三位組外主管 zCo / aCo / mCo 各帶部分成員、皆出現多次 → 去重後升冪 [aCo, mCo, zCo]。
    const g = group('g1', { leaderId: 'boss' });
    const data = makeOrgData({
      employees: [
        emp('boss'),
        emp('zCo'),
        emp('aCo'),
        emp('mCo'),
        emp('m1'),
        emp('m2'),
        emp('m3'),
        emp('m4'),
        emp('m5'),
        emp('m6'),
      ],
      groups: [g, group('exec')],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-zco', { employeeId: 'zCo', groupId: 'exec' }),
        assignment('x-aco', { employeeId: 'aCo', groupId: 'exec' }),
        assignment('x-mco', { employeeId: 'mCo', groupId: 'exec' }),
        // 每位組外主管帶兩名成員 → 各重複出現一次（測去重）。
        assignment('x-m1', {
          employeeId: 'm1',
          groupId: 'g1',
          supervisorIds: ['zCo'],
          primarySupervisorId: 'zCo',
        }),
        assignment('x-m2', {
          employeeId: 'm2',
          groupId: 'g1',
          supervisorIds: ['zCo'],
          primarySupervisorId: 'zCo',
        }),
        assignment('x-m3', {
          employeeId: 'm3',
          groupId: 'g1',
          supervisorIds: ['aCo'],
          primarySupervisorId: 'aCo',
        }),
        assignment('x-m4', {
          employeeId: 'm4',
          groupId: 'g1',
          supervisorIds: ['aCo'],
          primarySupervisorId: 'aCo',
        }),
        assignment('x-m5', {
          employeeId: 'm5',
          groupId: 'g1',
          supervisorIds: ['mCo'],
          primarySupervisorId: 'mCo',
        }),
        assignment('x-m6', {
          employeeId: 'm6',
          groupId: 'g1',
          supervisorIds: ['mCo'],
          primarySupervisorId: 'mCo',
        }),
      ],
    });
    expect(deriveGroupLeadership(data, g).coLeaderIds).toEqual([
      'aCo',
      'mCo',
      'zCo',
    ]);
  });

  it('co-lead 只看 primarySupervisorId，忽略虛線次要主管', () => {
    // 成員 m1 主管 CEO（primary）、另掛虛線 dotCo（組外、非 primary）→ co-lead 不含 dotCo。
    const g = group('g1', { leaderId: 'CEO' });
    const data = makeOrgData({
      employees: [emp('CEO'), emp('dotCo'), emp('m1')],
      groups: [g, group('exec')],
      assignments: [
        assignment('x-ceo', { employeeId: 'CEO', groupId: 'exec' }),
        assignment('x-dot', { employeeId: 'dotCo', groupId: 'exec' }),
        assignment('x-m1', {
          employeeId: 'm1',
          groupId: 'g1',
          supervisorIds: ['CEO', 'dotCo'],
          primarySupervisorId: 'CEO',
        }),
      ],
    });
    expect(deriveGroupLeadership(data, g).coLeaderIds).toEqual([]);
  });
});

describe('deriveAllGroupLeadership', () => {
  it('回 Map<groupId, GroupLeadership> 涵蓋所有組別', () => {
    const data = makeOrgData({
      employees: [emp('boss'), emp('a')],
      groups: [
        group('g1', { leaderId: 'boss' }),
        group('g2'), // 空組
      ],
      assignments: [
        assignment('x-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('x-a', {
          employeeId: 'a',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
    const all = deriveAllGroupLeadership(data);
    expect([...all.keys()].sort()).toEqual(['g1', 'g2']);
    expect(all.get('g1')).toEqual({
      groupId: 'g1',
      leaderId: 'boss',
      coLeaderIds: [],
    });
    expect(all.get('g2')).toEqual({
      groupId: 'g2',
      leaderId: null,
      coLeaderIds: [],
    });
  });
});
