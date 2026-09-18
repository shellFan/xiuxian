# -*- coding: utf-8 -*-
"""
slice-design-ui.py — 从 docs/img/image5.png 设计图切出可复用 UI 素材。

用法:
  python scripts/slice-design-ui.py            # 切出全部素材到 desktop/assets/ui-slice/
  python scripts/slice-design-ui.py --detect   # 只做卡片边界检测(调试用)

素材清单见 desktop/assets/ui-slice/manifest.json。
文字 UI(标题/按钮/标签)不切进素材，运行时用 DOM 重绘保证清晰度。
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'img', 'image5.png')
OUT_DIR = os.path.join(ROOT, 'desktop', 'assets', 'ui-slice')

# near-white gap detection --------------------------------------------------

def _is_white(px, thr=235):
    r, g, b = px[0], px[1], px[2]
    return r > thr and g > thr and b > thr


def detect_cards(im, white=235, min_gap=4):
    """Find rectangular card regions separated by near-white gutters."""
    w, h = im.size
    rgb = im.convert('RGB')
    px = rgb.load()

    col_white = []
    for x in range(w):
        cnt = sum(1 for y in range(0, h, 4) if _is_white(px[x, y], white))
        col_white.append(cnt / (h / 4))

    row_white = []
    for y in range(h):
        cnt = sum(1 for x in range(0, w, 4) if _is_white(px[x, y], white))
        row_white.append(cnt / (w / 4))

    def spans(profile, thr=0.92):
        runs, start = [], None
        for i, v in enumerate(profile):
            if v >= thr:
                if start is None:
                    start = i
            else:
                if start is not None and i - start >= min_gap:
                    runs.append((start, i))
                start = None
        if start is not None:
            runs.append((start, len(profile)))
        return runs

    col_gaps = spans(col_white)
    row_gaps = spans(row_white)

    def content_ranges(gaps, total):
        ranges, prev = [], 0
        for a, b in gaps:
            if a - prev > 40:
                ranges.append((prev, a))
            prev = b
        if total - prev > 40:
            ranges.append((prev, total))
        return ranges

    cols = content_ranges(col_gaps, w)
    rows = content_ranges(row_gaps, h)
    return cols, rows


# asset crop boxes (calibrated against docs/img/image5.png, 1536x1024) -------

ASSETS = {
    # ── 首页 ──
    'brand-title':      (55, 4, 302, 56),      # 牛马修仙传 书法字 + 印章
    'brand-ribbon':     (56, 50, 250, 88),     # 上班也是渡劫 金色绶带(含字)
    'home-avatar':      (14, 86, 58, 138),     # 范大牛 头像(含边框/LV徽标)
    'home-character':   (8, 222, 307, 362),    # 主界面角色立绘+牛+工位场景
    # ── 晋升渡劫 立绘 ──
    'promo-cur':        (942, 140, 1053, 228),   # 实习牛马 立绘
    'promo-next':       (1096, 140, 1207, 228),  # 正式牛马 立绘
    # ── 宗门建筑 ──
    'sect-minying':     (1250, 96, 1346, 176),   # 民企宗
    'sect-waiqi':       (1250, 196, 1346, 276),  # 外企宗
    'sect-guoqi':       (1250, 296, 1346, 376),  # 国企宗
    'sect-dachang':     (1250, 396, 1346, 476),  # 大厂宗
    # ── 弹窗插画 ──
    'event-boss':       (806, 642, 1064, 766),   # 随机事件 老板插画
    'ad-cow':           (1082, 688, 1262, 828),  # 广告弹窗 奶牛
    # ── 任务图标(圆角方块) ──
    'task-report':      (329, 124, 386, 181),    # 写日报
    'task-bug':         (329, 234, 386, 291),    # 修复线上Bug
    'task-fish':        (329, 344, 386, 401),    # 带薪摸鱼
    'task-meeting':     (329, 454, 386, 511),    # 参加无效会议
    # ── 合成材料/产物图标 ──
    'mat-herb-a':       (644, 138, 684, 182),
    'mat-herb-b':       (688, 138, 728, 182),
    'item-pill-juqi':   (748, 140, 796, 186),    # 聚气丹(产物)
    'mat-crystal-a':    (646, 244, 684, 281),
    'mat-ore-b':        (694, 244, 730, 281),
    'item-stone':       (748, 242, 796, 290),    # 下品灵石(产物)
    'mat-scroll-a':     (644, 335, 684, 379),
    'mat-scroll-b':     (688, 335, 728, 379),
    'item-gongfa-book': (748, 332, 796, 380),    # 初级功法残页(产物)
    'mat-flower-a':     (646, 450, 684, 488),
    'mat-flower-b':     (694, 450, 730, 488),
    'item-pill-huichun':(752, 450, 800, 496),    # 回春丹(产物)
    # ── 好友/排行榜 头像 ──
    'face-zhangsan':    (289, 691, 333, 743),    # 修仙的张三
    'face-xiaoshimei':  (289, 748, 333, 800),    # 摸鱼小师妹
    'face-tutou':       (289, 805, 333, 857),    # 产品秃头
    'face-ceshi':       (289, 866, 333, 918),    # 测试小哥
    # ── 成就图标(圆形) ──
    'ach-first-task':   (556, 691, 604, 741),    # 初入职场
    'ach-fish':         (556, 753, 604, 803),    # 摸鱼达人
    'ach-overtime':     (556, 815, 604, 865),    # 加班战士
    'ach-promo':        (556, 876, 604, 926),    # 渡劫新星
    # ── 底部导航图标(22px) ──
    'nav-home-active':  (23, 540, 54, 570),
    'nav-tasks':        (83, 540, 114, 570),
    'nav-craft':        (143, 540, 174, 570),
    'nav-promo':        (203, 540, 234, 570),
    'nav-more':         (254, 542, 283, 566),
    'nav-tasks-active': (387, 540, 418, 570),
    'nav-craft-active': (1059, 540, 1090, 570),
}


def main():
    im = Image.open(SRC).convert('RGB')
    print('image size:', im.size)

    if '--detect' in sys.argv:
        cols, rows = detect_cards(im)
        print('content column ranges:', cols)
        print('content row ranges:', rows)
        return

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {'source': 'docs/img/image5.png', 'imageSize': list(im.size), 'assets': []}
    for name, box in ASSETS.items():
        crop = im.crop(box)
        path = os.path.join(OUT_DIR, name + '.png')
        crop.save(path)
        manifest['assets'].append({'name': name, 'file': name + '.png', 'box': list(box),
                                   'size': [crop.width, crop.height]})
        print('saved', name, box, crop.size)
    with open(os.path.join(OUT_DIR, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print('manifest written:', len(ASSETS), 'assets')


if __name__ == '__main__':
    main()
