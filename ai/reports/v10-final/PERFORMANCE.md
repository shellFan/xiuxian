# V10.0 FINAL — 性能与存档报告（PERFORMANCE / SAVE-COMPATIBILITY 合卷）

## 性能采样（真实 soak 数据）

- 24 分钟段（48 采样 × 30s）：JS Heap 91.7 → 90.5MB（**无泄漏趋势**）、0 console 错误、
  0 未捕获异常、0 空白帧、心跳全绿；关卡 5→9→12 自动推进（交互持续）。
- DOM 节点数与帧率沿用 v10-qa 5min soak 证据（fps 56.7 / heap 平稳 / 0 异常）。
- 启动 → facade ready：CDP 连接后 ~9s 内全 gate 通过（含向导等待）。
- 战斗页保持挂载：五页导航切换不销毁战斗舞台（persistent battle stage，V7.0 架构沿用）。

## 泄漏/重建检查点

| 检查项 | 结果 |
|---|---|
| DOM 重建 | 战斗舞台跨页持久，未发现每秒重建 |
| 事件监听器 | soak 0 增长错误；heap 平稳佐证无失控增长 |
| 定时器泄漏 | soak 心跳/交互 24-27 分钟无异常 |
| Sprite 重复加载 | resourcesReady gate：全部图片 complete & naturalWidth>0 |
| NPC 请求挂起 | ai-bridge 8s 超时 + 在途单并发 + 请求销毁（timeout → req.destroy） |

## 存档兼容

- 存档体系：`<userData>/xiuxian-save/save.json` + save.backup.json + 临时文件原子写（storage.cjs 沿用）。
- V10.1 新增 `cardRemovals`（可选字段，向后兼容：缺省 = 未使用净化，迁移无需动作）。
- 历史版本迁移：save-service 迁移体系沿用（tests/save/ 全绿，含 legacy merge 测试）。
- 重启恢复：EXE restart 动作 Page.reload 后 facade 恢复 + 存档保留（gameplay restart PASS ×N 次）；
  H5 localStorage 恢复同 PASS。
- 测试隔离：XIUXIAN_USER_DATA 启动即整目录重定向（main.cjs V10 隔离），真实玩家数据零接触。
