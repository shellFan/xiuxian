# 资源目录与交付规范

新增资源统一 **snake_case**。现有文件/UUID不为改名而迁移。概念组件名仍PascalCase，源码沿用项目现有kebab-case，资源文件和assetKey才使用snake_case；不得批量改历史路径破坏引用。

```text
assets/resources/ui/
  icons/         salary_stone, cultivation_wisp, mind_lotus, kpi_scroll
  buttons/       button_primary_normal, button_reward_pressed
  panels/        panel_common, modal_mask
  badges/        badge_claimable, badge_hidden
  career/        career_01_portrait ... career_10_portrait
  cultivation/   realm_lianqi_badge, realm_zhuji_badge, realm_jindan_badge, realm_yuanying_badge
  events/        event_meeting, event_production, event_rare, event_egg
  achievements/  achievement_merge, achievement_fishing, achievement_hidden
  daily/         daily_work, daily_merge, daily_event
  tutorial/      tutorial_arrow, tutorial_hand
  effects/       merge_stamp, coin_trail, promotion_halo
  audio/         ui_click, game_merge, events_boss, bgm_office_day
  characters/    worker_01_body, worker_01_work_00, worker_01_work_01
  office/        office_01_wall, office_01_desk, office_01_props
assets/prefabs/ui/       common_modal.prefab, worker_slot.prefab
assets/prefabs/game/     worker.prefab, desk.prefab, merge_effect.prefab
assets/scenes/ui/        ui_preview.scene (后续Editor创建，不进生产入口)
assets/configs/phase4/   候选文案，不由生产ConfigService自动加载
```

以上是规划树，未提供的图片/音频/Prefab不能标记已存在。生产资源导入后生成并提交meta；禁止捏造prefab引用图。所有可见文字由UI本地文本绘制，图像不烘焙中文、数值、按钮标签。

## 规格与预算（接入验收目标，未实测）

- 图标源256×256，常用显示32/48/56；角色源512×512，细节不能依赖超过实际尺寸的纹理。
- UI panel/button使用9-slice，边角固定、中心延展，切片边距需美术交付记录；不拉伸角色。
- atlas按功能组：core_ui、worker、office、events；单图集边长<=2048，首屏可见atlas<=3作为目标。2048² RGBA未压缩约16MiB，不能把文件压缩体积当显存。
- 首屏纹理预算目标<=32MiB未压缩等效，其他页按需加载/释放；异步加载带引用计数，不能弹窗关闭就释放仍被HUD使用资源。
- 大背景分层或可平铺，避免一张超大长屏纹理；图标透明边向内2px防合图渗色。
- 不使用复杂shader和多套Spine；sprite+tween优先。音频配置见AUDIO-GUIDE。

## 命名与清单

`<domain>_<subject>_<variant>_<state>_<frame>`，只有需要的段才写；数字至少两位；禁止空格、中文文件名、final_final和时间戳冒充版本。资源URL不带扩展名，真实导入路径与assetKey逐项校验。

美术交付清单字段：assetKey、相对路径、源文件、作者/生成工具、prompt版本、授权说明、尺寸、anchor、九宫格边距、状态(DRAFT/APPROVED/IMPORTED/VERIFIED)。没有真实文件不能填IMPORTED。生成图需要审查商标、相似角色、裁边、手部错误和风格一致性。

## DEV / 生产隔离

ui-mock-data标DEV_ONLY；preview路由只在开发构建启用，生产不import该JSON。候选文件虽放assets，生产打包是否被包含取决于Cocos资源依赖与bundle设置；正式接入需测包体并显式剔除预览数据，不能仅凭runtimeEnabled:false认定引擎自动排除。

本轮只设计资源目录，没有生成图片/音频或Editor资源。正式接入顺序：审批清单→生成/绘制→人审→Editor导入→meta/引用校验→微信真机内存/安全区/触摸验证。
