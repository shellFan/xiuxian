# 职场修仙角色卡牌 · 第一辑

本次新增四位原创卡通牛马、三种可组合卡框和独立交互预览。设计基于项目既有《Q版牛马角色视觉指南》：宽牛耳、短角、奶油口鼻、短身体，墨色轮廓、暖纸底、青玉与旧金。卡面文字由 HTML 单独绘制，PNG 不包含名称、数值或按钮。

## 查看成品

直接打开 `desktop/art_preview/index.html` 即可离线查看，也可以在仓库根目录运行：

```powershell
node desktop/art_preview/serve.cjs
```

随后打开 http://127.0.0.1:4177/ 。服务仅用于本机预览，关闭终端或按 Ctrl+C 停止；更换端口可先设置 `$env:PORT = '4178'`。

鼠标移动可看轻微卡面倾斜，点击卡牌或按 Enter / Space 查看背面人物志；“青玉 / 鎏金 / 紫金”筛选卡框系列。动态开关控制亮面扫光、星点与倾斜，系统减少动态偏好优先。窄屏采用单列卡牌。无需外部字体、CDN、npm 安装或游戏存档。

## 人物与卡面

| 文件 | 人物 | 法器与轮廓 | 卡面 |
|---|---|---|---|
| `character_intern.png` | 实习牛马 | 卷袖衬衫、帆布包、电脑与铅笔剑 | 青玉 R |
| `character_keyboard_sword.png` | 键盘剑修 | 青玉短外套、耳机、键盘飞剑与键帽符 | 青玉 SR |
| `character_coffee_alchemist.png` | 咖啡丹师 | 暖金马甲、围裙、灵豆炉与量勺 | 鎏金 SR |
| `character_kpi_master.png` | 绩效掌门 | 紫金披肩、云纹折扇、绩效玉印 | 紫金 SSR |

所有角色文件位于 `assets/textures/ui/character_cards/`。R / SR / SSR 是本预览的卡面装饰，不新增抽卡、付费、属性、掉率或玩法加成，也不映射 Worker.level、career.level 或实际境界。

卡牌的纸纹、双线边框、角饰、云纹圆环、扫光、星点和翻牌由 `cards.css` 与 `cards.js` 生成，不烘焙进角色。可分别调整人物图、主题色和文案；Cocos 实际接入时需将这些表现转换为 Sprite 与 tween 等引擎组件，浏览器 CSS 不是可直接用于 Cocos 的 shader 或 Prefab。

## 实际资源与导入状态

- 四张均为 **1254 × 1254 RGBA PNG**，已确认 alpha 通道覆盖 0–255；主要可见内容未裁边。保留内置生图原始输出，没有假称已输出 512 × 512。
- PNG 总计 **6,606,105 bytes（约 6.30 MiB）**。四图按 RGBA8 解码共 **25,160,256 bytes（约 23.99 MiB）**，此数不含图集空白、引擎或对齐开销。
- 图像当前状态为 **DRAFT**。配套 `.meta` 使用唯一 UUID 及本仓库已有的 image / texture / sprite-frame 结构，并关闭 mipmap、设置边缘 clamp；属于预导入元数据，尚未经 Cocos Editor 导入确认，未绑定生产场景。
- 默认 SpriteFrame pivot 保持中心 `(0.5, 0.5)`。全身图用于工位时，可由人物容器采用接近脚底的锚点 `(0.5, 0.04)`，各图需在 Editor 中按实际脚底校正。
- 正式运行时建议按既有规范导出 512 × 512 版本，并核实贴图过滤、图集边距、透明边与包体；四张 512² RGBA8 仅像素解码约 4 MiB，但本次未生成或测得该运行时版本。不要把原始四图全部加入首屏常驻资源。
- 详细尺寸、文件哈希、UUID、alpha、字节数、状态与装饰稀有度见 `desktop/art_preview/character_cards_manifest.json`。

本次授权范围是仅新增人物、卡牌素材和预览文件，因此现有游戏入口、玩法脚本、桌面 overlay、构建复制脚本及玩家存档未由本任务修改。**资源已入仓库，独立预览可运行；角色还没有显示到正式游戏画面。** Cocos / 微信真机的导入、触摸、显存与性能验收仍待实际接入后执行。

## 生图来源与提示词

生成工具为内置 **image_gen.imagegen**，透明背景模式；未使用 API / CLI 回退。实习牛马作为基准，后续三位使用它作为物种、比例、线条、光源和画风参考。完整的最终提示词保存在 `desktop/art_preview/generation_prompts.json`，可按单个角色重新生成；没有使用现有生产素材作为编辑目标。

角色依照本项目主题原创生成，未使用第三方角色参考或真实公司商标；商用前由项目方完成最终美术及授权审查。生成图不是角色骨骼、动画帧或可执行玩法组件。

## 验证记录

人物比例、光源、描边、轮廓与职场修仙主题已人工查看；PNG 尺寸、透明通道和实际文件体积已读取确认。浏览器交互、竖屏和独立代码 Review 的最终结果记录于 `desktop/art_preview/verification.json` 与 `desktop/art_preview/review.md`。

执行依据及范围保存在 `ai/tasks/done/TASK-20261030-CHARACTER-CARDS.json`；遵循 AI_AUTO_COMMIT=false，不自动提交或推送。
