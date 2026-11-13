# V8.0 缺陷清单

| ID | 级别 | 描述 | 状态 |
|---|---|---|---|
| D1 | P0 | 卡牌目标点击/选中态不渲染（window.__UI_OVERLAY__ 缺失） | CLOSED（ccd6e98，2/2 E2E） |
| D2 | P0 | 窗口遮挡后 GameLoop 冻结（V7.0 遗留发现） | CLOSED（V7.0 3d0fbd1） |
| D3 | P1 | V4 契约测试锁死主列 642px | CLOSED（契约随重构更新为 922） |
| D4 | P1 | 抖音小游戏构建 420s 超时 | OPEN（环境窗口限制，构建骨架已产出） |
| D5 | P2 | 微信主包 6.9MB > 4MB 限制 | OPEN（发布前需分包） |
| D6 | P2 | 音效听感无法自动化 | NOT_VERIFIED（如实标注） |
| D7 | P2 | 录像帧率不足未产出 | NOT_VERIFIED（以连续帧截图替代） |
