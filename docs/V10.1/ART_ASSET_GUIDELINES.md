# V10.1 美术资源规范（ART_ASSET_GUIDELINES）

> 依据：docs/ART-GENERATION-PROMPTS.md / ASSET-STRUCTURE.md / art-production-manifest.json + 本轮资源对账

## 1. 资源现状（对账结论）

| 类别 | 位置 | 状态 |
|---|---|---|
| 主视觉/首页图 | desktop/build 内联 + ui-icons/ | ✅ 在用（最慢资源 2.3MB，34ms 本地加载） |
| 快捷入口图标 | ui-icons/shortcut-*.png | ✅ 在用（飞剑/任务/项目/人际/背包/设置） |
| 合成音效 | 程序化 WebAudio（无文件） | ✅ 14 事件映射 |
| BGM | assets/audio/ | ❌ 仅 .gitkeep，未落地 |
| 境界/装备/功法图标 | emoji 字符（⌨️🛡️💍📿） | ✅ 当前口径：emoji 即图标（低成本统一） |
| 角色立绘 | v66 sprite 动画播放器 | ✅ 状态机动画在用 |

## 2. 优先复用原则（本轮执行口径）

本轮 V10.1 **零新增图片资源**——所有新 UI（广告按钮/推荐按钮/NPC 增益卡）复用现有
ux-btn/ux-card 体系 + emoji 图标，保持包体不增长（63 资源 12.8MB 基线）。

## 3. 新增资源准入规范

1. 风格：国风修仙 × 现代职场，深蓝底金紫强调（见 UI_UX_GUIDELINES §1）
2. 尺寸：图标 128×128 起步、@2x 备选；立绘 512px 宽起；背景 430×932 安全区内可视化
3. 命名：`<类别>-<用途>-<序号>`（如 `icon-equip-recommend.png`），入 art-production-manifest.json 登记
4. 接入验证：必须实际构建 + 截图核验后才算接入（禁止"放了文件就算"）
5. 生成式资源：走 create-game-assets 技能 QA 清单（假透明/描边/分辨率三查），记录授权来源

## 4. 待落地资源（按优先级）
1. BGM 主循环 60-90s（低饱和环境音，可程序化生成过渡）
2. 境界突破特效帧（若做独立境界系统，BACKLOG P2-3）
3. NPC 头像替换 emoji（8 位，512px，风格统一套图）——仅在 emoji 呈现被玩家反馈证明不足时
