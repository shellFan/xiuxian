# -*- coding: utf-8 -*-
"""批量把测试中的旧 MERGE_COUNT KPI 预置改为 V2 语义（WORK_SECONDS/CULTIVATION/TASK_DONE）。"""
import io, re, glob

# V2 KPI 目标（与 kpi.json 一致）
V2 = {
    1: {'work': 7200, 'cult': 100, 'task': 3},
    2: {'work': 28800, 'cult': 500, 'task': 8},
    3: {'work': 64800, 'cult': 1500, 'task': 15},
    4: {'work': 122400, 'cult': 3500, 'task': 24},
    5: {'work': 208800, 'cult': 7000, 'task': 36},
}

def fix_file(path):
    s = io.open(path, encoding='utf-8').read()
    orig = s
    # 模式1: kpiProgress: { MERGE_COUNT: N, ... } — 按 careerLevel 推断
    def repl_inline(m):
        merge_n = int(m.group(1))
        # 映射 MERGE_COUNT → level (3→1, 5→2, 8→3, 12→4, 16→5)
        lv = {3: 1, 5: 2, 8: 3, 12: 4, 16: 5, 20: 6, 25: 7, 30: 8}.get(merge_n)
        if lv is None:
            return m.group(0)
        t = V2[lv]
        return f"kpiProgress: {{ TASK_DONE: {t['task']} }}"
    s = re.sub(r'kpiProgress:\s*\{\s*MERGE_COUNT:\s*(\d+)[^}]*\}', repl_inline, s)

    # 模式2: workSeconds: N — 同步改成对应 level 的 V2 work 目标（仅当同上下文有 TASK_DONE）
    # 保守处理：300/600/900/1200/1500/1800 → 对应 V2 目标
    def repl_work(m):
        n = int(m.group(1))
        mapping = {300: 7200, 600: 28800, 900: 64800, 1200: 122400, 1500: 208800, 1800: 324000,
                   2400: 468000, 2100: 468000, 2400: 468000}
        new_n = mapping.get(n)
        return f"workSeconds: {new_n}" if new_n else m.group(0)
    s = re.sub(r'workSeconds:\s*(\d+)', repl_work, s)

    # 模式3: cultivationExp 目标: 50→100（level1 语境）、120→500、250→1500
    s = s.replace('cultivationExp: 50,', 'cultivationExp: 100,')
    s = s.replace('cultivationExp: 50 ', 'cultivationExp: 100 ')
    s = s.replace('cultivationExp: 120,', 'cultivationExp: 500,')
    s = s.replace('cultivationExp: 250,', 'cultivationExp: 1500,')
    # 常见断言里的字面量
    s = s.replace('cultivationExp >= 50', 'cultivationExp >= 100')
    s = s.replace('cultivationExp = 50', 'cultivationExp = 100')

    if s != orig:
        io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
        return True
    return False

changed = []
for f in ['tests/office/office-service.test.ts', 'tests/phase2/phase2-stability.test.ts',
          'tests/phase2/phase3-gameplay-integration.test.ts', 'tests/phase3/phase3-integration.test.ts',
          'tests/promotion/promotion-service.test.ts', 'tests/release/save-stress.test.ts',
          'tests/tutorial/tutorial-service.test.ts', 'tests/ui/phase2-view.test.ts',
          'tests/ui/phase2-bind-idempotency.test.ts', 'tests/achievements/achievement-service.test.ts']:
    if fix_file(f):
        changed.append(f)
print('changed:', changed)
