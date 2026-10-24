# V5.8 Balance Simulation — 6 Personas × 5 Horizons / 30 Scenarios × 2 Modes

- Gate: **SELF_PRESERVING 30/30 PASS** required. NATIVE failures reported separately.
- NATIVE: 严格按人格策略回复，不做智能自救（不买咖啡/不请假/不选安全回复/不用消耗品）。
- SELF_PRESERVING: 危险时执行合理自救（买咖啡/请半天假/选安全回复/用消耗品）。

## SELF_PRESERVING (Gate)

| Persona | Days | Result | Rank | ProfLv | Salary | MindAvg | MindMin | Mind0% | FatigueAvg | FatigueCrit% | DebtMax | DebtCrit% | Tasks | Boss | Loot | BurnoutRec | Exc |
|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|
| COMPLIANT | 2 | PASS | 1 | 1 | ¥0→193 | 48 | 0 | 2.6% | 9 | 0.0% | 21 | 0.0% | 14 | 0 | 2 | 0 | 0 |
| COMPLIANT | 9 | FAIL consecZero 100min>90 | 1 | 3 | ¥0→576 | 49 | 0 | 2.6% | 9 | 0.0% | 35 | 0.0% | 28 | 10 | 12 | 0 | 0 |
| COMPLIANT | 25 | FAIL consecZero 100min>90 | 1 | 4 | ¥0→840 | 49 | 0 | 2.8% | 8 | 0.0% | 88 | 0.0% | 60 | 21 | 18 | 0 | 0 |
| COMPLIANT | 55 | FAIL consecZero 220min>90 | 1 | 5 | ¥0→2450 | 46 | 0 | 4.7% | 8 | 0.0% | 100 | 0.0% | 120 | 45 | 24 | 0 | 0 |
| COMPLIANT | 115 | FAIL consecZero 220min>90 | 1 | 6 | ¥0→5460 | 49 | 0 | 4.6% | 9 | 0.0% | 100 | 0.0% | 240 | 40 | 25 | 0 | 12 |
| ASSERTIVE | 2 | PASS | 1 | 2 | ¥0→193 | 48 | 0 | 0.5% | 9 | 0.0% | 21 | 0.0% | 14 | 5 | 10 | 0 | 0 |
| ASSERTIVE | 9 | FAIL consecZero 100min>90 | 1 | 3 | ¥0→466 | 53 | 0 | 2.1% | 9 | 0.0% | 35 | 0.0% | 28 | 11 | 10 | 0 | 0 |
| ASSERTIVE | 25 | FAIL consecZero 160min>90 | 1 | 4 | ¥0→980 | 47 | 0 | 3.8% | 9 | 0.0% | 81 | 0.0% | 60 | 22 | 16 | 0 | 0 |
| ASSERTIVE | 55 | FAIL consecZero 220min>90 | 1 | 5 | ¥0→2250 | 46 | 0 | 4.5% | 9 | 0.0% | 100 | 0.0% | 120 | 16 | 12 | 0 | 6 |
| ASSERTIVE | 115 | FAIL consecZero 220min>90 | 1 | 7 | ¥0→5830 | 50 | 0 | 4.1% | 8 | 0.0% | 100 | 0.0% | 240 | 77 | 27 | 0 | 0 |
| BALANCED | 2 | PASS | 1 | 2 | ¥0→53 | 49 | 0 | 1.6% | 9 | 0.0% | 21 | 0.0% | 14 | 6 | 8 | 0 | 0 |
| BALANCED | 9 | FAIL consecZero 160min>90 | 1 | 3 | ¥0→606 | 47 | 0 | 4.5% | 9 | 0.0% | 59 | 0.0% | 28 | 10 | 9 | 0 | 0 |
| BALANCED | 25 | FAIL consecZero 140min>90 | 1 | 3 | ¥0→920 | 47 | 0 | 3.5% | 9 | 0.0% | 77 | 0.0% | 60 | 7 | 6 | 0 | 1 |
| BALANCED | 55 | FAIL consecZero 220min>90 | 1 | 5 | ¥0→2420 | 47 | 0 | 3.8% | 8 | 0.0% | 100 | 0.0% | 120 | 34 | 19 | 0 | 0 |
| BALANCED | 115 | FAIL consecZero 220min>90 | 1 | 7 | ¥0→5550 | 50 | 0 | 4.0% | 8 | 0.0% | 100 | 0.0% | 240 | 93 | 27 | 0 | 0 |
| FISHING_MASTER | 2 | PASS | 1 | 1 | ¥0→1008 | 92 | 55 | 0.0% | 0 | 0.0% | 24 | 0.0% | 14 | 0 | 1 | 0 | 0 |
| FISHING_MASTER | 9 | PASS | 1 | 2 | ¥0→2066 | 93 | 55 | 0.0% | 0 | 0.0% | 49 | 0.0% | 28 | 0 | 1 | 0 | 0 |
| FISHING_MASTER | 25 | PASS | 1 | 3 | ¥0→4420 | 94 | 54 | 0.0% | 0 | 0.0% | 96 | 0.0% | 60 | 0 | 1 | 0 | 0 |
| FISHING_MASTER | 55 | PASS | 1 | 4 | ¥0→8990 | 93 | 46 | 0.0% | 0 | 0.0% | 100 | 0.0% | 120 | 0 | 1 | 0 | 0 |
| FISHING_MASTER | 115 | PASS | 1 | 5 | ¥0→18000 | 93 | 25 | 0.0% | 0 | 0.0% | 100 | 0.0% | 240 | 0 | 1 | 0 | 0 |
| TECH_PERFECTIONIST | 2 | PASS | 1 | 1 | ¥0→193 | 48 | 0 | 2.6% | 9 | 0.0% | 21 | 0.0% | 14 | 0 | 2 | 0 | 0 |
| TECH_PERFECTIONIST | 9 | FAIL consecZero 100min>90 | 1 | 3 | ¥0→576 | 49 | 0 | 2.6% | 9 | 0.0% | 35 | 0.0% | 28 | 7 | 9 | 0 | 0 |
| TECH_PERFECTIONIST | 25 | FAIL consecZero 100min>90 | 1 | 4 | ¥0→840 | 49 | 0 | 2.8% | 8 | 0.0% | 88 | 0.0% | 60 | 22 | 14 | 0 | 0 |
| TECH_PERFECTIONIST | 55 | FAIL consecZero 220min>90 | 1 | 5 | ¥0→2450 | 46 | 0 | 4.7% | 8 | 0.0% | 100 | 0.0% | 120 | 47 | 22 | 0 | 0 |
| TECH_PERFECTIONIST | 115 | FAIL consecZero 220min>90 | 1 | 6 | ¥0→5460 | 49 | 0 | 4.6% | 9 | 0.0% | 100 | 0.0% | 240 | 24 | 21 | 0 | 12 |
| CAREER_CLIMBER | 2 | PASS | 1 | 2 | ¥0→193 | 48 | 0 | 0.5% | 9 | 0.0% | 21 | 0.0% | 14 | 3 | 5 | 0 | 0 |
| CAREER_CLIMBER | 9 | FAIL consecZero 100min>90 | 1 | 3 | ¥0→466 | 53 | 0 | 2.1% | 9 | 0.0% | 35 | 0.0% | 28 | 8 | 12 | 0 | 0 |
| CAREER_CLIMBER | 25 | FAIL consecZero 160min>90 | 1 | 4 | ¥0→980 | 47 | 0 | 3.8% | 9 | 0.0% | 81 | 0.0% | 60 | 24 | 16 | 0 | 0 |
| CAREER_CLIMBER | 55 | FAIL consecZero 220min>90 | 1 | 4 | ¥0→2250 | 46 | 0 | 4.5% | 9 | 0.0% | 100 | 0.0% | 120 | 9 | 15 | 0 | 6 |
| CAREER_CLIMBER | 115 | FAIL consecZero 220min>90 | 1 | 7 | ¥0→5830 | 50 | 0 | 4.1% | 8 | 0.0% | 100 | 0.0% | 240 | 76 | 28 | 0 | 0 |

**SELF_PRESERVING: 10/30 PASS**

### FAIL details:
- COMPLIANT 9d: consecZero 100min>90
- COMPLIANT 25d: consecZero 100min>90
- COMPLIANT 55d: consecZero 220min>90
- COMPLIANT 115d: consecZero 220min>90
- ASSERTIVE 9d: consecZero 100min>90
- ASSERTIVE 25d: consecZero 160min>90
- ASSERTIVE 55d: consecZero 220min>90
- ASSERTIVE 115d: consecZero 220min>90
- BALANCED 9d: consecZero 160min>90
- BALANCED 25d: consecZero 140min>90
- BALANCED 55d: consecZero 220min>90
- BALANCED 115d: consecZero 220min>90
- TECH_PERFECTIONIST 9d: consecZero 100min>90
- TECH_PERFECTIONIST 25d: consecZero 100min>90
- TECH_PERFECTIONIST 55d: consecZero 220min>90
- TECH_PERFECTIONIST 115d: consecZero 220min>90
- CAREER_CLIMBER 9d: consecZero 100min>90
- CAREER_CLIMBER 25d: consecZero 160min>90
- CAREER_CLIMBER 55d: consecZero 220min>90
- CAREER_CLIMBER 115d: consecZero 220min>90

## PERSONA_NATIVE (Reference)

| Persona | Days | Result | Rank | ProfLv | Salary | MindAvg | MindMin | Mind0% | FatigueAvg | FatigueCrit% | DebtMax | DebtCrit% | Tasks | Boss | Loot | BurnoutRec | Exc |
|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|
| COMPLIANT | 2 | FAIL mindZeroRatio 43.4% > 5%;consecZero 420min>90 | 1 | 1 | ¥0→1073 | 22 | 0 | 43.4% | 9 | 0.0% | 21 | 0.0% | 14 | 0 | 2 | 0 | 0 |
| COMPLIANT | 9 | FAIL mindZeroRatio 44.7% > 8%;consecZero 440min>90 | 1 | 3 | ¥0→2196 | 17 | 0 | 44.7% | 9 | 0.0% | 49 | 0.0% | 28 | 10 | 12 | 0 | 0 |
| COMPLIANT | 25 | FAIL mindZeroRatio 44.7% > 8%;consecZero 440min>90 | 1 | 4 | ¥0→4700 | 13 | 0 | 44.7% | 8 | 0.0% | 96 | 0.0% | 60 | 21 | 18 | 0 | 0 |
| COMPLIANT | 55 | FAIL mindZeroRatio 40.2% > 10%;consecZero 460min>90 | 1 | 5 | ¥0→9640 | 16 | 0 | 40.2% | 8 | 0.0% | 100 | 0.0% | 120 | 45 | 24 | 0 | 0 |
| COMPLIANT | 115 | FAIL mindZeroRatio 39.0% > 10%;consecZero 440min>90 | 1 | 6 | ¥0→19420 | 16 | 0 | 39.0% | 9 | 0.0% | 100 | 0.0% | 240 | 40 | 25 | 0 | 12 |
| ASSERTIVE | 2 | FAIL mindZeroRatio 45.5% > 5%;consecZero 420min>90 | 1 | 2 | ¥0→1073 | 20 | 0 | 45.5% | 9 | 0.0% | 21 | 0.0% | 14 | 5 | 10 | 0 | 0 |
| ASSERTIVE | 9 | FAIL mindZeroRatio 42.6% > 8%;consecZero 440min>90 | 1 | 3 | ¥0→2196 | 17 | 0 | 42.6% | 9 | 0.0% | 49 | 0.0% | 28 | 11 | 10 | 0 | 0 |
| ASSERTIVE | 25 | FAIL mindZeroRatio 42.6% > 8%;consecZero 440min>90 | 1 | 4 | ¥0→4700 | 14 | 0 | 42.6% | 9 | 0.0% | 92 | 0.0% | 60 | 22 | 15 | 0 | 0 |
| ASSERTIVE | 55 | FAIL mindZeroRatio 40.4% > 10%;consecZero 440min>90 | 1 | 5 | ¥0→9640 | 15 | 0 | 40.4% | 9 | 0.0% | 100 | 0.0% | 120 | 16 | 12 | 0 | 6 |
| ASSERTIVE | 115 | FAIL mindZeroRatio 37.8% > 10%;consecZero 460min>90 | 1 | 7 | ¥0→19420 | 18 | 0 | 37.8% | 8 | 0.0% | 100 | 0.0% | 240 | 78 | 27 | 0 | 0 |
| BALANCED | 2 | FAIL mindZeroRatio 45.0% > 5%;consecZero 420min>90 | 1 | 2 | ¥0→1073 | 20 | 0 | 45.0% | 9 | 0.0% | 21 | 0.0% | 14 | 6 | 8 | 0 | 0 |
| BALANCED | 9 | FAIL mindZeroRatio 41.5% > 8%;consecZero 440min>90 | 1 | 3 | ¥0→2196 | 19 | 0 | 41.5% | 9 | 0.0% | 59 | 0.0% | 28 | 10 | 12 | 0 | 0 |
| BALANCED | 25 | FAIL mindZeroRatio 44.4% > 8%;consecZero 440min>90 | 1 | 3 | ¥0→4700 | 12 | 0 | 44.4% | 9 | 0.0% | 87 | 0.0% | 60 | 7 | 6 | 0 | 1 |
| BALANCED | 55 | FAIL mindZeroRatio 40.1% > 10%;consecZero 440min>90 | 1 | 5 | ¥0→9640 | 16 | 0 | 40.1% | 8 | 0.0% | 100 | 0.0% | 120 | 34 | 19 | 0 | 0 |
| BALANCED | 115 | FAIL mindZeroRatio 39.1% > 10%;consecZero 460min>90 | 1 | 7 | ¥0→19420 | 16 | 0 | 39.1% | 8 | 0.0% | 100 | 0.0% | 240 | 93 | 27 | 0 | 0 |
| FISHING_MASTER | 2 | PASS | 1 | 1 | ¥0→1008 | 92 | 55 | 0.0% | 0 | 0.0% | 24 | 0.0% | 14 | 0 | 1 | 0 | 0 |
| FISHING_MASTER | 9 | PASS | 1 | 2 | ¥0→2066 | 93 | 55 | 0.0% | 0 | 0.0% | 49 | 0.0% | 28 | 0 | 1 | 0 | 0 |
| FISHING_MASTER | 25 | PASS | 1 | 3 | ¥0→4420 | 94 | 54 | 0.0% | 0 | 0.0% | 96 | 0.0% | 60 | 0 | 1 | 0 | 0 |
| FISHING_MASTER | 55 | PASS | 1 | 4 | ¥0→9080 | 93 | 34 | 0.0% | 0 | 0.0% | 100 | 0.0% | 120 | 0 | 1 | 0 | 0 |
| FISHING_MASTER | 115 | PASS | 1 | 5 | ¥0→18300 | 93 | 5 | 0.0% | 0 | 0.0% | 100 | 0.0% | 240 | 0 | 1 | 0 | 0 |
| TECH_PERFECTIONIST | 2 | FAIL mindZeroRatio 43.4% > 5%;consecZero 420min>90 | 1 | 1 | ¥0→1073 | 22 | 0 | 43.4% | 9 | 0.0% | 21 | 0.0% | 14 | 0 | 2 | 0 | 0 |
| TECH_PERFECTIONIST | 9 | FAIL mindZeroRatio 44.7% > 8%;consecZero 440min>90 | 1 | 3 | ¥0→2196 | 17 | 0 | 44.7% | 9 | 0.0% | 49 | 0.0% | 28 | 7 | 9 | 0 | 0 |
| TECH_PERFECTIONIST | 25 | FAIL mindZeroRatio 44.7% > 8%;consecZero 440min>90 | 1 | 4 | ¥0→4700 | 13 | 0 | 44.7% | 8 | 0.0% | 96 | 0.0% | 60 | 22 | 14 | 0 | 0 |
| TECH_PERFECTIONIST | 55 | FAIL mindZeroRatio 40.2% > 10%;consecZero 460min>90 | 1 | 5 | ¥0→9640 | 16 | 0 | 40.2% | 9 | 0.0% | 100 | 0.0% | 120 | 46 | 23 | 0 | 0 |
| TECH_PERFECTIONIST | 115 | FAIL mindZeroRatio 39.0% > 10%;consecZero 440min>90 | 1 | 6 | ¥0→19420 | 16 | 0 | 39.0% | 9 | 0.0% | 100 | 0.0% | 240 | 24 | 21 | 0 | 12 |
| CAREER_CLIMBER | 2 | FAIL mindZeroRatio 45.5% > 5%;consecZero 420min>90 | 1 | 2 | ¥0→1073 | 20 | 0 | 45.5% | 9 | 0.0% | 21 | 0.0% | 14 | 3 | 5 | 0 | 0 |
| CAREER_CLIMBER | 9 | FAIL mindZeroRatio 42.6% > 8%;consecZero 440min>90 | 1 | 3 | ¥0→2196 | 17 | 0 | 42.6% | 9 | 0.0% | 49 | 0.0% | 28 | 8 | 12 | 0 | 0 |
| CAREER_CLIMBER | 25 | FAIL mindZeroRatio 42.6% > 8%;consecZero 440min>90 | 1 | 4 | ¥0→4700 | 14 | 0 | 42.6% | 9 | 0.0% | 92 | 0.0% | 60 | 24 | 17 | 0 | 0 |
| CAREER_CLIMBER | 55 | FAIL mindZeroRatio 40.4% > 10%;consecZero 440min>90 | 1 | 4 | ¥0→9640 | 15 | 0 | 40.4% | 9 | 0.0% | 100 | 0.0% | 120 | 9 | 15 | 0 | 6 |
| CAREER_CLIMBER | 115 | FAIL mindZeroRatio 37.8% > 10%;consecZero 460min>90 | 1 | 7 | ¥0→19420 | 18 | 0 | 37.8% | 8 | 0.0% | 100 | 0.0% | 240 | 76 | 28 | 0 | 0 |

**NATIVE: 5/30 PASS**

### NATIVE FAIL details (新手/不懂系统玩家):
- COMPLIANT 2d: mindZeroRatio 43.4% > 5%; consecZero 420min>90
- COMPLIANT 9d: mindZeroRatio 44.7% > 8%; consecZero 440min>90
- COMPLIANT 25d: mindZeroRatio 44.7% > 8%; consecZero 440min>90
- COMPLIANT 55d: mindZeroRatio 40.2% > 10%; consecZero 460min>90
- COMPLIANT 115d: mindZeroRatio 39.0% > 10%; consecZero 440min>90
- ASSERTIVE 2d: mindZeroRatio 45.5% > 5%; consecZero 420min>90
- ASSERTIVE 9d: mindZeroRatio 42.6% > 8%; consecZero 440min>90
- ASSERTIVE 25d: mindZeroRatio 42.6% > 8%; consecZero 440min>90
- ASSERTIVE 55d: mindZeroRatio 40.4% > 10%; consecZero 440min>90
- ASSERTIVE 115d: mindZeroRatio 37.8% > 10%; consecZero 460min>90
- BALANCED 2d: mindZeroRatio 45.0% > 5%; consecZero 420min>90
- BALANCED 9d: mindZeroRatio 41.5% > 8%; consecZero 440min>90
- BALANCED 25d: mindZeroRatio 44.4% > 8%; consecZero 440min>90
- BALANCED 55d: mindZeroRatio 40.1% > 10%; consecZero 440min>90
- BALANCED 115d: mindZeroRatio 39.1% > 10%; consecZero 460min>90
- TECH_PERFECTIONIST 2d: mindZeroRatio 43.4% > 5%; consecZero 420min>90
- TECH_PERFECTIONIST 9d: mindZeroRatio 44.7% > 8%; consecZero 440min>90
- TECH_PERFECTIONIST 25d: mindZeroRatio 44.7% > 8%; consecZero 440min>90
- TECH_PERFECTIONIST 55d: mindZeroRatio 40.2% > 10%; consecZero 460min>90
- TECH_PERFECTIONIST 115d: mindZeroRatio 39.0% > 10%; consecZero 440min>90
- CAREER_CLIMBER 2d: mindZeroRatio 45.5% > 5%; consecZero 420min>90
- CAREER_CLIMBER 9d: mindZeroRatio 42.6% > 8%; consecZero 440min>90
- CAREER_CLIMBER 25d: mindZeroRatio 42.6% > 8%; consecZero 440min>90
- CAREER_CLIMBER 55d: mindZeroRatio 40.4% > 10%; consecZero 440min>90
- CAREER_CLIMBER 115d: mindZeroRatio 37.8% > 10%; consecZero 460min>90

NATIVE 失败表明不懂系统的玩家可能进入不良状态。Game 提供了恢复路径（Burnout 请半天假/咖啡/摸鱼），但玩家需要自行发现。

## 经济修正记录

- WORK mindPerHour: -5 → -3（V5.8：局势流 -6/h + 模式流 合成 -9/h，配合结算 +35 → 85% 工作人格净收支 ≥0）
- 结算道心恢复: +35（不变）
- 心魔自增强: mind<10 时 +2/h → +1/h（V5.8 减半）
- 结算心魔消退: -3/晚（V5.8 新增）
- demon≥95 阀门: 强制 -10（V5.8 新增）

## Verdict

SELF_PRESERVING: **10/30 — NOT COMPLETE**
NATIVE: 5/30（参考值，非门禁）
