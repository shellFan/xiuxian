# V10.1 截图索引（SCREENSHOT-INDEX）

所有截图来自真实运行版本（Electron 无 preload = 纯 Chromium H5 上下文；EXE 为打包产物）。
禁止使用 HTML 静态模拟替代游戏运行 —— 本目录无任何合成图。

## before/（修复前基线，HEAD 085013a 构建包）
| 文件 | 内容 |
|---|---|
| 00-boot.png / 01-first-launch.png | 首次启动 |
| 02-home-fresh.png | 首页首屏（修复前：主角纵向大卡，今日修行被挤出首屏） |
| 03~07 | 工作/摸鱼/修炼/社交 各模式详情 |
| 08/09/10 | 挑战页/Build 选择/战斗开始 |
| 11-battle-* | 卡牌战斗回合（意图可见） |
| 12~14 | 战斗结束/奖励/领取 |
| 15~19 | 养成/招募/装备/晋升/返回首页 |
| 20-restart-home.png | 重启恢复 |

## after/（V10.1 修复后，同流程复测）
- `02-home-fresh.png`：**主角|今日修行并排，第一屏含全部日常操作**。
- `08-project-page.png`：卡组区含流派倾向条 + 净化按钮。
- `10/11/12-battle-*.png`：战斗（连击徽章/意图/打断窗口就绪）。
- `20-restart-home.png`：重启后进度连续（灵石 4→4 保持）。

## mobile/（390×844）
- 修复前：`11-battle-turn-4.png`（敌人列被裁切 + 技能选择被事件弹窗饿死 + RARE 徽标重叠标题）。
- 修复后：`02-home-fresh.png` / `10-battle-start.png`（RARE 徽标行内化）/ `12-battle-final.png`。

## mobile430/（430×932）
- 第二轮真实运行证据（audit-final-mobile430.json）。

## profiles/（10 档案独立验收）
- p01~p10 关键帧（audit-player-p01~p10.json 为配套数据）。

## exe/（打包 EXE）
- `exe-smoke-home.png`：打包 EXE 真实运行首屏（exe-smoke.json 5/5 检查通过）。

## 历史（不清理）
- `ai/reports/v10*/screenshots`、`ai/reports/v92/screenshots` 等历史证据保持原样。
