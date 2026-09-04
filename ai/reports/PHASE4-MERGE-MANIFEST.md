# Phase4 Merge Manifest

覆盖整个 phase4-ui-content 相对共同祖先 b9a1eb77e33424f39545baa1b05e1a4179025fd8 的交付（含Phase4与4.5），不是仅本轮新增文件。主线固定30bb6dc7ffd41ad1ec1d10c96aeac89d37d99b17；最终冲突预演见同目录报告。

SAFE TO MERGE只说明不会自动改业务/加载候选，不代表产品已批准上线。分支没有修改GameEvents或任何runtime Service/ViewModel；主线核心文件不应从本分支旧版本复制覆盖。

| file | classification | disposition |
|---|---|---|
| ai/reports/PHASE4-MERGE-CONFLICT-PREVIEW.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| ai/reports/PHASE4-MERGE-MANIFEST.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| ai/reports/PHASE4-UI-CONTENT-REPORT.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| ai/reports/PHASE4.5-FINAL-REVIEW.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| ai/reports/PHASE4.5-VERIFICATION.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| assets/configs/animation-trigger-map.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| assets/configs/art-production-manifest.json | SAFE TO MERGE | 仅生产排期清单，PLANNED不等于实物 |
| assets/configs/audio-plan.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| assets/configs/audio-production-manifest.json | SAFE TO MERGE | 仅生产排期清单，PLANNED不等于实物 |
| assets/configs/i18n/zh-CN.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| assets/configs/phase4/achievements.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| assets/configs/phase4/daily-pool-metadata.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| assets/configs/phase4/daily-tasks.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| assets/configs/phase4/office-events.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| assets/configs/phase4/tutorial-copy.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| assets/configs/ui-mock-data.json | DO NOT DIRECT MERGE | DEV_ONLY；生产loader不得引用 |
| assets/configs/ui-theme.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| docs/ACHIEVEMENT-PRESENTATION-CONTRACT.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/ANIMATION-GUIDE.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/ART-GENERATION-PROMPTS.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/ART-PRODUCTION-PRIORITY.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/ASSET-BUDGET.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/ASSET-STRUCTURE.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/AUDIO-GUIDE.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/BALANCE-PRESENTATION.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/CHARACTER-VISUAL-GUIDE.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/COCOS-PREFAB-ARCHITECTURE.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/CONTENT-INTEGRATION.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/CONTENT-RELEASE-CHECKLIST.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/CONTENT-SAFETY-REVIEW.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/CULTIVATION-VISUAL-GUIDE.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/DAILY-TASK-POOL-V1.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/EVENT-ELIGIBILITY-CONTRACT.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/EVENT-POOL-V1.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/FIRST-10-MINUTES.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/FIRST-30-MINUTES.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/IAA-DESIGN.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/IAA-FREQUENCY-V1.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/NUMBER-FORMAT.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/OFFICE-SCENE-GUIDE.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4-CONTENT-BRIEF.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4-CONTENT-REPORT.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4-FIX-REPORT.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4-MAINLINE-COMPATIBILITY.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4-PLAN.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4-REVIEW-FIX-BRIEF.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4-REVIEW.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4-VERIFICATION.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4.5-ASSETS-BRIEF.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4.5-PLAN.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PHASE4.5-TOOLS-BRIEF.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/PREFAB-IMPLEMENTATION-CHECKLIST.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/REWARD-UX-STATE.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/SPRITE-ATLAS-PLAN.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/UI-BINDING-CONTRACT.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/UI-DESIGN-SYSTEM.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/UI-IA.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/UI-SCREEN-ACCEPTANCE.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/UI-STATE-MATRIX.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/schema/achievements.schema.json | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/schema/audio-plan.schema.json | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/schema/daily-tasks.schema.json | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/schema/office-events.schema.json | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/schema/ui-theme.schema.json | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| docs/validation/phase4-content-check.cjs | NEEDS ADAPTATION | 校验工具合入前按主线能力/基线更新，保留保护但不能要求主线runtime等于旧分叉 |
| docs/validation/phase4-content-check.test.cjs | NEEDS ADAPTATION | 校验工具合入前按主线能力/基线更新，保留保护但不能要求主线runtime等于旧分叉 |
| docs/validation/phase45-production-check.cjs | NEEDS ADAPTATION | 校验工具合入前按主线能力/基线更新，保留保护但不能要求主线runtime等于旧分叉 |
| docs/validation/phase45-production-check.test.cjs | NEEDS ADAPTATION | 校验工具合入前按主线能力/基线更新，保留保护但不能要求主线runtime等于旧分叉 |
| generated/phase4-integration-preview/achievements.preview.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| generated/phase4-integration-preview/daily.preview.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| generated/phase4-integration-preview/events.preview.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| generated/phase4-integration-preview/integration-report.json | CANDIDATE ONLY | 仅候选/预览；runtimeEnabled=false，不覆盖源配置 |
| tools/phase4-content-migration/README.md | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| tools/phase4-content-migration/index.cjs | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| tools/phase4-content-migration/phase4-tools.test.cjs | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| tools/phase4-content-migration/preview.cjs | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |
| tools/phase4-content-migration/schema-validator.cjs | SAFE TO MERGE | 非运行时交付；规范的未实现接口仍须按兼容表适配 |

## 必须保留的接入约束

- docs/validation/phase4-content-check.cjs 的b9a1eb7 source/runtime零差异保护专用于本并行分支。主线已经修改两个Service；直接运行该保护会失败，必须由Cursor改成“候选任务增量不触碰runtime”的分支/范围保护，不能为了绿灯删除所有路径保护。
- generated预览中的accepted仅通过结构/语义检查，不是runtime-ready；FISH_30M与全部daily候选有能力隔离，源敏感文案/团建平衡仍须发布裁决。
- i18n保持key→文案，主线注册resolver并在VM脱敏后使用；隐藏成就不直接遍历condition给UI。
- animation映射不是实际Cocos Animation；sourceKind与条件需主线事件/Snapshot桥，晋升失败不能播成功音。
- 原ai/reports/PHASE4-UI-CONTENT-REPORT.md及旧review是历史checkpoint，不是对最新主线的保证。新报告不覆盖历史证据。
- tools/phase4-content-migration仅固定路径写预览，不启用、合并或修改runtime。主线配置若变更必须重跑并审查差异，不拿旧generated输出覆盖新规则。
- assets/configs/ui-mock-data.json只能DEV样例，不直接合入生产资产加载链；如需保留，必须构建剔除/无runtime引用。

## DO NOT DIRECT MERGE 的主线所有权

GameLoopService、SaveService、PromotionService、RewardService、PlatformService、GameFacade、ApplicationFacade、MainSceneController、CocosBootstrap、runtime ViewModel：本分支无修改。不要从旧树拷贝覆盖Cursor实现。未来新增真实prefab/meta/资源需另行Editor验收后合并，本清单不批准伪造UUID。

合并是后续ChatGPT/Cursor决策，本会话仅push候选分支，不merge。
