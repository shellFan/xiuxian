# V10.0 FINAL — 玩法与架构报告（GAMEPLAY / ARCHITECTURE / UI-UX 合卷）

## 页面架构（五页移动优先）

`desktop/ui-overlay.js` NAV_TABS：洞府(CAVE) / 战斗(BATTLE) / 养成(GROWTH) / 挑战(PROJECT) / 任务(TASKS)，
底部固定导航 + 子页 back 头部。真实运行验证：

- 洞府首页五区（截图 03）：资源 Chips（灵石/修为/道心）→ 当前目标卡（动态：新手试炼/Boss待战/晋升）
  → 主角展示（sprite + 昵称/职业/境界）→ 今日修行任务 → 快捷领取列表；底部五页导航。
- 战斗页（截图 05/06）：顶部章节/敌人，中部舞台（sprite 动画 + 连击/技能/受击反馈），
  下部操作条（升级点击/装备/招募/加速）。
- 养成页（截图 13）：员工阵容/升星/羁绊/装备入口。
- 挑战页（截图 07/08）：项目攻坚（Build 选择 → 卡牌战斗 5 波 → Boss）。
- 任务页（截图 17）：今日工作/日常/修仙支线/临时塞活 + 领取。

## 核心循环闭环（真实驱动证据）

创建角色 → 洞府 → 工作/摸鱼/修炼/社交 → 招募 → 项目攻坚（卡牌战斗）→ 击败 → 奖励 →
装备强化 → 员工成长 → 晋升 → 下一章节 → 重启恢复。
EXE boot gate 9/9 + gameplay 9 PASS + 卡牌 80+ 步会话（详见 EXE-ACCEPTANCE.md）。

## 战斗表现（Game Feel）

- 连击系统（服务层 comboCount 视图字段，EXE 探针 0→20 验证沿用上轮 QA + 本轮 tap PASS）；
- 技能联动 debuff（bug_bomb → enemyBugDebuff，ASAR 标记验证仍在运行时中）；
- Boss P2（phase2Active ×14 标记在最终 ASAR 中）；
- 装备套装（computeSetBonus ×16）；
- Sprite 动画：五职业+敌人+Boss（idle/attack/hit/death/victory，V6.6 资产复用）。

## 四职业（CARD-BATTLE 深化沿用 + V10.1 增量）

Java 后端（JVM 调优流/Spring 生态流/Java 并发流 Build，截图 08 Build: build_jvm）/
前端/测试/运维 各有核心卡牌与机制；卡牌移除/净化（V10.1 cardRemovals 存档字段，并行开发者的
玩法轮已随最终 bundle 验证 —— 174 测试文件全绿）。

## BOSS / EMPLOYEE / EQUIPMENT（简报）

- Boss：五机制沿 V9.x 服务层（KPI 暴君/加班魔王/Bug 巨兽/需求幻魔/版本灾厄框架）+ P2 阶段转换；
  独立 sprite 与登场演出（boss 目录截图沿用 v10-qa 证据链）。
- 员工：品质/升星/羁绊/阵容（养成页 + 招募菜单真实操作 PASS）。
- 装备：四槽位 + 随机词条 + 强化 + 套装（v64-openEquip 真实开启 PASS，穿/强化按钮可见）。

## BALANCE（诚实标注）

- 本轮未新增数值模拟；沿用上轮 GLM53-N10-BALANCE 报告 + V10.1 balance-sim.ts（并行开发者
  scripts/v101/tests/v101）作为输入。服务层已有关卡推进/经济膨胀护栏（离线上限/疲劳）。
- 状态：PARTIAL —— 四职业可玩性由回归+真实试玩覆盖，无新增六画像×100 日模拟。
