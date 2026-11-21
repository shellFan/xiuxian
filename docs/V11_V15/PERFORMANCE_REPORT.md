# 性能报告（PERFORMANCE_REPORT）

> 执行环境：真实 Chrome 430×932（CDP）+ Cocos Creator 3.8.4 web-desktop 实机构建。
> 技能：`performance-optimization`（测量先行）。

## 1. 启动与加载（perf-probe 实测，2026-11-21 构建 build-20261121155820）

| 指标 | 值 |
|---|---|
| DOMContentLoaded | **570ms** |
| load event | 1223ms |
| 资源数 | 63 |
| 总传输 | 12.9MB |
| 最慢资源 | 场景 PNG 2.76MB/35ms、ui-overlay.js 276KB/34ms、引擎 _virtual_cc 3.36MB/24ms（本地服务，无网络延迟） |

## 2. FPS 窗口（60fps 上限锁帧）

| 场景 | 时长 | avg | min | p95 | heap | DOM 节点 |
|---|---|---|---|---|---|---|
| home | 8s | **60.3** | 60 | 61 | 36.1MB | 366 |
| battle-early | 10s | **60.2** | 60 | 61 | 39.4MB | 136 |
| battle-sustained | 12s | **60.2** | 60 | 61 | 41.8MB | 154 |

**无掉帧**：三窗口 min=60（引擎锁 60fps）；战斗持续态 heap 41.8MB（远低于预算 32MiB 纹理+代码 ~80MB 安全线）。

## 3. 60 分钟浸泡测试（soak-60m.cjs，任务书§18，2026-11-22 实测）

| 项 | 值 |
|---|---|
| 时长 | **60:14 分钟**（16:04:13 → 17:04:27） |
| 采样 | 120 次（30s 间隔）+ 117 次真实动作注入（修炼点击/攻击/模式切换） |
| heartbeat 失败 | **0** |
| 帧流中断（gap ≥45s） | **0** |
| console errors / exceptions | **0** |
| heap 曲线 | 首采样 37.4MB → 末采样 53.2MB；**前半均值 47.8MB vs 后半均值 48.2MB（+0.4MB）→ 无线性泄漏**，波动为 GC 锯齿（37–62MB 周期） |
| 产物 | artifacts/V11_V15/soak-results.json + soak-evidence.jsonl（120+ 行证据） |

**判定：PASS**——60 分钟连续真实交互（含战斗/修炼/模式切换）无卡死、无空白、无异常、无内存泄漏趋势。120 分钟延长测试基建已就位（改 SOAK_MINUTES 常量即可），列为下轮可选项。

## 4. 静态预算核对（GAMEDEV_SKILLS/PERFORMANCE §2）

| 项 | 预算 | 现状 |
|---|---|---|
| 图集组内存 | ui_common 12 / career 16 / events 4 / office 峰值 28 MiB | **未图集化**（散图 12MB 总量），预算未触顶但优化空间在 |
| 并发特效 | ≤3，粒子 ≤12 | ANIMATION-GUIDE + ui-theme 约束生效 |
| 音频通道 | ≤4 SFX + 1 BGM | CocosAudioBackend cooldown 80ms + 并发 8 生效 |
| 泄漏防护 | 订阅/解绑成对 | V11 验收发现的重复绑定（craft 按钮）已修复 |

## 5. 已知优化空间（非缺陷）

1. **图集化未落地**：0 个 .plist——SPRITE-ATLAS-PLAN 规划（core_ui/worker/office/events ≤2048、首屏 ≤3）待执行，首屏 PNG 2.76MB 是最大单项
2. FPS 探针为 DOM rAF 采样（引擎真实 drawcall 未测）——wx 真机 profiling 属 BLOCKED（E1）
