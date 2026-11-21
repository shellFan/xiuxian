# V11 缺陷清单（BUG_LIST）

> 分级沿用 FINAL_QA 口径：P0 无法启动/数据丢失；P1 核心玩法不可用/重要结算错误/重复发奖；P2 普通功能异常；P3 细节。

## 本轮发现并修复

| ID | 级别 | 状态 | 内容 |
|---|---|---|---|
| V11-BUG-001 | P1 | ✅ 36b988c | craft 页每次 refresh 对 CraftButton 重复 `on('click')` → 监听器累积，一次点击触发 N 次炼制（重复扣资源，§23 禁止的重复消耗）。修复：WeakSet 按 Button 实例去重绑定 |
| V11-BUG-002 | P1 | ✅ c57c7b7 | MORE 死入口：V9.0 五页导航重构把 MORE 移出 NAV_TABS，`case 'MORE'` 成死代码——成就/设置/图鉴/排行榜/法宝/结算等 8 个 overlay 页面不可达（设计注释 §54 明确应存在）。修复：恢复第六导航项「更多」 |
| V11-BUG-003 | P1 UX | ✅ 860e9a9 | 设置链断裂：SettingsService 从未实例化（死代码）+ 设置页 BGM/SFX 开关无 handler（`checkEvents[0].emit()` 无意义调用）+ 标签硬编码「开」+ AudioService 启动不读持久化。修复：三处接线+音量字段持久化 |
| V11-BUG-004 | P2 | ✅ 36b988c | 炼丹扣灵石不发 `spiritStonesChanged`（成功与失败路径均无事件）→ UI 资源显示 stale |
| V11-BUG-005 | P2 | ✅ e2814e3 | overlay 设置不持久化且硬编码（F2），与 context.settings 脱节 |
| V11-BUG-006 | 测试稳定性 | ✅ 844245c | craft.json 引入成功率后，未注入 RNG 的 facade 级测试出现 10% 随机失败；game-context 现将 options.randomProvider 传入 CraftService + 测试注入确定性序列 |
| V11-BUG-007 | P3 | ✅ c57c7b7 | overlay 炼丹成功 toast 无品质、配方卡无成功率（与 Cocos 页口径不一致） |

## 遗留（承接 FINAL_QA，未在本轮变化）

| ID | 级别 | 状态 | 内容 |
|---|---|---|---|
| BUG-003（终验） | P2 | OPEN | 深夜（01:00–03:30 UTC+8）探针 reload 路径欢迎简报不渲染；A/B 已证明非代码回归、收益不丢失；需深夜复现窗口定位 |
| BUG-ECO-1 | P3 | OPEN | L10→L11 停滞 ≈336 天（产品决策项） |

## 新备案（本轮发现，未修）

| ID | 级别 | 内容 |
|---|---|---|
| V11-OBS-1 | P3 | overlay 与 canvas 的音效「立即生效」差异：overlay WebAudio 即时，canvas AudioService 于下次启动应用（F2 统一后的已知边界，见 DEVELOPMENT_LOG） |
| V11-OBS-2 | P3 | overlay 更多菜单/成就图标使用 Emoji（任务书§16 禁作正式图标）→ 需美术资产（与 BGM 采购同源） |

## 统计

| 级别 | 本轮新发现 | 已修复 | 遗留 OPEN |
|---|---|---|---|
| P0 | 0 | — | **0** |
| P1 | 3 | 3 | 0 |
| P2 | 2 | 2 | 1（承接 BUG-003） |
| P3 | 2+2备案 | 1 | 3 |
