# V10.1 开发日志（DEVELOPMENT_LOG）

> 时序记录 · 分支 feature/v10-final-release · 起点 b792ad3（V10 QA 收尾）

## 2026-11-19

### 阶段一：遗留任务对账（基于 docs/QA/V10_FULL_QA_REPORT.md §H）
1. SaveServiceV2 死代码 fail-open → 维持不接入（需产品决策，记录 BACKLOG P3-1）
2. 广告真机验证 → 环境限制，如实标注（BACKLOG P3-5）
3. **广告 UI 入口未接线（QA-BUG-013）→ 本轮修复 ✅**
4. 失败/复活 EXE 补证 → 环境限制（沿用上轮标注）
5. 音效听感 → 环境限制
6. BGM 缺资源 → BACKLOG P2-4
7. **一键推荐装备未实现 → 本轮修复 ✅**
8. pnpm 杂项清理 → 已删除（见下）

### 阶段二：技能接入
- `npx skills add gamedev-skills/awesome-gamedev-agent-skills` 实际执行成功
- 安装 11 个引擎无关技能（80 个中甄别，51+ 引擎专属不装）；Socket 0 alerts / Snyk Low×10 + Med×1
- 产出 docs/V10.1/SKILL_INTEGRATION.md（Router 表 + 使用记录）；commit 66797db

### 开发：广告 UI 入口接线（QA-BUG-013）
- 诊断：showOfflinePopup（含看广告×2）孤立代码，启动流只走 showWelcomeBackPopup
- 修复：简报加金色「📺 看广告 ×2」+ 蓝色正常领取（层级分明）；claimOfflineDouble 全链；
  取消 → 重建简报（pagehide flush 教训：注入测试存档须先屏蔽 Storage 写入）；失败 → 回落普通领取
- 验证：ad-wiring-probe 10/10 PASS（双倍精确 +24 灵石 / 取消零发放 / 回落 +6）
- commit a807152

### 开发：一键推荐装备（遗留 #7）
- 实现：auto-battle-service.equipRecommended（评分 atk×(1+暴击期望)×2+hp）+ facade + 装备面板按钮
- 验证：单测 9/9 + facade 集成 3/3 + equip-reco-probe PASS（E1 导航/E2 有界旅程 12 关/E3 面板+按钮+不变式/E4 幂等）
- 探针基建：cdp-runner 导出 runCardBattleSession（消除深度探针 mirror 重复）
- commit a807152

### 开发：NPC 关系增益可视化
- 发现：人际页 renderNpc 存在且可达，但 §47 六项增益不可见；且 renderNpc 的 facadeObj 引用不存在标识符（记忆卡死代码）
- 实现：facade.queryNpcBuffs() + 人际页增益卡（好绿/坏红/中性灰）+ 记忆卡复活 + 「六位」文案修正
- 验证：单测 6/6 + 浏览器 PASS（6 行增益 + 8 卡渲染）
- commit 0422caa

### 工程过程
- **并行会话发现**：工作区出现 V10.2 卡组预设/日报改动（非本会话产出）→ AGENTS.md 规则执行：
  不 stash/checkout/reset；逐 hunk 甄别归属；选择性 `git apply --cached` 暂存；三次提交均排除并行内容
- pnpm-lock.yaml / pnpm-workspace.yaml（历史意外产物）→ 删除
- 全量回归 npm test ×2 EXIT=0；Cocos 构建+拷贝 provenance ×2 PASS

### 待回填
- 60 分钟 soak 结果 → docs/QA/V10.1_REPORT.md
- FINAL_REPORT.md（最终验收清单 + 提交记录）
