# 音效计划

配置源：`assets/configs/audio-plan.json`，25个独立ID（6UI、10Game、5Events、4BGM）；全部PLANNED，无真实音频文件，不能对不存在assetKey调用加载后声称可用。prefix解决game_promotion与bgm_promotion冲突。

风格：木鱼短击 × 键盘轻敲 × 纸张与印章；喜剧感来自节奏，不做刺耳报警。主旋律古筝/笛短动机加轻lo-fi节拍，避免模仿任何现有游戏曲目。

每项ID、用途、触发、priority、loop、建议时长均在JSON；priority数越小越优先。声音以服务成功事件触发，点招募按钮只播ui_click，成功再播game_recruit；广告加载完成不等于发奖成功。salary每秒最多1次，同帧多个奖励合一声；全局最多4路SFX和1路BGM，超限丢弃最旧低优先声，不堆积延迟回放。

ui_click短木敲；back轻翻纸；open/close卷宗展开收起；success清脆单音；fail低音短点，不惊吓。production_alert是游戏内柔和双音，不模拟系统警报。layoff_rumor用纸张抖动，避免真实恐慌氛围。

BGM日夜切换仅跟视觉主题，不改变业务时钟。promotion/rare_event临时曲结束恢复先前曲；350ms交叉淡化实现时可临时占2路但总输出音量不能翻倍，完成后回1路。一般SFX250ms cooldown，资源获得额外1秒限流。音量层级：UI -8dB、奖励-10dB、氛围-18dB、BGM -22dB相对统一母带；峰值<=-1dBFS，最终响度需人工听验，不把这些目标当测量结果。

设置：BGM/音效独立开关、整体音量。尊重用户静音，后台暂停所有音频，前台由用户交互恢复（平台限制由Platform Owner确认）。资源失败静音降级，不阻塞操作或奖励。无需麦克风权限。

交付：SFX源WAV 48kHz/16bit，游戏压缩格式由Cocos微信构建支持实测决定；BGM建议可无缝loop60秒，首尾交叉编辑。assetKey采用snake_case，来源与授权写入资源清单。人工验收：扬声器/耳机低音量、快速连点、静音切换、后台恢复、低端机内存和微信播放行为。
