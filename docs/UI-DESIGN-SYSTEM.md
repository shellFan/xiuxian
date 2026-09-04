# UI Design System — 工位修仙

状态：可实施规格；token 为候选，尚未被现有 UI 加载。唯一颜色/尺寸源：[ui-theme.json](../assets/configs/ui-theme.json)。不把色值散落到 Script。

## 美术方向

暖纸底、深墨描边、青玉主行动、工资条金、朱砂危险。办公室作为舞台，牛马是主角；资源 HUD 像工资条，KPI 像盖章卷宗。避免表格占主屏、白底数据看板和写实修仙铠甲。小图标同时有形状和标签，不能只靠红绿区分。

## 主 HUD 施工坐标

设计基准 750×1334；下表使用**完整设计视口坐标**，原点为左上角，基准为零硬件 inset 的 750×1334 视口，不是已经加过 padding 的内容原点。平台安全区先按宽度 scale 换成逻辑 inset，再与最小 padding 合并：`L=max(insetLeft,24)`、`R=750-max(insetRight,24)`、`T=max(insetTop,16)`、`B=H-max(insetBottom,16)`，可用宽度为 `R-L`。表中的基准 `x=24` 正好是基准 `L`；不要再次叠加最小侧边距，也不要把这些公式应用两次。

| 区域 | x / y / w / h | 内容与层级 |
|---|---|---|
| 顶部身份条 | `L / 16+(T-16) / (R-L) / 88` | 左职业徽章；右工资；避让微信胶囊区域 |
| 资源条 | `L / 112+(T-16) / (R-L) / 80` | 绩效、修为、道心；正文28，紧凑24 |
| KPI 卷宗 | `L / 204+(T-16) / (R-L) / 64` | 已完成项数/总项数；热区 y=192+(T-16)、高88，不与资源条重叠 |
| 办公室舞台 | `L / 280+(T-16) / (R-L) / 104` | 远景墙面、窗、工位气氛；无主操作 |
| 合成盘 | `(L+R-side)/2 / boardY / side / side` | `side=min(624,R-L)`；4×4，格与间距同 scale，保持正方形 |
| 舞台右快捷行 | `R-288、R-192、R-96 / 288+(T-16) / 各88 / 88` | 任务/成就/设置可视图标48；实际触摸框88 |
| 工作/摸鱼 | `L / actionY / 300*(R-L)/702 / 96` | 双态控制，显示当前生效态；点击禁用直到响应 |
| 招募 | `L+324*(R-L)/702 / actionY / 378*(R-L)/702 / 96` | 主 CTA，显示真实价格与满盘禁用原因 |
| 底栏 | `L / B-16-112 / (R-L) / 112` | 牛马/职业/宗门/事件四等分，标签24 |

水平 band 统一使用 `x=L`、`width=R-L`。工作/摸鱼与招募保留基准内比：左控件宽 `300*(R-L)/702`，招募 x 为 `L+324*(R-L)/702`、宽为 `378*(R-L)/702`，间隔随宽度缩放；过窄时改为纵向堆叠。底栏始终四等分。快捷入口保留右侧视觉归属，固定锚在棋盘上方；不挤压88触摸区，若 `R-L<288` 就折叠为「更多」，不得溢出。顶部各行按 `y+(T-16)` 平移。

基准数值样例：无硬件 inset 时 `L=24/R=726`，可用宽702，full bands 为 `[24,726]`，棋盘为 `[63,687]`；左 inset80、右 inset0 时 `L=80/R=726`，可用宽646，full bands 为 `[80,726]`，棋盘为 `[91,715]`。基准 `T=16/B=1318` 时 `navY=1190`、`actionY=1056`、`boardY=400`。这里的 `boardY=actionY-32-side`；长屏增加办公空间而不拉伸人物或棋盘。对非基准屏先定义 `H=viewportHeight/scale`，再按通用公式 `navY=B-16-112`、`actionY=navY-38-96`、`boardY=actionY-32-side` 计算。

层级：office → board → hud/navigation → mask → modal → tutorial → toast。拖拽浮层在 board 内最上，不可越过 Modal。Toast 不遮主按钮。

## 安全区与长屏

1. 待接入的Platform UI Adapter需返回屏幕尺寸、安全矩形、胶囊矩形（同一物理坐标）。当前PlatformSystemInfo只有screenWidth/Height，无安全区/胶囊；此能力需Platform Owner补充，不能声称已有。Presenter一次换算为设计单位 `scale=viewportWidth/750`，`insetLogical=insetPhysical/scale`；按方向变更重新算，不每帧轮询。换算后只由上述 `L/R/T/B` 生成完整视口坐标。
2. 内容矩形使用真实安全区 inset 与 token 最小 padding 的较大值，不能再重复减平台已经扣除的 inset。胶囊单独碰撞避让；身份行空间不足移工资到下一行，不用空字符串裁掉数值。
3. 16:9（750×1334）紧凑布局；19.5:9（750×1625）、20:9（750×1667）增加舞台与上下留白，不拉伸牛马或棋盘；底栏锚定安全底边。
4. 实际安全内容高不足1334时，先压缩装饰舞台与纵向空白，再把次级入口折叠到「更多」，棋盘等比缩放但格触摸尺寸不低88。仍不足则主内容可纵向滚动，拖动开始时锁滚动；HUD/底栏固定。若顶部、棋盘与行动区碰撞，遵循 compact/scroll fallback；更多高度扩展办公空间，不扩展人物。若视口窄到会产生负宽度或负坐标，停止预览并报 unsupported viewport error，不渲染无效几何。
5. 导航底部留 `max(homeInset,16)`；顶部不压状态栏。无平台数据时保守16/24 padding，胶囊区域禁放按钮，待数据返回重排。
6. 字体放大到1.3倍时，弹窗内容滚动、按钮区固定；长标签换行最多两行，资源缩写可点开完整值。字符不能被强行横向压缩。

## 组件规则

文档显式引用语法为 `token:<JSON路径>`，例如 `token:buttonHeight.normal` 或 `token:colors.primary`。

| 组件 | Token / 内容 | 行为 |
|---|---|---|
| Primary Button | `token:colors.primary`/`token:colors.onPrimary`，`token:buttonHeight.normal`，`token:fontScale.button` | 一屏一个突出主动作；提交期间 loading |
| Secondary Button | `token:colors.secondary`/`token:colors.ink`，`token:colors.outline` | 普通返回、稍后、取消；不伪装禁用 |
| Danger Button | `token:colors.danger`/`token:colors.onDanger` | 危险操作 ConfirmModal 后执行；结果未明不重复 |
| Reward Button | `token:colors.reward`/`token:colors.onReward` + 播放图标 | 文案“看广告 ×2”等；rewarded态“已领取” |
| Disabled Button | `token:colors.disabled`/`token:colors.onDisabled` | 不收触摸；旁边显示原因，不能只降低透明度 |
| Card | `token:colors.surface`、`token:radius.card`、`token:panelPadding.normal` | 信息与单项操作；选中加描边与勾 |
| Panel | `token:colors.paper`、`token:radius.panel`、`token:panelPadding.normal` | 页内分组，不滥用多层嵌套 |
| Modal | `token:colors.surface`、`token:radius.panel`、`token:panelPadding.dialog` | 共用容器，见下；内容可滚动 |
| Toast | `token:colors.ink`/`token:colors.onPrimary`、`token:fontScale.body` | 一次最多1条，合并相同提示，最多排3条 |
| Tooltip | `token:colors.paper`/`token:colors.ink`，max宽420 | 点开、点外关闭；不能承载唯一必要信息 |
| Badge | `token:colors.secondary`/`token:colors.ink`、`token:radius.pill` | 数字99+封顶，含可读语义，不只红点 |
| ProgressBar | `token:colors.secondary`轨、`token:colors.primary`填 | 视觉clamp到0–100%，文字保留真实进度 |
| ResourceBar | 资源icon + 数值 + 单位；资源色使用 `token:colors.salary`、`token:colors.performance`、`token:colors.cultivation`、`token:colors.mind` | 短数主显，点开精确值；不实时闪烁 |
| Tab | 选中 `token:colors.primary` 下划线+文字 | 切换保留本页滚动；loading不清空旧数据 |
| BottomNavigation | 4等分，`token:iconSize.navigation` | 同时最多1选中；点当前Tab回顶不重建状态 |
| 列表项 | `token:panelPadding.normal`，min高112 | 左图标中两行右按钮；长列表虚拟化 |
| 空状态 | 88图标+短句+一个行动 | 区分真的无内容与加载失败 |

## 按钮状态与点击契约

普通/主行动/广告/危险/关闭/返回/Tab/FAB 均复用 `normal → pressed → normal`；异步触发 `loading → normal|disabled|rewarded`。关闭/返回视觉48但热区88×88；FAB可视88且热区96。Tab最小宽88。pressed scale=0.96，仅压视觉不改变命中区；取消触摸/失焦复原。loading保留原宽、读屏标签“处理中”、不可双击。rewarded只用于已由服务确认发奖的奖励按钮，普通成功操作回normal。

键盘/DEV预览提供focus描边；声音关闭仍有视觉反馈。业务执行用 commandId 去重由服务边界负责，UI锁不能作为防重复发奖的唯一机制。

## 统一 Modal 系统

共享节点：CommonModal/Mask、Panel/Header/{Title,Close}、Panel/BodyScroll/Content、Panel/Actions/{Secondary,Primary}、StatusLabel。preferred宽654，实际 `min(654,safeWidth-64)`，高度不超过安全高82%；背景70%暗色，点击外层不穿透。

生命周期：CLOSED → OPENING → OPEN → SUBMITTING → OPEN|CLOSING → CLOSED。一个活动Modal，FIFO队列上限3；按业务实体ID去重。致命系统消息优先但不得中断发奖事务；先等结果再显示。弹窗销毁取消视觉订阅，不取消已提交业务交易。

Mask/返回/×：普通提示可关闭；Confirm取消不提交；事件收起保留pending；SUBMITTING阶段禁止二次提交，超时显示“结果确认中”，查询权威结果，不把超时当失败后重发；提供返回主页面查看状态的恢复路径。关闭恢复触发它的控件焦点。

| Modal | Body / 主 / 次 | 关闭与持久状态 |
|---|---|---|
| OfficeEventModal | 事件及Effect / 选择 / 稍后 | 收起不丢 pendingEventId |
| PromotionModal | 条件、概率、方案 / 答辩 / 再准备 | 服务 transaction 结果唯一权威 |
| OfflineRewardModal | 预览或结算单 / 收下 / 看广告×2 | settlementId；未结算选择1倍或2倍，已结算仅展示 |
| AchievementRewardModal | 成就及奖励 / 领取 / 关闭 | claim失败不标已领取 |
| DailyRewardModal | 今日奖励 / 领取 / 稍后 | 区分签到与每日任务实体ID |
| ConfirmModal | 行为与影响 / 明确动词 / 取消 | 默认焦点取消，不能叫“好的”掩盖风险 |
| RewardAdModal | 奖励、广告说明 / 看广告 / 不用了 | 成功回调后仍等发奖结果 |
| SystemMessageModal | 可恢复原因 / 重试或确认 / 返回 | 技术细节藏在DEV，生产给操作路径 |

进场180ms easeOutCubic，退场140ms easeInQuad；减少动态用opacity 100ms、无缩放。统一暂停场景交互、屏蔽重复开关；广告中先屏蔽新Modal但不改变模拟时钟。

## 验收

三个宽高比、安全区顶部/底部/胶囊、长文本、1.3倍字体、全盘、低道心、奖励失败/超时/重复回调/重启、断网错误、减少动态与静音各走一次。Cocos真机验收未执行，本轮不能称界面已验证。
