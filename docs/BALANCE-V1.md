# Balance V1

Source of truth: `assets/configs/progression.json` (minutes are design targets, not hardcoded in UI).

## Targets

- New player: first noticeable upgrade in **5–10 minutes** (career level 1 KPI).
- First promotion: **20–30 minutes** (level 1 → 2).
- Early game: first 4–5 stages in **2–4 hours**.
- Offline rewards: noticeable, but do not replace active play (8h cap in `idle.json`).

## Career / expected minutes

| Level | Name | requiredExp | KPI work seconds | salary/hour (L1 worker) | mind drain/hour | expected minutes |
|------:|------|------------:|-----------------:|------------------------:|----------------:|-----------------:|
| 1 | 练气职员 | 0 | 300 | 10 | 60 | 8 |
| 2 | 筑基职员 | 100 | 600 | 20 | 60 | 25 |
| 3 | 金丹主管 | 300 | 900 | 40 | 60 | 50 |
| 4 | 元婴主管 | 700 | 1200 | 80 | 60 | 90 |
| 5 | 化神经理 | 1500 | 1500 | 160 | 60 | 150 |
| 6 | 炼虚经理 | 3000 | 1800 | 320 | 60 | 210 |
| 7 | 合体总监 | 6000 | 2100 | 320 | 60 | 280 |
| 8 | 大乘总监 | 12000 | 2400 | 320 | 60 | 360 |
| 9 | 渡劫副总 | 24000 | 2700 | 320 | 60 | 480 |
| 10 | 飞升董事 | 50000 | — | 320 | 60 | 600 |

Rates come from `career.json`, `kpi.json`, `idle.json`, and `worker.json`. Offline salary uses the same per-hour table and is capped at 8 hours.
