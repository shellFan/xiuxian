# -*- coding: utf-8 -*-
"""Gameplay V2：晋升答辩题库（§79/§80）+ 今日称号（§94）+ 晋升职级答辩权重配置。"""
import json, io

# ── 晋升答辩题库 30 题（3 题/次随机） ──
# type: BLAME（甩锅向）/ VALUE（价值向）/ CRISIS（危机向）/ DIPLO（人情向）
# 每题 3 个选项，选项有 tag 供不同 Build/NPC 加成
questions = [
    {"id": "q_delay_1", "type": "CRISIS", "question": "项目为什么延期？", "options": [
        {"id": "A", "text": "需求变更太频繁，我们缺乏变更管理", "tags": {"blameProduct": True}},
        {"id": "B", "text": "我对工期估计过于乐观，下次会留缓冲", "tags": {"ownIt": True}},
        {"id": "C", "text": "有同事的模块交付晚了，影响了联调", "tags": {"blameOther": True}}]},
    {"id": "q_incident_1", "type": "CRISIS", "question": "线上事故谁负责？", "options": [
        {"id": "A", "text": "我是发布人，我来复盘和改进", "tags": {"ownIt": True}},
        {"id": "B", "text": "配置变更没走评审，流程有漏洞", "tags": {"blameProcess": True}},
        {"id": "C", "text": "祖传代码没有文档，谁来都一样", "tags": {"blameLegacy": True}}]},
    {"id": "q_value_1", "type": "VALUE", "question": "你对团队的价值是什么？", "options": [
        {"id": "A", "text": "我修的bug最多，是团队的稳压器", "tags": {"bugFlow": True}},
        {"id": "B", "text": "我把摸鱼时间变成了自我修炼时间", "tags": {"fishFlow": True}},
        {"id": "C", "text": "同事都愿意找我帮忙，我是团队的粘合剂", "tags": {"socialFlow": True}}]},
    {"id": "q_why_promote", "type": "VALUE", "question": "为什么应该晋升你？", "options": [
        {"id": "A", "text": "我的产出数据在这里，请看证据", "tags": {"dataDriven": True}},
        {"id": "B", "text": "我能在混乱中建立秩序", "tags": {"ownIt": True}},
        {"id": "C", "text": "老板您之前的指点让我成长很快", "tags": {"flatterBoss": True}}]},
    {"id": "q_resource", "type": "CRISIS", "question": "如果资源不足怎么办？", "options": [
        {"id": "A", "text": "砍范围保质量，和产品对齐优先级", "tags": {"blameProduct": True}},
        {"id": "B", "text": "先上核心链路，其余下个迭代", "tags": {"dataDriven": True}},
        {"id": "C", "text": "想办法拉兄弟组支援，互换资源", "tags": {"socialFlow": True}}]},
    {"id": "q_conflict", "type": "DIPLO", "question": "和测试对需求理解不一致怎么办？", "options": [
        {"id": "A", "text": "拉产品当裁判，文档为准", "tags": {"blameProcess": True}},
        {"id": "B", "text": "私下沟通，先解决人的情绪再解决事", "tags": {"socialFlow": True}},
        {"id": "C", "text": "按测试的来，测试是质量的守门人", "tags": {"flatterTester": True}}]},
    {"id": "q_boss_pie", "type": "DIPLO", "question": "老板又画了一个大饼，你怎么看？", "options": [
        {"id": "A", "text": "饼也是方向，先跟住方向", "tags": {"flatterBoss": True}},
        {"id": "B", "text": "把饼拆成季度里程碑，让它落地", "tags": {"dataDriven": True}},
        {"id": "C", "text": "面带微笑，内心波澜不惊", "tags": {"fishFlow": True}}]},
    {"id": "q_deadline", "type": "CRISIS", "question": "明天就要上线，但还有个P2问题没修，怎么决策？", "options": [
        {"id": "A", "text": "P2不阻塞上线，记录到已知问题清单", "tags": {"dataDriven": True}},
        {"id": "B", "text": "连夜修掉，我不接受带着问题上线", "tags": {"ownIt": True}},
        {"id": "C", "text": "先问老板的风险偏好", "tags": {"flatterBoss": True}}]},
    {"id": "q_legacy", "type": "CRISIS", "question": "接手祖传代码，第一步做什么？", "options": [
        {"id": "A", "text": "先写测试兜底，再动刀", "tags": {"bugFlow": True}},
        {"id": "B", "text": "找老员工考古，搞清设计意图", "tags": {"socialFlow": True}},
        {"id": "C", "text": "能跑就不动，把时间花在新需求上", "tags": {"fishFlow": True}}]},
    {"id": "q_overwork", "type": "DIPLO", "question": "连续加班一个月，状态很差，你会？", "options": [
        {"id": "A", "text": "和老板坦诚沟通，调整节奏", "tags": {"flatterBoss": True}},
        {"id": "B", "text": "自我调节，摸鱼回血", "tags": {"fishFlow": True}},
        {"id": "C", "text": "扛住，绩效季就在眼前", "tags": {"ownIt": True}}]},
    {"id": "q_credit", "type": "DIPLO", "question": "你的方案被同事抢了功劳，你会？", "options": [
        {"id": "A", "text": "邮件里自然地补充上下文，留痕", "tags": {"blameProcess": True}},
        {"id": "B", "text": "算了，功劳会说话", "tags": {"fishFlow": True}},
        {"id": "C", "text": "私下找他聊，团队和气更重要", "tags": {"socialFlow": True}}]},
    {"id": "q_mentor", "type": "VALUE", "question": "你如何帮助新人成长？", "options": [
        {"id": "A", "text": "写了新人入门文档，降低团队 bus factor", "tags": {"dataDriven": True}},
        {"id": "B", "text": "一对一辅导，把我踩的坑都讲给他们", "tags": {"socialFlow": True}},
        {"id": "C", "text": "让他们自己摸爬滚打，成长更快", "tags": {"fishFlow": True}}]},
    {"id": "q_tech_debt", "type": "VALUE", "question": "技术债怎么还？", "options": [
        {"id": "A", "text": "每个迭代固定20%时间还债", "tags": {"dataDriven": True}},
        {"id": "B", "text": "债不是问题，出问题才是问题", "tags": {"fishFlow": True}},
        {"id": "C", "text": "借大版本重构的机会一起还", "tags": {"bugFlow": True}}]},
    {"id": "q_product_change", "type": "DIPLO", "question": "产品第五次改需求，你的反应？", "options": [
        {"id": "A", "text": "推动变更流程，每次变更要评审", "tags": {"blameProcess": True}},
        {"id": "B", "text": "评估影响，让老板拍板", "tags": {"flatterBoss": True}},
        {"id": "C", "text": "改吧，正好练手速", "tags": {"fishFlow": True}}]},
    {"id": "q_team_conflict", "type": "DIPLO", "question": "两个同事吵起来了，你是旁观者，你会？", "options": [
        {"id": "A", "text": "假装没看见，专注自己的屏幕", "tags": {"fishFlow": True}},
        {"id": "B", "text": "递杯水，岔开话题", "tags": {"socialFlow": True}},
        {"id": "C", "text": "帮理清事实，对事不对人", "tags": {"ownIt": True}}]},
    {"id": "q_your_bug", "type": "CRISIS", "question": "你自己写的代码出了P0，情绪上你会？", "options": [
        {"id": "A", "text": "先修再说，情绪等修复完再处理", "tags": {"ownIt": True}},
        {"id": "B", "text": "复盘写清楚，同样的错绝不犯第二次", "tags": {"bugFlow": True}},
        {"id": "C", "text": "谁还没出过事故，重要的是响应速度", "tags": {"socialFlow": True}}]},
    {"id": "q_praise", "type": "VALUE", "question": "老板当众表扬你，你的反应？", "options": [
        {"id": "A", "text": "感谢团队，功劳是大家的", "tags": {"socialFlow": True}},
        {"id": "B", "text": "谢谢老板的指导", "tags": {"flatterBoss": True}},
        {"id": "C", "text": "微微一笑，深藏功与名", "tags": {"fishFlow": True}}]},
    {"id": "q_layoff_env", "type": "DIPLO", "question": "公司传出裁员风声，你会？", "options": [
        {"id": "A", "text": "更新简历，两手准备", "tags": {"fishFlow": True}},
        {"id": "B", "text": "更努力工作，用价值说话", "tags": {"ownIt": True}},
        {"id": "C", "text": "找HR聊聊，获取一手信息", "tags": {"flatterHr": True}}]},
    {"id": "q_salary_talk", "type": "DIPLO", "question": "调薪沟通时，你怎么开价？", "options": [
        {"id": "A", "text": "拿市场数据说话", "tags": {"dataDriven": True}},
        {"id": "B", "text": "强调过去一年的关键交付", "tags": {"ownIt": True}},
        {"id": "C", "text": "表达和公司长期发展的意愿", "tags": {"flatterBoss": True}}]},
    {"id": "q_quality_speed", "type": "VALUE", "question": "质量和速度冲突时你选什么？", "options": [
        {"id": "A", "text": "核心链路质量优先，边缘功能速度优先", "tags": {"dataDriven": True}},
        {"id": "B", "text": "速度就是质量，上线快也是一种质量", "tags": {"ownIt": True}},
        {"id": "C", "text": "质量优先，虽然我很慢", "tags": {"bugFlow": True}}]},
    {"id": "q_meeting_overload", "type": "DIPLO", "question": "一天8个会，你怎么活下来？", "options": [
        {"id": "A", "text": "拒绝不必要的会，邮件解决", "tags": {"blameProcess": True}},
        {"id": "B", "text": "会里摸鱼修炼，物尽其用", "tags": {"fishFlow": True}},
        {"id": "C", "text": "把关键结论同步给不能到会的人", "tags": {"socialFlow": True}}]},
    {"id": "q_learn_new", "type": "VALUE", "question": "怎么学习新技术？", "options": [
        {"id": "A", "text": "用到才学，学以致用", "tags": {"fishFlow": True}},
        {"id": "B", "text": "做side project练手", "tags": {"bugFlow": True}},
        {"id": "C", "text": "在团队里做分享，逼自己输出", "tags": {"socialFlow": True}}]},
    {"id": "q_boss_wrong", "type": "DIPLO", "question": "老板的决策明显有问题，你会？", "options": [
        {"id": "A", "text": "私下单独提，给足面子", "tags": {"flatterBoss": True}},
        {"id": "B", "text": "会上直接说，对事不对人", "tags": {"ownIt": True}},
        {"id": "C", "text": "让数据替我说话", "tags": {"dataDriven": True}}]},
    {"id": "q_mentor_fish", "type": "VALUE", "question": "你摸鱼被发现过吗？", "options": [
        {"id": "A", "text": "我从不摸鱼，我只是深度思考", "tags": {"fishFlow": True}},
        {"id": "B", "text": "被老板抓到过，但我修好了他电脑，扯平了", "tags": {"flatterBoss": True}},
        {"id": "C", "text": "我摸鱼的时间都在帮同事解决问题", "tags": {"socialFlow": True}}]},
    {"id": "q_ambition", "type": "VALUE", "question": "五年后你想成为什么样的人？", "options": [
        {"id": "A", "text": "技术专家，架构师", "tags": {"bugFlow": True}},
        {"id": "B", "text": "管理者，带一支能打的队伍", "tags": {"ownIt": True}},
        {"id": "C", "text": "财务自由，海边修仙", "tags": {"fishFlow": True}}]},
    {"id": "q_thanks", "type": "DIPLO", "question": "最后，你有什么想说的？", "options": [
        {"id": "A", "text": "感谢公司平台和老板的培养", "tags": {"flatterBoss": True}},
        {"id": "B", "text": "感谢一起扛过事故的兄弟们", "tags": {"socialFlow": True}},
        {"id": "C", "text": "感谢祖传代码，让我变成了更好的人", "tags": {"bugFlow": True}}]},
    {"id": "q_stakeholder", "type": "DIPLO", "question": "甲方临时加需求，还请了你们老板吃饭，你会？", "options": [
        {"id": "A", "text": "让老板先吃，吃完再谈排期", "tags": {"flatterBoss": True}},
        {"id": "B", "text": "把加的需求折算成砍掉的需求", "tags": {"dataDriven": True}},
        {"id": "C", "text": "建议先喝好这顿酒再说", "tags": {"socialFlow": True}}]},
    {"id": "q_mentor_junior", "type": "VALUE", "question": "小师妹问你职业建议，你说？", "options": [
        {"id": "A", "text": "先广后深，找到自己的赛道", "tags": {"dataDriven": True}},
        {"id": "B", "text": "别学我，我全是反例", "tags": {"fishFlow": True}},
        {"id": "C", "text": "跟对人比做对事重要", "tags": {"socialFlow": True}}]},
    {"id": "q_996_view", "type": "DIPLO", "question": "你怎么看996？", "options": [
        {"id": "A", "text": "奋斗者的自我选择", "tags": {"ownIt": True}},
        {"id": "B", "text": "修仙讲究个火候，过犹不及", "tags": {"fishFlow": True}},
        {"id": "C", "text": "效率不行才拼时长", "tags": {"dataDriven": True}}]},
    {"id": "q_final_question", "type": "CRISIS", "question": "如果这次没晋升成功，你会？", "options": [
        {"id": "A", "text": "复盘差距，来年再战", "tags": {"ownIt": True}},
        {"id": "B", "text": "把问题归档，看看是不是赛道不对", "tags": {"dataDriven": True}},
        {"id": "C", "text": "回家修炼，心境无损", "tags": {"fishFlow": True}}]},
]

# ── 今日称号 30 个（§94） ──
titles = [
    {"id": "title_fish_master", "name": "带薪摸鱼大师", "condition": "fishing", "threshold": 0.5, "desc": "摸鱼时长占工作日一半以上"},
    {"id": "title_grind_king", "name": "卷王之王", "condition": "work", "threshold": 0.7, "desc": "工作时长占七成以上"},
    {"id": "title_toilet_immortal", "name": "厕所仙人", "condition": "toiletEvent", "threshold": 1, "desc": "今日触发过厕所秘境"},
    {"id": "title_bug_terminator", "name": "Bug终结者", "condition": "bugEvent", "threshold": 2, "desc": "今日处理2个以上Bug事件"},
    {"id": "title_meeting_buddha", "name": "会议活佛", "condition": "meeting", "threshold": 3, "desc": "今日经历3场以上会议"},
    {"id": "title_social_master", "name": "人脉仙尊", "condition": "social", "threshold": 0.3, "desc": "社交划水占三成以上"},
    {"id": "title_ordinary_horse", "name": "平平无奇牛马", "condition": "default", "threshold": 0, "desc": "没有存在感的一天"},
    {"id": "title_boss_eyesore", "name": "老板眼中钉", "condition": "negativeBoss", "threshold": 2, "desc": "今日2次以上Boss负面事件"},
    {"id": "title_broken_heart", "name": "道心破碎者", "condition": "mindLow", "threshold": 15, "desc": "下班时道心低于15"},
    {"id": "title_demon_harbor", "name": "心魔缠身", "condition": "demonHigh", "threshold": 70, "desc": "心魔超过70"},
    {"id": "title_zen_master", "name": "道心通明", "condition": "mindHigh", "threshold": 95, "desc": "下班时道心95以上"},
    {"id": "title_exp_machine", "name": "修为暴涨", "condition": "cultivation", "threshold": 300, "desc": "今日修为+300以上"},
    {"id": "title_salary_rain", "name": "财源滚滚", "condition": "salary", "threshold": 300, "desc": "今日工资+300以上"},
    {"id": "title_perf_star", "name": "绩效之星", "condition": "performance", "threshold": 50, "desc": "今日绩效+50以上"},
    {"id": "title_craft_manic", "name": "炼丹狂人", "condition": "craft", "threshold": 3, "desc": "今日合成3次以上"},
    {"id": "title_material_hoarder", "name": "屯粮大师", "condition": "materials", "threshold": 8, "desc": "今日获得8份以上材料"},
    {"id": "title_event_juggler", "name": "百事通", "condition": "events", "threshold": 6, "desc": "今日处理6个以上事件"},
    {"id": "title_cultivator", "name": "偷偷修炼", "condition": "cultivating", "threshold": 0.4, "desc": "修炼时长占四成以上"},
    {"id": "title_overtime_fighter", "name": "加班战神", "condition": "overtime", "threshold": 1, "desc": "今日触发过深夜加班事件"},
    {"id": "title_lazy_dog", "name": "摆烂真君", "condition": "demonMid", "threshold": 45, "desc": "心魔45以上，工位常驻咸鱼"},
    {"id": "title_npc_favorite", "name": "团宠", "condition": "relationshipUp", "threshold": 10, "desc": "今日NPC关系净增10以上"},
    {"id": "title_npc_punchbag", "name": "职场受气包", "condition": "relationshipDown", "threshold": -10, "desc": "今日NPC关系净减10以上"},
    {"id": "title_chain_breaker", "name": "破局者", "condition": "chainProgress", "threshold": 1, "desc": "今日推进了事件链"},
    {"id": "title_coffee_life", "name": "咖啡因载体", "condition": "coffee", "threshold": 2, "desc": "今日使用2次以上咖啡类道具"},
    {"id": "title_shopaholic", "name": "消费先锋", "condition": "shop", "threshold": 1, "desc": "今日在商店消费过"},
    {"id": "title_promotion_close", "name": "准渡劫者", "condition": "promotionNear", "threshold": 1, "desc": "今日全部KPI达标"},
    {"id": "title_first_day", "name": "初入职场", "condition": "dayOne", "threshold": 0, "desc": "第一个工作日"},
    {"id": "title_friday_night", "name": "周五夜行侠", "condition": "friday", "threshold": 0, "desc": "周五下班时仍在工位"},
    {"id": "title_monday_blues", "name": "周一蓝调", "condition": "monday", "threshold": 0, "desc": "周一，一切重新开始"},
    {"id": "title_secret_finder", "name": "秘境探险家", "condition": "secret", "threshold": 1, "desc": "今日触发过隐藏事件"},
]

out = {"promotionQuestions": questions, "dailyTitles": titles}
io.open('assets/configs/v2/promotion-titles.json', 'w', encoding='utf-8', newline='\n').write(
    json.dumps(out, ensure_ascii=False, indent=1) + '\n')

qids = [q['id'] for q in questions]
tids = [t['id'] for t in titles]
assert len(qids) == len(set(qids))
assert len(tids) == len(set(tids))
assert all(len(q['options']) == 3 for q in questions)
print(f"questions: {len(questions)}, titles: {len(titles)}")
