# -*- coding: utf-8 -*-
"""生成 Gameplay V2 物品配置（§49~§68）：materials / techniques / equipment / recipes / shop。

- 材料 >= 25
- 功法 >= 30（至少一半带 trigger/condition/special）
- 装备 >= 30（3 槽：DESK/BADGE/ACCESSORY）
- 配方 >= 30（材料驱动，丹药/功法/法宝/材料 四类）
- 消耗品 >= 8
- 商店商品 >= 12（每日刷新）
"""
import json
import io

# ── 材料（§61/§62） ──────────────────────────────────────────────────────────
materials = [
    # id, name, rarity, source, description
    ('mat_lingcao', '灵草', 'COMMON', ['task', 'shop'], '茶水间绿植区"借"来的叶子，据说泡水喝提神。'),
    ('mat_page', '功法残页', 'COMMON', ['task', 'event', 'craft'], '打印单面的废纸背面，写着似是而非的口诀。'),
    ('mat_coffee_residue', '咖啡残渣', 'COMMON', ['task', 'event'], '咖啡渣。老油条说可以除甲醛，你选择相信。'),
    ('mat_code_fragment', '代码残片', 'COMMON', ['task', 'event'], '从祖传模块剥落的碎片，每一片都带着怨念。'),
    ('mat_legacy_code', '祖传代码', 'RARE', ['event'], '三年前的结晶。接触时请佩戴防护装备。'),
    ('mat_stone_fragment', '灵石碎片', 'COMMON', ['task', 'shop'], '碎灵石。攒够一千个可以……换个好看的屏保。'),
    ('mat_ppt_fragment', 'PPT残页', 'COMMON', ['task', 'event'], '被老板毙掉的那几页。颜色越艳，死得越快。'),
    ('mat_boss_pie', '老板画的大饼', 'RARE', ['event'], '实体化的饼。闻着香，咬不动。'),
    ('mat_bug_crystal', 'Bug结晶', 'RARE', ['task', 'event'], 'bug 被修复的瞬间凝结而成。越隐蔽的 bug 结晶越纯。'),
    ('mat_fishing_tip', '摸鱼心得', 'COMMON', ['event'], '前任摸鱼达人留下的笔记，第一页写着"手要稳"。'),
    ('mat_requirement_fragment', '需求碎片', 'COMMON', ['task', 'event'], '每次改版碎掉一片。理论上可以拼出完整需求，实际上不可能。'),
    ('mat_test_report', '测试报告', 'COMMON', ['task'], '满页的红色。测试小哥的愤怒结晶。'),
    ('mat_meeting_notes', '会议纪要', 'COMMON', ['task'], '"会议结论：下次继续讨论。"历史的循环。'),
    ('mat_badge_fragment', '工牌碎片', 'COMMON', ['event'], '工牌磨损的碎片。带着三年工龄的包浆。'),
    ('mat_keycap', '键帽', 'COMMON', ['task', 'shop'], '从机械键盘上退休的键帽。F 键最容易先走。'),
    ('mat_cable', '网线残片', 'COMMON', ['task'], 'IT 换下的网线。据说水晶头还能用。'),
    ('mat_server_dust', '服务器灰尘', 'COMMON', ['event'], '机房深处的陈年积灰。摸一把，感受算力的重量。'),
    ('mat_print_paper', '打印纸', 'COMMON', ['shop', 'task'], 'A4纸。公司最接近"仙气"的东西。'),
    ('mat_coffee_bean', '咖啡豆', 'COMMON', ['shop', 'event'], '精品咖啡豆。研磨时香气就是结界。'),
    ('mat_spirit_energy', '仙气', 'RARE', ['event', 'secret'], '厕所秘境特产。装在瓶子里也不肯散。'),
    ('mat_996_talisman', '加班符', 'RARE', ['event'], '加班到凌晨的人结成的符。微微发烫。'),
    ('mat_touchstone', '试金石', 'EPIC', ['secret'], '老油条留下的石头。据说贴在额头上能测出会议的真假。'),
    ('mat_dao_ink', '道心墨', 'RARE', ['craft'], '用平静心境研出的墨。写字自带说服力。'),
    ('mat_time_sand', '时之沙', 'EPIC', ['secret'], '从午休沙漏里漏出的沙。握得越紧，流得越快。'),
    ('mat_keyword', '关键词', 'RARE', ['event'], '从海量需求里提炼出的一个词。它决定整个版本的命运。'),
    ('mat_mental_shard', '心魔碎片', 'RARE', ['event'], '心魔被击败后的残渣。可以炼药，也可以反噬。'),
    ('mat_nostalgia', '旧时光', 'EPIC', ['secret'], '装在旧工牌套里的一段回忆。打开时会闻到夏天的味道。'),
]
mat_list = [
    {'id': i, 'name': n, 'rarity': r, 'sources': s, 'description': d}
    for (i, n, r, s, d) in materials
]

# ── 功法（§49~§54） ─────────────────────────────────────────────────────────
# kind: main/either（可主可辅）
techniques = [
    # 必做 20（§52）
    ('tech_paid_fish', '带薪摸鱼诀', 'RARE', 'either', '摸鱼时修为+30%，老板查岗事件风险-10%。', {'mode': 'FISHING', 'cultivationMul': 1.3, 'bossEventWeight': 0.9}),
    ('tech_996_burn', '996燃血大法', 'RARE', 'main', 'WORK绩效+40%，每小时心魔+2。燃的是血，换的是钱。', {'mode': 'WORK', 'performanceMul': 1.4, 'innerDemonPerHour': 2}),
    ('tech_blame', '甩锅神功', 'RARE', 'either', '负面事件50%概率减半（成功把话题引向历史决策）。', {'eventDamageMul': 0.5, 'trigger': 'onNegativeEvent', 'chance': 0.5}),
    ('tech_toilet_seclusion', '厕所闭关术', 'COMMON', 'either', '每次使用厕所秘境额外+10修为。', {'trigger': 'onToiletEvent', 'cultivationBonus': 10}),
    ('tech_freeze_spell', '需求冻结咒', 'RARE', 'either', 'PRODUCT类事件权重-30%。念动真言，需求退散。', {'eventWeight': {'PRODUCT': 0.7}}),
    ('tech_copy_paste', '复制粘贴心经', 'COMMON', 'either', 'WORK绩效+10%。"编程的本质"——你的第3个师父说。', {'mode': 'WORK', 'performanceMul': 1.1}),
    ('tech_daily_report', '日报炼气诀', 'COMMON', 'either', '写日报类事件奖励翻倍。', {'trigger': 'onDailyReportEvent', 'rewardMul': 2}),
    ('tech_weekly_loop', '周报轮回功', 'COMMON', 'either', '周五绩效+20%。轮回之日，功力大涨。', {'trigger': 'onFriday', 'performanceMul': 1.2}),
    ('tech_meeting_zen', '会议入定法', 'COMMON', 'either', '会议事件道心损耗-50%。肉身在场，神游天外。', {'trigger': 'onMeetingEvent', 'mindLossMul': 0.5}),
    ('tech_bug_body', 'Bug炼体术', 'RARE', 'either', '每修一个bug+5修为。以bug为食，以报错为汤。', {'trigger': 'onBugFixed', 'cultivationBonus': 5}),
    ('tech_coffee_life', '咖啡续命经', 'COMMON', 'either', '道心低于30时，每小时道心+2。咖啡因护体。', {'trigger': 'onLowMind', 'mindPerHour': 2}),
    ('tech_boss_pie_true', '老板画饼真经', 'RARE', 'either', 'BOSS类事件奖励+30%，但道心损耗+10%。饼吃多了会噎着。', {'eventRewardMul': {'BOSS': 1.3}, 'eventMindLossMul': {'BOSS': 1.1}}),
    ('tech_kbd_sword', '键盘御剑术', 'COMMON', 'either', 'WORK工资+10%。十指翻飞，人键合一。', {'mode': 'WORK', 'salaryMul': 1.1}),
    ('tech_paid_seclusion', '带薪闭关诀', 'EPIC', 'main', 'CULTIVATING时工资惩罚减半（×0.65）。最高级的摸鱼是修炼。', {'mode': 'CULTIVATING', 'salaryPenaltyReduction': 0.5}),
    ('tech_resign_ascend', '离职飞升经', 'LEGENDARY', 'main', '心魔越高，修为+10%~+50%。破而后立，离开是为了飞升。', {'trigger': 'onHighDemon', 'cultivationBonusPerDemon': 0.5}),
    ('tech_test_shield', '测试护体功', 'COMMON', 'either', 'BUG类事件负面概率-20%。测试小哥是你的护法。', {'eventWeight': {'BUG': 0.8}}),
    ('tech_prod_mindread', '产品读心术', 'RARE', 'either', 'PRODUCT事件50%概率预知结果（显示隐藏选项）。', {'trigger': 'onProductEvent', 'revealHidden': 0.5}),
    ('tech_requirement_escape', '需求遁术', 'RARE', 'either', '急需求事件50%概率直接跳过。三十六计，走为上。', {'trigger': 'onUrgentRequirement', 'skipChance': 0.5}),
    ('tech_desk_array', '工位聚灵诀', 'COMMON', 'either', 'CULTIVATING修为+15%。聚灵阵心法：绿萝为阵眼。', {'mode': 'CULTIVATING', 'cultivationMul': 1.15}),
    ('tech_fish_conceal', '摸鱼敛息术', 'COMMON', 'either', 'FISHING时老板事件权重-20%。敛息屏气，人鱼合一。', {'mode': 'FISHING', 'bossEventWeight': 0.8}),
    # 自行扩展 10
    ('tech_slack_dao', '划水大道', 'COMMON', 'either', 'SOCIAL关系收益+30%。水至清则无鱼，人至察则无徒。', {'mode': 'SOCIAL', 'relationshipMul': 1.3}),
    ('tech_morning_breath', '晨会吐纳术', 'COMMON', 'either', '站会事件道心损耗减半。站着也是站，呼吸也是练。', {'trigger': 'onStandupEvent', 'mindLossMul': 0.5}),
    ('tech_excel_array', '表格困灵阵', 'COMMON', 'either', '取数类事件绩效+50%。Excel在手，天下我有。', {'trigger': 'onDataEvent', 'performanceMul': 1.5}),
    ('tech_nap_heart', '午睡养神功', 'COMMON', 'either', '午休期间道心恢复+100%。趴下的瞬间，天地安静。', {'trigger': 'onLunch', 'mindRecoveryMul': 2}),
    ('tech_overtime_lotus', '加班火莲', 'RARE', 'main', '连续加班3天后，绩效+30%持续一天，之后心魔+10。火莲开时， also 业火起。', {'trigger': 'onOvertimeStreak', 'performanceBurst': 1.3, 'innerDemonCost': 10}),
    ('tech_email_flying', '飞剑传书', 'COMMON', 'either', '邮件类事件道心损耗-30%。抄送即护身符。', {'trigger': 'onEmailEvent', 'mindLossMul': 0.7}),
    ('tech_poker_face', '扑克脸功', 'RARE', 'either', '被表扬时绩效+50%，被批评时道心损耗-40%。喜怒不形于色。', {'trigger': 'onBossJudgement', 'praisePerfMul': 1.5, 'blameMindMul': 0.6}),
    ('tech_water_cooler_flow', '饮水机听风术', 'COMMON', 'either', '八卦事件获得双倍情报材料。风从水起来。', {'trigger': 'onGossipEvent', 'materialMul': 2}),
    ('tech_old_code_shield', '祖传代码护法', 'RARE', 'either', '祖传模块事件负面-25%。你不动它，它不动你。', {'trigger': 'onLegacyEvent', 'negativeMul': 0.75}),
    ('tech_startup_heart', '创业不灭心', 'EPIC', 'main', '道心低于20时修为+30%。燃尽之处，皆是道场。', {'trigger': 'onCriticalMind', 'cultivationMul': 1.3}),
]
tech_list = []
for (i, n, r, slot, d, m) in techniques:
    tech_list.append({
        'id': i, 'name': n, 'rarity': r, 'slot': slot, 'description': d,
        'maxLevel': 3, 'level': 1,
        'upgradeCost': {'mat_page': 3 * (1 if r == 'COMMON' else 2), 'mat_dao_ink': 1 if r in ('RARE', 'EPIC', 'LEGENDARY') else 0},
        'level3Bonus': '质变：效果翻倍，且冷却减半。',
        'modifiers': m,
    })

# ── 装备（§56~§60） ─────────────────────────────────────────────────────────
equipment = [
    # 必做 20（§59）
    ('eq_mech_keyboard', '上古机械键盘', 'EPIC', 'DESK', '青轴，声音能传两层楼。WORK绩效+15%，同事关系-5%。', {'performanceMul': 1.15, 'relationship': {'JUNIOR': -5}}),
    ('eq_chosen_badge', '天选工牌', 'LEGENDARY', 'BADGE', '从未消磁、从未忘带。BOSS事件奖励+20%。', {'eventRewardMul': {'BOSS': 1.2}}),
    ('eq_anc_noise', '降噪耳机', 'RARE', 'ACCESSORY', '戴上它，世界只剩你和需求。道心恢复+15%。', {'mindRecoveryMul': 1.15}),
    ('eq_coffee_cup', '续命咖啡杯', 'RARE', 'DESK', '永远恒温。每小时道心+1。', {'mindPerHour': 1}),
    ('eq_old_usb', '祖传U盘', 'RARE', 'BADGE', '里面有什么没人知道。事件材料掉落+10%。', {'materialMul': 1.1}),
    ('eq_boss_mug', '老板同款保温杯', 'COMMON', 'DESK', 'BOSS事件道心损耗-15%。某种意义上的护身符。', {'eventMindLossMul': {'BOSS': 0.85}}),
    ('eq_chair', '人体工学椅', 'RARE', 'DESK', '腰不酸了。每小时道心+0.5。', {'mindPerHour': 0.5}),
    ('eq_fish_monitor', '摸鱼副屏', 'RARE', 'DESK', '主屏代码，副屏股票。FISHING修为+20%。', {'mode': 'FISHING', 'cultivationMul': 1.2}),
    ('eq_privacy_filter', '防窥屏', 'COMMON', 'DESK', '只有正脸能看清。摸鱼被老板发现的概率-50%。', {'fishingRiskMul': 0.5}),
    ('eq_gaming_mouse', '电竞鼠标', 'COMMON', 'DESK', 'WORK绩效+8%。16000DPI的手感。', {'performanceMul': 1.08}),
    ('eq_vpn_token', '公司VPN令牌', 'COMMON', 'BADGE', '居家也能"在岗"。离线收益+10%。', {'offlineMul': 1.1}),
    ('eq_legacy_doc', '祖传需求文档', 'RARE', 'BADGE', '传说中的原始需求。PRODUCT事件奖励+25%。', {'eventRewardMul': {'PRODUCT': 1.25}}),
    ('eq_cactus', '仙人掌盆栽', 'COMMON', 'DESK', '不用浇水，陪你加班。每小时心魔-0.3。', {'innerDemonPerHour': -0.3}),
    ('eq_test_amulet', '测试护身符', 'COMMON', 'ACCESSORY', '测试小哥亲手所画。BUG事件权重-15%。', {'eventWeight': {'BUG': 0.85}}),
    ('eq_proto_diagram', '产品原型图', 'COMMON', 'DESK', '签名版。PRODUCT事件道心损耗-20%。', {'eventMindLossMul': {'PRODUCT': 0.8}}),
    ('eq_lumbar_pillow', '工位靠枕', 'COMMON', 'DESK', '每小时道心+0.3。工位的温柔。', {'mindPerHour': 0.3}),
    ('eq_dual_monitor', '双屏显示器', 'RARE', 'DESK', 'WORK绩效+12%，CULTIVATING修为+8%。一屏代码一屏经文。', {'performanceMul': 1.12, 'cultivationMul': 1.08}),
    ('eq_company_mug', '公司纪念水杯', 'COMMON', 'ACCESSORY', '十周年纪念款。道心恢复+8%。', {'mindRecoveryMul': 1.08}),
    ('eq_red_badge', '红色工牌', 'EPIC', 'BADGE', '传说中的特殊权限。所有事件奖励+10%。', {'eventRewardMulAll': 1.1}),
    ('eq_old_thinkpad', '老旧ThinkPad', 'EPIC', 'DESK', '开机要三分钟，但从不出错。所有事件道心损耗-10%。', {'eventMindLossMulAll': 0.9}),
    # 扩展 10
    ('eq_wrist_guard', '腱鞘护腕', 'COMMON', 'ACCESSORY', '每小时道心+0.2。手腕是程序员的命根。', {'mindPerHour': 0.2}),
    ('eq_lunch_box', '妈妈牌饭盒', 'RARE', 'ACCESSORY', '自带午饭，每天省25块，吃出家的味道。每小时道心+0.8。', {'mindPerHour': 0.8}),
    ('eq_footrest', '工学脚踏', 'COMMON', 'DESK', '每小时道心+0.3。脚踏实地的具象化。', {'mindPerHour': 0.3}),
    ('eq_blue_light_glasses', '防蓝光眼镜', 'COMMON', 'ACCESSORY', 'CULTIVATING修为+10%。眼前的世界泛着黄，心却静了。', {'mode': 'CULTIVATING', 'cultivationMul': 1.1}),
    ('eq_hotel_pillow', '会议靠垫', 'COMMON', 'ACCESSORY', '会议事件道心损耗-25%。会议是身体与灵魂的分居。', {'eventMindLossMul': {'MEETING': 0.75}}),
    ('eq_stand_desk', '升降桌', 'RARE', 'DESK', '站坐交替，每小时道心+1。', {'mindPerHour': 1}),
    ('eq_spare_cable', '备用网线', 'COMMON', 'BADGE', '网络故障时你就是救世主。NPC事件关系收益+10%。', {'relationshipMul': 1.1}),
    ('eq_signed_boss_book', '老板签名书', 'RARE', 'BADGE', '《指数型组织》，扉页有签名。BOSS事件关系收益+20%。', {'relationshipMul': 1.2}),
    ('eq_balcony_plant', '阳台多肉', 'COMMON', 'DESK', '每小时心魔-0.2。多肉不需要希望也能活。', {'innerDemonPerHour': -0.2}),
    ('eq_dark_hoodie', '神秘连帽衫', 'EPIC', 'ACCESSORY', '穿上它，你就不是员工，是黑客。SECRET事件权重+30%。', {'eventWeight': {'SECRET': 1.3}}),
]
eq_list = []
for (i, n, r, slot, d, m) in equipment:
    eq_list.append({'id': i, 'name': n, 'rarity': r, 'slot': slot, 'description': d, 'modifiers': m})

# ── 配方（§64~§67）——材料驱动 + 少量工资辅助费 ─────────────────────────────
def recipe(id, cat, name, ing, out, desc, salary=0, tech=None):
    r = {'id': id, 'category': cat, 'name': name, 'ingredients': ing, 'output': out, 'description': desc}
    if salary: r['salaryCost'] = salary
    if tech: r['requiredTechnique'] = tech
    return r

recipes = [
    # 丹药（10）
    recipe('rp_coffee_life', '丹药', '续命咖啡', {'mat_coffee_bean': 2, 'mat_coffee_residue': 1}, {'consumable': 'cons_coffee'}, 'mind+20。下午三点的救赎。'),
    recipe('rp_qiqi_pill', '丹药', '聚气丹', {'mat_lingcao': 2, 'mat_spirit_energy': 1}, {'consumable': 'cons_qiqi'}, '获得600s修为×1.5 buff。入门丹药，聚气三分钟。'),
    recipe('rp_clear_heart', '丹药', '清心丹', {'mat_lingcao': 3, 'mat_dao_ink': 1}, {'consumable': 'cons_clear'}, 'innerDemon-10。心如明镜，尘埃自去。'),
    recipe('rp_fish_talisman', '丹药', '摸鱼符', {'mat_fishing_tip': 2, 'mat_print_paper': 2}, {'consumable': 'cons_fish_charm'}, '下一次老板查岗自动免疫。护身符级别。'),
    recipe('rp_overtime_pill', '丹药', '加班丹', {'mat_996_talisman': 1, 'mat_coffee_bean': 3}, {'consumable': 'cons_overtime'}, 'WORK效率×1.5持续2h，心魔+5。以魔入道。'),
    recipe('rp_heal_pill', '丹药', '回春丹', {'mat_lingcao': 2, 'mat_meeting_notes': 1}, {'consumable': 'cons_heal'}, 'mind+35。会议后的自我修复。'),
    recipe('rp_pure_pill', '丹药', '静神丹', {'mat_mental_shard': 1, 'mat_dao_ink': 1}, {'consumable': 'cons_pure'}, 'innerDemon-20。心魔碎片反炼为药。', tech=None),
    recipe('rp_spirit_pill', '丹药', '凝神丹', {'mat_spirit_energy': 2, 'mat_time_sand': 1}, {'consumable': 'cons_spirit'}, '900s修为×2.0。顿悟的滋味。'),
    recipe('rp_stone_pill', '丹药', '碎灵丹', {'mat_stone_fragment': 5}, {'consumable': 'cons_stone_pill'}, 'salary+50。灵石碎末压制而成，能吃出钱的口感。'),
    recipe('rp_baoji_pill', '丹药', '爆击丹', {'mat_bug_crystal': 2, 'mat_coffee_bean': 2}, {'consumable': 'cons_baoji'}, '1200s绩效×1.5。以bug之毒攻绩效之木。'),
    # 功法残页（8）
    recipe('rp_page_common', '功法', '普通功法残页', {'mat_page': 3}, {'technique': 'random_common'}, '随机普通功法。量大管饱。'),
    recipe('rp_page_rare', '功法', '稀有功法残页', {'mat_page': 5, 'mat_dao_ink': 1}, {'technique': 'random_rare'}, '随机稀有功法。', salary=100),
    recipe('rp_page_fish', '功法', '带薪摸鱼诀残卷', {'mat_page': 4, 'mat_fishing_tip': 3}, {'technique': 'tech_paid_fish'}, '摸鱼修仙流核心功法。'),
    recipe('rp_page_996', '功法', '996燃血大法残卷', {'mat_page': 4, 'mat_996_talisman': 2}, {'technique': 'tech_996_burn'}, '卷王必修。副作用自负。'),
    recipe('rp_page_blame', '功法', '甩锅神功残卷', {'mat_page': 4, 'mat_meeting_notes': 3}, {'technique': 'tech_blame'}, '老油条一脉的看家本领。'),
    recipe('rp_page_burn', '功法', '996燃血·天卷', {'mat_page': 8, 'mat_bug_crystal': 3, 'mat_996_talisman': 3}, {'technique': 'tech_overtime_lotus'}, '燃血大法进阶。心魔警告。', salary=300),
    recipe('rp_page_read', '功法', '产品读心术残卷', {'mat_page': 4, 'mat_requirement_fragment': 4}, {'technique': 'tech_prod_mindread'}, '读懂需求的瞬间，你流泪了。'),
    recipe('rp_page_ascend', '功法', '离职飞升经残卷', {'mat_page': 6, 'mat_nostalgia': 1, 'mat_mental_shard': 2}, {'technique': 'tech_resign_ascend'}, '传说中的禁术。', salary=500),
    # 法宝（8）
    recipe('rp_eq_amulet', '法宝', '测试护身符', {'mat_test_report': 2, 'mat_print_paper': 2, 'mat_dao_ink': 1}, {'equipment': 'eq_test_amulet'}, '测试小哥看了都说灵。'),
    recipe('rp_eq_pillow', '法宝', '工位靠枕', {'mat_print_paper': 3, 'mat_meeting_notes': 2}, {'equipment': 'eq_lumbar_pillow'}, '用废弃纪要填充，蓬松且讽刺。'),
    recipe('rp_eq_cup', '法宝', '续命咖啡杯', {'mat_coffee_residue': 4, 'mat_stone_fragment': 3}, {'equipment': 'eq_coffee_cup'}, '咖啡渣淬火，恒温符文。', salary=150),
    recipe('rp_eq_cactus', '法宝', '仙人掌盆栽', {'mat_lingcao': 3, 'mat_stone_fragment': 2}, {'equipment': 'eq_cactus'}, '以灵草养仙人掌。'),
    recipe('rp_eq_filter', '法宝', '防窥屏', {'mat_print_paper': 2, 'mat_badge_fragment': 2, 'mat_dao_ink': 1}, {'equipment': 'eq_privacy_filter'}, '纸糊的偏振膜（并不是）。'),
    recipe('rp_eq_wrist', '法宝', '腱鞘护腕', {'mat_cable': 2, 'mat_print_paper': 2}, {'equipment': 'eq_wrist_guard'}, '网线编织，意外地结实。'),
    recipe('rp_eq_lunch', '法宝', '妈妈牌饭盒', {'mat_lingcao': 2, 'mat_time_sand': 1}, {'equipment': 'eq_lunch_box'}, '时之沙保温，家的味道永不过期。'),
    recipe('rp_eq_hoodie', '法宝', '神秘连帽衫', {'mat_server_dust': 3, 'mat_996_talisman': 2, 'mat_badge_fragment': 2}, {'equipment': 'eq_dark_hoodie'}, '机房灰尘染就。穿上后敲代码自带BGM。', salary=400),
    # 材料（6）
    recipe('rp_mat_ink', '材料', '道心墨', {'mat_meeting_notes': 3, 'mat_coffee_residue': 2}, {'material': {'mat_dao_ink': 1}}, '以会议之烦躁，研道心之墨。'),
    recipe('rp_mat_stone', '材料', '灵石碎片提纯', {'mat_stone_fragment': 4}, {'material': {'mat_stone_fragment': 6}}, '无损提纯（并非）。'),
    recipe('rp_mat_energy', '材料', '仙气收集', {'mat_lingcao': 2, 'mat_coffee_residue': 2, 'mat_server_dust': 1}, {'material': {'mat_spirit_energy': 1}}, '三者相混，静置片刻，仙气自来。'),
    recipe('rp_mat_keyword', '材料', '关键词提炼', {'mat_requirement_fragment': 5, 'mat_dao_ink': 1}, {'material': {'mat_keyword': 1}}, '五份碎片提一个词，这就是产品经理的工作。'),
    recipe('rp_mat_shard', '材料', '心魔碎片凝练', {'mat_mental_shard': 3}, {'material': {'mat_mental_shard': 4}}, '碎片也能再碎。'),
]
recipes.append(recipe('rp_mat_996', '材料', '加班符临摹', {'mat_print_paper': 3, 'mat_coffee_residue': 3}, {'material': {'mat_996_talisman': 1}}, '照着前人的符，描一遍。像，但不全像。'))

# ── 消耗品 ──────────────────────────────────────────────────────────────────
consumables = [
    {'id': 'cons_coffee', 'name': '续命咖啡', 'effect': {'mind': 20}, 'description': 'mind+20。凉了也先喝为敬。'},
    {'id': 'cons_qiqi', 'name': '聚气丹', 'effect': {'buff': 'WORK_CULTIVATION_BOOST:1.5:600'}, 'description': '600s修为×1.5。'},
    {'id': 'cons_clear', 'name': '清心丹', 'effect': {'innerDemon': -10}, 'description': 'innerDemon-10。'},
    {'id': 'cons_fish_charm', 'name': '摸鱼符', 'effect': {'flag': 'fish_charm_active'}, 'description': '下一次老板查岗免疫。'},
    {'id': 'cons_overtime', 'name': '加班丹', 'effect': {'buff': 'WORK_SALARY_BOOST:1.5:7200', 'innerDemon': 5}, 'description': '2h工作×1.5，心魔+5。'},
    {'id': 'cons_heal', 'name': '回春丹', 'effect': {'mind': 35}, 'description': 'mind+35。'},
    {'id': 'cons_pure', 'name': '静神丹', 'effect': {'innerDemon': -20}, 'description': 'innerDemon-20。'},
    {'id': 'cons_spirit', 'name': '凝神丹', 'effect': {'buff': 'WORK_CULTIVATION_BOOST:2.0:900'}, 'description': '900s修为×2.0。'},
    {'id': 'cons_stone_pill', 'name': '碎灵丹', 'effect': {'salary': 50}, 'description': 'salary+50。'},
    {'id': 'cons_baoji', 'name': '爆击丹', 'effect': {'buff': 'KPI_PROGRESS_BOOST:1.5:1200'}, 'description': '1200s绩效×1.5。'},
]

# ── 商店（§99/§100） ────────────────────────────────────────────────────────
shop = {
    'refreshPerDay': 6,
    'stock': [
        {'itemId': 'mat_lingcao', 'price': 20, 'stock': 3},
        {'itemId': 'mat_coffee_bean', 'price': 15, 'stock': 4},
        {'itemId': 'mat_print_paper', 'price': 10, 'stock': 5},
        {'itemId': 'mat_stone_fragment', 'price': 8, 'stock': 6},
        {'itemId': 'mat_page', 'price': 25, 'stock': 3},
        {'itemId': 'mat_meeting_notes', 'price': 12, 'stock': 3},
        {'itemId': 'cons_coffee', 'price': 30, 'stock': 3},
        {'itemId': 'cons_heal', 'price': 60, 'stock': 2},
        {'itemId': 'cons_clear', 'price': 80, 'stock': 1},
        {'itemId': 'eq_lumbar_pillow', 'price': 200, 'stock': 1},
        {'itemId': 'eq_wrist_guard', 'price': 150, 'stock': 1},
        {'itemId': 'eq_test_amulet', 'price': 180, 'stock': 1},
    ],
    'rarePool': ['eq_coffee_cup', 'eq_fish_monitor', 'eq_dual_monitor', 'cons_spirit'],
    'blackMarketPool': ['eq_red_badge', 'tech_resign_ascend', 'eq_dark_hoodie', 'mat_touchstone', 'mat_time_sand', 'mat_nostalgia'],
}

out = {'materials': mat_list, 'techniques': tech_list, 'equipment': eq_list, 'recipes': recipes,
       'consumables': consumables, 'shop': shop}
io.open('assets/configs/v2/items.json', 'w', encoding='utf-8', newline='\n').write(
    json.dumps(out, ensure_ascii=False, indent=1) + '\n')

ids = [m['id'] for m in mat_list] + [t['id'] for t in tech_list] + [e['id'] for e in eq_list] + [r['id'] for r in recipes] + [c['id'] for c in consumables]
from collections import Counter
dup = [k for k, v in Counter(ids).items() if v > 1]
assert not dup, f'duplicate ids: {dup}'
# recipe ingredient check
mat_ids = {m['id'] for m in mat_list} | {c['id'] for c in consumables}
for r in recipes:
    for ing in r['ingredients']:
        assert ing in mat_ids, f'{r["id"]}: missing ingredient {ing}'
print(f"materials: {len(mat_list)}, techniques: {len(tech_list)}, equipment: {len(eq_list)}, recipes: {len(recipes)}, consumables: {len(consumables)}")
