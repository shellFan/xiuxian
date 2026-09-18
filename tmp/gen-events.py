# -*- coding: utf-8 -*-
"""生成 Gameplay V2 事件配置 events.json（§35-42）。

数量目标：>=100 个事件定义
  - 普通事件 >= 55（现实职场 50% / 修仙荒诞 50%）
  - 稀有事件 >= 20
  - NPC 事件 >= 15（6 个 NPC）
  - 隐藏/彩蛋 >= 10
  - >=40 个带分支（choices 且成功率/多效果）
  - >=10 条事件链（每链 3~6 阶段）

文案风格：黑色幽默、短而有记忆点、无低俗烂梗。
"""
import json
import io

events = []


def ev(
    id, title, description, category, rarity='COMMON', priority='NORMAL',
    weight=10, min_career=None, max_career=None, modes=None, conditions=None,
    cooldown=None, once_per_day=None, once_ever=None, chain=None, stage=None,
    choices=None, effects=None,
):
    d = {'id': id, 'title': title, 'description': description, 'category': category,
         'rarity': rarity, 'priority': priority, 'baseWeight': weight}
    if min_career is not None: d['minCareer'] = min_career
    if max_career is not None: d['maxCareer'] = max_career
    if modes: d['allowedModes'] = modes
    if conditions: d['conditions'] = conditions
    if cooldown is not None: d['cooldown'] = cooldown
    if once_per_day: d['oncePerDay'] = True
    if once_ever: d['onceEver'] = True
    if chain: d['chainId'] = chain
    if stage is not None: d['chainStage'] = stage
    if choices: d['choices'] = choices
    if effects: d['effects'] = effects
    events.append(d)


def ch(id, text, chance=None, effects=None, success=None, failure=None, req=None,
       result=None, next_event=None, flags=None):
    c = {'id': id, 'text': text}
    if chance is not None: c['successChance'] = chance
    if effects: c['effects'] = effects
    if success: c['successEffects'] = success
    if failure: c['failureEffects'] = failure
    if req: c['requirements'] = req
    if result: c['resultText'] = result
    if next_event: c['nextEvent'] = next_event
    if flags: c['setFlags'] = flags
    return c


# ═══════════════════════════════════════════════════════════════════
# 一、事件链（10 条 × 3~6 阶段 = 38 个事件，链事件多为分支）
# ═══════════════════════════════════════════════════════════════════

# 链1：祖传屎山（4 阶段）
ev('legacy_s0', '祖传屎山·起源', '接手了一个没人敢动的模块。注释最后一行停留在三年前，署名是你已经不认识的工号。', 'CHAIN', 'COMMON', 'IMPORTANT', 8, chain='legacy', stage=0, choices=[
    ch('REFACTOR', '悄悄开始重构', chance=0.6,
       success={'performance': 10, 'mind': -5, 'material': {'code_fragment': 2}, 'setFlags': ['legacy_refactored']},
       failure={'performance': -5, 'mind': -10, 'innerDemon': 5},
       result='重构进行到一半，你发现两个模块之间靠一个魔法数字维持着平衡。'),
    ch('IGNORE', '敬而远之', {'mind': 3, 'setFlags': ['legacy_untouched']},
       result='你在心里给它上了三炷香，转身去改别的需求。'),
])
ev('legacy_s1', '祖传屎山·余震', '上周没人动的那个模块，今天突然在监控里闪了一下。像是在证明自己的存在。', 'CHAIN', 'COMMON', 'IMPORTANT', 0, chain='legacy', stage=1, conditions={'eventFlag': 'legacy_untouched'}, choices=[
    ch('HOTFIX', '连夜打补丁', chance=0.7,
       success={'performance': 8, 'mind': -8, 'material': {'bug_crystal': 1}},
       failure={'performance': -8, 'innerDemon': 8, 'mind': -5},
       result='补丁打上了，你总觉得哪里不对，但监控绿了。'),
    ch('WAIT', '再观察观察', {'mind': -3}, result='它又安静了。你知道这只是暴风雨前的礼貌。'),
])
ev('legacy_s2', '祖传屎山·觉醒', '那个模块开始在生产环境随机返回三年前的数据。用户投诉说看到了已经下架的商品。', 'CHAIN', 'RARE', 'CRITICAL', 0, chain='legacy', stage=2, choices=[
    ch('DIG', '深入屎山找根因', chance=0.5,
       success={'performance': 20, 'cultivation': 30, 'material': {'legacy_code': 1, 'code_fragment': 3}, 'setFlags': ['legacy_purified']},
       failure={'performance': -10, 'mind': -15, 'innerDemon': 10},
       result='你在第 4000 行找到了答案：一个三年前的 if，等一个三年后的条件。'),
    ch('BLAME', '在群里甩锅给架构', chance=0.4,
       success={'mind': 5, 'relationship': {'VETERAN': 5}},
       failure={'relationship': {'BOSS': -8, 'VETERAN': -5}, 'innerDemon': 5},
       result='群里安静了几分钟。架构群把你拉进去又踢了出来。'),
])
ev('legacy_s3', '祖传屎山·飞升', '重写还是续命？整个组的命运压在你一个人身上。', 'CHAIN', 'EPIC', 'CRITICAL', 0, chain='legacy', stage=3, conditions={'eventFlag': 'legacy_purified'}, choices=[
    ch('REWRITE', '推倒重写', chance=0.55,
       success={'performance': 40, 'cultivation': 60, 'mind': 10, 'grantEquipment': 'eq_legacy_thinkpad', 'setFlags': ['legacy_rewritten']},
       failure={'performance': -15, 'mind': -20, 'innerDemon': 15},
       result='新系统上线那一刻，你理解了什么叫不破不立。'),
    ch('WRAP', '包装成微服务', chance=0.65,
       success={'performance': 25, 'salary': 100},
       failure={'performance': -10, 'mind': -10},
       result='PPT 上它已经是微服务架构了。实际上它只是被三个换行符隔开。'),
])

# 链2：线上事故（4 阶段）
ev('incident_s0', '群里突然安静了', '工作群突然没人说话。通常这意味着生产出事了。', 'CHAIN', 'COMMON', 'IMPORTANT', 8, chain='incident', stage=0, choices=[
    ch('CHECK', '主动看监控', {'performance': 5, 'setFlags': ['incident_checked']},
       result='你打开了监控大盘。红色区域像晚霞一样绚烂。'),
    ch('SILENT', '装作没看见', {'mind': -5, 'setFlags': ['incident_ignored']},
       result='你继续改自己的需求，心跳声比键盘声还响。'),
])
ev('incident_s1', '定位到你的机器', '告警定位到了你上周发布的服务。日志里你的 commit 像遗书一样安静。', 'CHAIN', 'RARE', 'CRITICAL', 0, chain='incident', stage=1, conditions={'eventFlag': 'incident_checked'}, choices=[
    ch('FIX', '立刻回滚修复', chance=0.7,
       success={'performance': 15, 'mind': -10, 'relationship': {'TESTER': 5}},
       failure={'performance': -10, 'mind': -15, 'innerDemon': 8},
       result='回滚完成。你在心里把测试环境骂了一遍，虽然问题出在生产配置。'),
    ch('DEFEND', '先说不是我的问题', chance=0.35,
       success={'mind': 3, 'relationship': {'BOSS': -3}},
       failure={'relationship': {'BOSS': -10}, 'innerDemon': 8},
       result='你刚说完，老板甩出了你的 commit 链接。时间戳精确到秒。'),
])
ev('incident_s2', '复盘会议', '事故复盘会开了两小时，结论是"加强意识"。你没忍住叹了口气。', 'CHAIN', 'COMMON', 'NORMAL', 0, chain='incident', stage=2, effects=None, choices=[
    ch('PROPOSE', '提议加监控告警', chance=0.6,
       success={'performance': 12, 'relationship': {'BOSS': 5}, 'setFlags': ['monitoring_added']},
       failure={'mind': -5},
       result='方案通过了，排期排在三个版本之后。'),
    ch('QUIET', '沉默记笔记', {'mind': 2}, result='你在笔记本上写下"加强意识"四个字，画了个圈。'),
])
ev('incident_s3', '深夜的补偿', '事故平息后的深夜，你收到测试小哥发来的奶茶外卖。附言：辛苦了，下次别半夜发版。', 'CHAIN', 'RARE', 'NORMAL', 0, chain='incident', stage=3, effects={'mind': 15, 'relationship': {'TESTER': 8}, 'material': {'coffee_bean': 2}})

# 链3：老板画饼（5 阶段）
ev('pie_s0', '饼的香气', '老板把你叫进办公室，说公司下一轮融资到位后，期权池会扩大。他的眼睛里有光。', 'CHAIN', 'COMMON', 'NORMAL', 8, chain='pie', stage=0, choices=[
    ch('BELIEVE', '认真听讲', {'cultivation': 15, 'mind': -5, 'setFlags': ['pie_believer']},
       result='你听完了整场愿景，感觉自己已经财富自由了一秒钟。'),
    ch('NOD', '熟练点头', {'mind': 3, 'relationship': {'BOSS': 3}, 'setFlags': ['pie_nodder']},
       result='你点头点得恰到好处，像一株成熟的向日葵。'),
])
ev('pie_s1', '饼的发酵', '全员会上，老板宣布"明年上市"。前台小姐姐鼓掌的力度最大。', 'CHAIN', 'COMMON', 'NORMAL', 0, chain='pie', stage=1, choices=[
    ch('CHEER', '跟着鼓掌', {'mind': 2, 'relationship': {'BOSS': 4}},
       result='你的掌声和薪水一样，标准且克制。'),
    ch('CALCULATE', '默默算期权行权价', {'cultivation': 10, 'mind': -4},
       result='你算出行权价比市价高 40%。数学是清醒的。'),
])
ev('pie_s2', '饼的代价', '"公司困难时期，大家共渡难关。"加班餐从 40 元降到了 15 元。', 'CHAIN', 'RARE', 'NORMAL', 0, chain='pie', stage=2, choices=[
    ch('ACCEPT', '理解公司', {'mind': -8, 'innerDemon': 5},
       result='你理解了公司。公司也理解了你的沉默。'),
    ch('MOONLIGHT', '下班偷偷投简历', chance=0.5,
       success={'mind': 8, 'setFlags': ['resume_sent']},
       failure={'relationship': {'BOSS': -5}, 'innerDemon': 6},
       result='你更新了简历。猎头说"这个薪资我们帮不了你"。'),
])
ev('pie_s3', '饼的兑现？', '融资到账了。老板在群里发了三个红包，最大的一百八十八元。', 'CHAIN', 'RARE', 'NORMAL', 0, chain='pie', stage=3, conditions={'eventFlag': 'pie_believer'}, effects={'salary': 60, 'mind': 10, 'relationship': {'BOSS': 5}})
ev('pie_s4', '饼的终局', '上市没等到，等来了新老板。旧老板的工位搬空了，只留下一盆仙人掌。', 'CHAIN', 'EPIC', 'IMPORTANT', 0, chain='pie', stage=4, effects={'mind': -10, 'cultivation': 40, 'material': {'boss_pie': 1}, 'relationship': {'HR': 5}})

# 链4：需求轮回（4 阶段）
ev('req_s0', '第一版需求', '产品经理发来原型图："很简单，就一个列表页。"你看了一眼，37 个交互说明。', 'CHAIN', 'COMMON', 'NORMAL', 8, chain='req', stage=0, choices=[
    ch('ESTIMATE', '认真评估', chance=0.7,
       success={'performance': 8, 'relationship': {'PRODUCT': 3}, 'material': {'requirement_fragment': 1}},
       failure={'performance': -4, 'mind': -5},
       result='你评估了两周。产品说"下周要"。'),
    ch('ACCEPT', '好的收到', {'mind': -3}, result='你说"好的"。这两个字你练了三年。'),
])
ev('req_s1', '第7次改版', '产品第七次改原型。这次他把"确定"按钮挪到了左边，理由是"用户的手往左偏"。', 'CHAIN', 'COMMON', 'NORMAL', 0, chain='req', stage=1, choices=[
    ch('ARGUE', '拿数据反驳', chance=0.45,
       success={'performance': 10, 'mind': 5, 'relationship': {'PRODUCT': -3}},
       failure={'mind': -8, 'innerDemon': 5},
       result='产品说"这个数据我们的场景不一样"。你输了，但你没有错。'),
    ch('COMPLY', '默默改掉', {'mind': -5, 'cultivation': 8},
       result='你花了五分钟改完，又花了一小时平复心情。'),
])
ev('req_s2', '需求成精了', '凌晨两点，需求文档自己更新了。新增的一行写着："此处留白，给用户想象空间。"', 'CHAIN', 'RARE', 'NORMAL', 0, chain='req', stage=2, effects={'cultivation': 25, 'mind': -5}, once_per_day=True)
ev('req_s3', '轮回终结', '产品经理离职了。交接文档第一行："这些需求都不是我真实想法。"', 'CHAIN', 'RARE', 'IMPORTANT', 0, chain='req', stage=3, effects={'mind': 12, 'cultivation': 30, 'relationship': {'PRODUCT': 5}, 'material': {'requirement_fragment': 2}})

# 链5：厕所秘境（4 阶段）
ev('toilet_s0', '厕所异象', '厕所最后一个隔间灵气逼人。你怀疑前端又在里面闭关。', 'CHAIN', 'COMMON', 'NORMAL', 8, modes=['FISHING', 'CULTIVATING'], chain='toilet', stage=0, choices=[
    ch('ENTER', '进去一探', chance=0.6,
       success={'cultivation': 25, 'mind': 5, 'setFlags': ['toilet_disciple']},
       failure={'mind': -5},
       result='你在马桶上悟了三分钟。窗外车流声都成了诵经声。'),
    ch('SKIP', '忍住', {'mind': 2}, result='你用了第二个隔间。平凡，但安全。'),
])
ev('toilet_s1', '秘境 stabilize', '那个隔间成为了你的秘密基地。每次坐在上面，思路异常清晰。', 'CHAIN', 'COMMON', 'NORMAL', 0, chain='toilet', stage=1, conditions={'eventFlag': 'toilet_disciple'}, effects={'cultivation': 15, 'mind': 5})
ev('toilet_s2', '秘境争夺', '发现前端小哥也在蹲这个隔间。四目相对（隔着门板），气氛凝重。', 'CHAIN', 'RARE', 'NORMAL', 0, chain='toilet', stage=2, choices=[
    ch('SHARE', '约定轮流使用', {'relationship': {'JUNIOR': 8}, 'mind': 5, 'setFlags': ['toilet_shared']},
       result='你们制定了排期表。修仙界的契约精神不过如此。'),
    ch('FIGHT', '速度取胜', chance=0.5,
       success={'cultivation': 20, 'mind': 3},
       failure={'mind': -6},
       result='你赢了，但从此每次进去都有人在外面敲门。'),
])
ev('toilet_s3', '厕所仙人', '保洁阿姨说这个隔间的纸消耗速度是别的三倍。她不懂修仙，但她懂 worldly wisdom：多放了卷纸。', 'CHAIN', 'EPIC', 'NORMAL', 0, chain='toilet', stage=3, conditions={'eventFlag': 'toilet_shared'}, effects={'cultivation': 60, 'mind': 15, 'grantAchievementHint': None, 'material': {'spirit_energy': 1}}, once_ever=True)

# 链6：神秘Git仓库（4 阶段）
ev('git_s0', '未知仓库', '公司 GitLab 上有个仓库叫 do-not-touch。它有提交记录，但没有任何人出现在 contributors 里。', 'CHAIN', 'COMMON', 'NORMAL', 6, chain='gitmystery', stage=0, choices=[
    ch('CLONE', '克隆下来看看', chance=0.5,
       success={'cultivation': 30, 'material': {'code_fragment': 2}, 'setFlags': ['git_touched']},
       failure={'mind': -8},
       result='README 只有一行："你已经看到了。"',
      ),
    ch('CLOSE', '默默关掉页面', {'mind': 2}, result='好奇心害死的猫，尸体现在还在你脑子里。'),
])
ev('git_s1', '仓库的推送', 'do-not-touch 仓库更新了。commit message 是你的名字。', 'CHAIN', 'RARE', 'IMPORTANT', 0, chain='gitmystery', stage=1, conditions={'eventFlag': 'git_touched'}, choices=[
    ch('INVESTIGATE', '顺着提交记录追查', chance=0.5,
       success={'cultivation': 40, 'performance': 10},
       failure={'innerDemon': 10, 'mind': -8},
       result='提交作者的邮箱是你的名字加一串数字。注册时间是十年后。'),
    ch('DELETE', '删除本地克隆', {'mind': -3, 'setFlags': ['git_deleted']},
       result='你删了仓库。当晚你梦到有人在 git push --force 你的人生。'),
])
ev('git_s2', '仓库消失', 'do-not-touch 仓库从 GitLab 上消失了。就像从未存在过。', 'CHAIN', 'RARE', 'NORMAL', 0, chain='gitmystery', stage=2, conditions={'eventFlag': 'git_deleted'}, effects={'cultivation': 50, 'mind': 8}, once_ever=True)

# 链7：裁员传闻（4 阶段）
ev('layoff_s0', '风声', '匿名区有人说"月底见分晓"。点赞数在午休时间翻了一倍。', 'CHAIN', 'COMMON', 'NORMAL', 7, chain='layoff', stage=0, choices=[
    ch('VERIFY', '找HR仙子打听', chance=0.5,
       success={'relationship': {'HR': 5}, 'setFlags': ['layoff_confirmed_false']},
       failure={'relationship': {'HR': -3}, 'mind': -5},
       result='HR 微笑着说"没有的事"。她的微笑很专业。'),
    ch('WORK', '用加班表明价值', {'performance': 15, 'mind': -8, 'innerDemon': 5},
       result='你连续加班到十点。老板说"小范很有干劲"，然后又说了句"但是"。'),
])
ev('layoff_s1', '名单', '有人说看到了名单。名单上有部门、有名字、有 N+1。', 'CHAIN', 'RARE', 'IMPORTANT', 0, chain='layoff', stage=1, choices=[
    ch('TALK', '和老油条聊聊', chance=0.7,
       success={'mind': 10, 'relationship': {'VETERAN': 8}, 'cultivation': 10},
       failure={'mind': -5},
       result='老油条说："我经历过四次裁员。第一次我怕，后来我懂了——怕没有用，简历要有用。"'),
    ch('UPDATE', '深夜更新简历', {'mind': 5, 'setFlags': ['resume_v2']},
       result='你把"精通"改成了"熟悉"，把"热爱"改成了"擅长"。诚实使人年轻。'),
])
ev('layoff_s2', '尘埃落定', '名单公布了。你不在上面，隔壁组的老张在上面。他收拾东西时朝你笑了笑。', 'CHAIN', 'RARE', 'IMPORTANT', 0, chain='layoff', stage=2, effects={'mind': -12, 'cultivation': 35, 'innerDemon': 5, 'material': {'badge_fragment': 1}})
ev('layoff_s3', '老张的消息', '三个月后，老张发来消息：新公司涨薪40%，就是通勤远了一点。你盯着"恭喜"两个字打了很久。', 'CHAIN', 'EPIC', 'NORMAL', 0, chain='layoff', stage=3, effects={'mind': -5, 'cultivation': 20, 'innerDemon': 8}, once_ever=True)

# 链8：版本上线（3 阶段）
ev('release_s0', '上线前夜', '今晚十点发版。测试说回归没跑完，产品说必须按时上。你夹在中间，像三明治里的那片生菜。', 'CHAIN', 'COMMON', 'IMPORTANT', 7, chain='release', stage=0, choices=[
    ch('DELAY', '坚持延期', chance=0.5,
       success={'mind': 8, 'relationship': {'TESTER': 8}},
       failure={'relationship': {'PRODUCT': -5}, 'performance': -5},
       result='版本延期了一天。测试小哥看你的眼神像看救命恩人。'),
    ch('SHIP', '带病上线', chance=0.6,
       success={'performance': 15, 'salary': 50, 'mind': -8},
       failure={'innerDemon': 12, 'mind': -10, 'nextEvent': 'release_s1'},
       result='版本按时上了。你在心里给那个已知 bug 上了一炷香。'),
])
ev('release_s1', '凌晨告警', '你担心的事情发生了。凌晨一点，告警把你从床上拽起来。', 'CHAIN', 'RARE', 'CRITICAL', 0, chain='release', stage=1, choices=[
    ch('HOTFIX', '起床救火', chance=0.7,
       success={'performance': 12, 'mind': -12, 'innerDemon': 5},
       failure={'performance': -8, 'innerDemon': 10},
       result='四十分钟后系统恢复。你躺在床上，天已经亮了一半。'),
    ch('CALL', '打电话叫醒同组', chance=0.3,
       success={'mind': -3},
       failure={'relationship': {'VETERAN': -10}, 'innerDemon': 5},
       result='老油条接了电话，只说了一句"我记住了"。'),
])
ev('release_s2', '灰度通过', '三天后，新版本各项指标正常。老板在群里发了"辛苦了"三个字。你截了图。', 'CHAIN', 'COMMON', 'NORMAL', 0, chain='release', stage=2, effects={'performance': 10, 'mind': 10, 'salary': 30})

# 链9：小师妹求助（3 阶段）
ev('junior_s0', '小师妹的报错', '摸鱼小师妹发来消息：范师兄，我的代码报了个错，红的，能帮我看下吗？', 'CHAIN', 'COMMON', 'NORMAL', 8, chain='junior', stage=0, choices=[
    ch('HELP', '放下手头活去看', chance=0.8,
       success={'relationship': {'JUNIOR': 10}, 'mind': 5, 'performance': -3, 'material': {'fishing_tip': 1}},
       failure={'performance': -5, 'mind': -3},
       result='问题是一个分号。你花了二十分钟找到它，花了十分钟教她为什么。'),
    ch('LINK', '甩一个文档链接', {'relationship': {'JUNIOR': -3}, 'performance': 2},
       result='你发了份《新手入门.pdf》。她回了"谢谢师兄"。你有点后悔。'),
])
ev('junior_s1', '小师妹的回礼', '小师妹神秘兮兮地塞给你一袋东西："这是我在厕所秘境捡到的，给你！"', 'CHAIN', 'COMMON', 'NORMAL', 0, chain='junior', stage=1, effects={'material': {'spirit_energy': 1, 'coffee_residue': 2}, 'mind': 5, 'relationship': {'JUNIOR': 5}}, conditions={'eventFlag': 'junior_helped'})
ev('junior_s2', '小师妹渡劫', '小师妹要转正答辩了。她问你要不要"顺便"帮她看看PPT。', 'CHAIN', 'RARE', 'IMPORTANT', 0, chain='junior', stage=2, choices=[
    ch('COACH', '帮她改PPT到十点', chance=0.75,
       success={'relationship': {'JUNIOR': 15}, 'mind': 8, 'cultivation': 10, 'setFlags': ['junior_promoted']},
       failure={'mind': -5},
       result='PPT改到第十版时，她突然说"师兄你比产品靠谱多了"。'),
    ch('BUSY', '最近太忙了', {'relationship': {'JUNIOR': -8}, 'mind': -3},
       result='她说"没事，我随便问问"。那个"随便"很重。'),
])

# 链10：老油条传承（3 阶段）
ev('veteran_s0', '老油条的茶', '老油条前辈泡了杯茶，招呼你过去："小范，教你点课本上没有的。"', 'CHAIN', 'COMMON', 'NORMAL', 8, chain='veteran', stage=0, choices=[
    ch('LEARN', '虚心求教', {'cultivation': 20, 'relationship': {'VETERAN': 10}, 'setFlags': ['veteran_student']},
       result='他教你三件事：邮件抄送的艺术、会议室的座次、以及什么时候该装忙。'),
    ch('DECLINE', '手头有活', {'relationship': {'VETERAN': -5}},
       result='他说"好的，以后再说"。你们都知道没有以后。'),
])
ev('veteran_s1', '甩锅神功·观摩', '会上有人问起数据不一致的问题。老油条用一句话把话题引向了三个月前的"历史决策"。', 'CHAIN', 'COMMON', 'NORMAL', 0, chain='veteran', stage=1, conditions={'eventFlag': 'veteran_student'}, choices=[
    ch('STUDY', '认真记笔记', {'cultivation': 15, 'mind': 3, 'relationship': {'VETERAN': 5}},
       result='你记下了这句话的句式："当时我们是基于XX前提做的决策，现在前提变了。"',),
    ch('PRACTICE', '现学现用', chance=0.4,
       success={'mind': 6, 'performance': 3},
       failure={'relationship': {'BOSS': -5}, 'mind': -5},
       result='你甩得还不够圆。老板追问了一句，你就露馅了。'),
])
ev('veteran_s2', '传承之礼', '老油条要内部转岗了。临走前他把一本笔记本塞给你："我十年的踩坑记录。别给别人看。"', 'CHAIN', 'EPIC', 'IMPORTANT', 0, chain='veteran', stage=2, conditions={'eventFlag': 'veteran_student'}, effects={'grantTechnique': 'tech_blame_god', 'cultivation': 50, 'mind': 10, 'relationship': {'VETERAN': 10}}, once_ever=True)

# ═══════════════════════════════════════════════════════════════════
# 二、普通事件（现实职场 ≥ 30）
# ═══════════════════════════════════════════════════════════════════

ev('n_standup', '晨会站会', '站会上每个人都说"没什么阻塞"。你知道有三个人的"没什么"至少值两天工期。', 'WORK', 'COMMON', 'NORMAL', 12, cooldown=7200, choices=[
    ch('SPEAK', '说出真实阻塞', chance=0.5, success={'performance': 6, 'relationship': {'BOSS': 3}}, failure={'mind': -4}, result='老板说"这些细节会后聊"。会后没有会。'),
    ch('NOD', '没什么阻塞', {'mind': 1}, result='轮到你了。你说"没什么阻塞"。会开完了。'),
])
ev('n_review', '代码评审', '你给同事的代码提了 12 条意见。他给你回了"好的，我改"。然后只改了 2 条。', 'WORK', 'COMMON', 'NORMAL', 11, cooldown=7200, effects={'performance': 5, 'cultivation': 5})
ev('n日报', '写日报', '今天的日报你写了四十分钟。其中三十五分钟在想怎么把"改样式"写得有意义。', 'WORK', 'COMMON', 'FLAVOR', 10, cooldown=7200, effects={'performance': 3, 'cultivation': 3, 'mind': -2})
ev('n_ppt', '紧急PPT', '老板明早汇报要用PPT，晚上八点甩给你三页大纲："润色一下，不用太久。"', 'WORK', 'COMMON', 'NORMAL', 9, cooldown=14400, choices=[
    ch('ELABORATE', '精心制作', {'performance': 10, 'mind': -8, 'material': {'ppt_fragment': 2, 'boss_pie': 1}}, result='你做了23页，加了两段动画。老板最后只讲了第3页。'),
    ch('MINIMAL', '能看就行', {'performance': 4, 'mind': -3, 'material': {'ppt_fragment': 1}}, result='三页变六页。够用了。'),
])
ev('n_meeting_endless', '无限会议', '这个会本来约了半小时。现在已经第九十分钟了，议题还没过第一个。', 'MEETING', 'COMMON', 'NORMAL', 10, cooldown=14400, effects={'mind': -8, 'innerDemon': 3, 'cultivation': 5})
ev('n_meeting_useless', '可以不开的会', '会议邀请写着"简单同步"。你算了算，同步的内容一封邮件就能写完。', 'MEETING', 'COMMON', 'FLAVOR', 10, cooldown=7200, effects={'mind': -4, 'cultivation': 4})
ev('n_boss_pass', '老板走过', '老板从你身后走过。你以0.3秒的速度切了屏幕。他停了一下，又走了。', 'BOSS', 'COMMON', 'FLAVOR', 10, modes=['FISHING', 'CULTIVATING', 'SOCIAL'], cooldown=3600, effects={'mind': -3})
ev('n_boss_praise', '老板表扬', '老板在群里表扬了你的方案"思路清晰"。你看了三遍，确认没有@错人。', 'BOSS', 'COMMON', 'NORMAL', 8, cooldown=14400, effects={'performance': 8, 'mind': 8, 'relationship': {'BOSS': 5}})
ev('n_boss_blame', '无妄之锅', '线上出了问题，老板第一句话是"这块是谁负责的"。你发现那个模块的文档上写的是你的名字。', 'BOSS', 'COMMON', 'IMPORTANT', 8, cooldown=28800, choices=[
    ch('OWN', '先扛下来', {'mind': -10, 'innerDemon': 8, 'relationship': {'BOSS': 3}}, result='你说"我来处理"。处理完之后，锅还是你的，但你赚到了态度分。'),
    ch('EXPLAIN', '解释来龙去脉', chance=0.4, success={'mind': 3, 'relationship': {'BOSS': -2}}, failure={'relationship': {'BOSS': -8}, 'innerDemon': 6}, result='你解释了十分钟。老板听完说"所以现在谁来修？"。'),
])
ev('n_req_change', '需求又变了', '产品经理第N次改需求。这次他很有礼貌，礼貌得让你更想打人。', 'PRODUCT', 'COMMON', 'NORMAL', 11, cooldown=14400, effects={'mind': -6, 'performance': 3, 'relationship': {'PRODUCT': 1}})
ev('n_req_urgent', '突然插急活', '"这个很急，今天能上吗？"产品经理凑过来的表情，像在问"能借我五百吗"。', 'PRODUCT', 'COMMON', 'NORMAL', 10, cooldown=14400, choices=[
    ch('ACCEPT', '接了', chance=0.6, success={'performance': 12, 'salary': 30, 'mind': -8}, failure={'performance': -5, 'mind': -10}, result='你加了三小时班。上线的功能第二天被下线了。'),
    ch('REFUSE', '排期下个迭代', {'relationship': {'PRODUCT': -4}, 'mind': 3}, result='产品说"我跟老板说去"。你等着，任务还是进了下个迭代。'),
])
ev('n_test_reject', '测试打回', '测试小哥提了7个bug。其中3个是"预期结果和实际不一致"——预期文档是他自己写的。', 'BUG', 'COMMON', 'NORMAL', 11, cooldown=14400, effects={'performance': -4, 'mind': -4, 'relationship': {'TESTER': 1}})
ev('n_bug_hidden', '隐蔽Bug', '你发现了一个藏得很深的bug。修完之后你陷入了沉思：它存在了两年，为什么现在才发现？', 'BUG', 'COMMON', 'NORMAL', 10, cooldown=14400, effects={'performance': 8, 'cultivation': 8, 'material': {'bug_crystal': 1}})
ev('n_offline_380', '凌晨上线', '需求要求凌晨三点上线，因为"用户少"。你看着"用户少"三个字，想到了你自己凌晨三点的心跳。', 'BUG', 'COMMON', 'NORMAL', 7, cooldown=604800, effects={'performance': 10, 'salary': 60, 'mind': -12, 'innerDemon': 6})
ev('n_overtime_voluntary', '自愿加班', '九点了，办公室还有五个人。没有一个是自愿的，但都没有走。', 'WORK', 'COMMON', 'NORMAL', 9, cooldown=28800, effects={'salary': 40, 'performance': 8, 'mind': -8, 'innerDemon': 3})
ev('n_lunch_where', '午饭去哪', '"今天中午吃啥？"这个问题的难度，随着工龄增长而指数上升。', 'NPC', 'COMMON', 'FLAVOR', 10, cooldown=86400, effects={'mind': 3})
ev('n_milk_tea', '下午茶拼单', '同事发起奶茶拼单。你本想减肥，但"满50减20"的横幅说服了你。', 'NPC', 'COMMON', 'FLAVOR', 10, cooldown=86400, effects={'salaryCost': 18, 'mind': 6, 'relationship': {'JUNIOR': 2}})
ev('n_express', '快递到工位', '你网购的机械键盘到了。拆快递的瞬间，你感觉自己像个开盲盒的孩子。', 'NPC', 'COMMON', 'FLAVOR', 8, cooldown=172800, effects={'mind': 5, 'cultivation': 3})
ev('n_hr_survey', 'HR满意度调研', 'HR发了员工满意度问卷，注明"匿名"。你觉得这个"匿名"的意思是可以查工号。', 'NPC', 'COMMON', 'NORMAL', 9, cooldown=604800, choices=[
    ch('HONEST', '如实填写', chance=0.3, success={'mind': 5, 'relationship': {'HR': -3}}, failure={'relationship': {'HR': -8}, 'innerDemon': 3}, result='你如实写了"希望减少无效会议"。HR约你"喝咖啡聊聊"。'),
    ch('POLITE', '全部满意', {'relationship': {'HR': 3}, 'mind': -2}, result='你全勾了"满意"。卷面上你最幸福。'),
])
ev('n_salary_day', '工资到账', '工资到账短信响了。你先看了公积金，再看个税，最后才看实发。每个数字都比上个月理直气壮了一点。', 'WORK', 'COMMON', 'NORMAL', 8, cooldown=604800, effects={'salary': 20, 'mind': 8})
ev('n_review_self', '自我绩效评价', '绩效自评让你写"本季度最大成就"。你写了半天，删了又写。最后写了"按时交付"。', 'WORK', 'COMMON', 'NORMAL', 8, cooldown=604800, effects={'performance': 5, 'mind': -3})
ev('n_colleague_quit', '同事提离职', '隔壁组的小李提了离职。他请全组喝奶茶，笑得像刚中彩票。', 'NPC', 'COMMON', 'NORMAL', 8, cooldown=604800, choices=[
    ch('ASK', '问他去哪', {'mind': -3, 'cultivation': 5, 'setFlags': ['want_quit_more']}, result='他说了公司名。那个公司在招聘软件的首页上挂了很久。'),
    ch('BLESS', '只说恭喜', {'mind': 2}, result='你说"恭喜"。这两个字里有三分真心，七分羡慕。'),
])
ev('n_printer', '打印机渡劫', '打印机又卡纸了。它发出濒死的哀鸣，吐出一张半页白半页黑的纸。', 'SECRET', 'COMMON', 'FLAVOR', 9, cooldown=28800, effects={'cultivation': 5, 'mind': -2})
ev('n_vpn', 'VPN断了', 'VPN毫无征兆地断了。你重启了三次，换了两个网，最后发现是公司出口带宽满了。', 'BUG', 'COMMON', 'FLAVOR', 9, cooldown=28800, effects={'mind': -3, 'cultivation': 2})
ev('n_keyboard_war', '键盘声战争', '新同事的机械键盘是青轴。整个办公室的人都在用眼神谴责他。', 'NPC', 'COMMON', 'FLAVOR', 9, cooldown=86400, effects={'mind': -2, 'cultivation': 3})
ev('n_ac_suddenly', '空调之争', '26度还是22度？这个问题的战争从夏天打到冬天，从来没有赢家。', 'NPC', 'COMMON', 'FLAVOR', 9, cooldown=86400, effects={'mind': -1})
ev('n_email_cc', '抄送的艺术', '一封邮件被抄送给了全组，包括老板的老板。你从"收件人"变成了"背锅候选人"。', 'WORK', 'COMMON', 'NORMAL', 8, cooldown=28800, effects={'mind': -4, 'performance': 2})
ev('n_data_request', '临时取数', '老板要一份"马上要"的数据。你花了三小时做出来，五分钟后收到回复"好的，先放着"。', 'WORK', 'COMMON', 'NORMAL', 9, cooldown=28800, effects={'performance': 5, 'mind': -5})
ev('n_desk_plant', '绿萝告急', '工位的绿萝黄了两片叶子。你想起上一次浇水是两周前。它替你扛下了工位的岁月。', 'SECRET', 'COMMON', 'FLAVOR', 7, cooldown=172800, effects={'mind': 3})
ev('n_wifi_slow', '下午三点的WiFi', '每天下午三点，公司WiFi准时变慢。大家怀疑是带宽调度，其实是所有人都在点下午茶。', 'SECRET', 'COMMON', 'FLAVOR', 8, cooldown=86400, effects={'mind': -1, 'cultivation': 2})

# ═══════════════════════════════════════════════════════════════════
# 三、普通事件（修仙荒诞 ≥ 25）
# ═══════════════════════════════════════════════════════════════════

ev('m_server_tribulation', '服务器渡劫', '机房的服务器在雷雨夜集体重启。运维说这叫"雷劫"，扛过去算它命大。', 'SECRET', 'COMMON', 'FLAVOR', 9, cooldown=86400, effects={'cultivation': 10, 'mind': 3})
ev('m_bug_spirit', 'Bug成精', '这个bug你修了八次，它出现了九次。你开始怀疑它在进化。', 'BUG', 'RARE', 'NORMAL', 8, cooldown=86400, choices=[
    ch('PURSUE', '追到底', chance=0.5, success={'cultivation': 30, 'performance': 10, 'material': {'bug_crystal': 2}}, failure={'mind': -8, 'innerDemon': 5}, result='第九次，你终于抓到了它。根因是一行十年前的代码在等一个十年后的输入。'),
    ch('TAME', '供奉起来', {'mind': 2, 'cultivation': 10}, result='你在代码里加了个try-catch，注释写着"勿动"。它安静了。'),
])
ev('m_coffee_furnace', '咖啡炼丹炉', '茶水间的咖啡机在你按键的瞬间发出了龙吟。这杯美式，有灵性。', 'SECRET', 'COMMON', 'FLAVOR', 9, cooldown=28800, effects={'cultivation': 8, 'mind': 5, 'material': {'coffee_residue': 1}})
ev('m_desk_array', '工位聚灵阵', '你把绿萝、加湿器和三块显示器摆成了特定角度。工位的灵气浓度提升了 12%。', 'SECRET', 'COMMON', 'FLAVOR', 8, cooldown=172800, effects={'cultivation': 15, 'mind': 3})
ev('m_meeting_illusion', '会议室幻境', '这个会开了三小时，你却记不起任何一句人话。你怀疑会议室吞噬了时间。', 'MEETING', 'RARE', 'FLAVOR', 7, cooldown=86400, effects={'mind': -5, 'cultivation': 8, 'innerDemon': 2})
ev('m_git_realm', 'Git仓库秘境', '你在 git log 里看到了一条来自2035年的提交。作者署名是你，留言是"别升职"。', 'SECRET', 'EPIC', 'NORMAL', 4, cooldown=604800, choices=[
    ch('OBEY', '听未来自己的', {'mind': 5, 'cultivation': 10, 'setFlags': ['git_prophecy']}, result='你决定躺平一周。奇怪的是，这周特别顺。'),
    ch('DEFY', '偏要升职', {'performance': 15, 'mind': -5}, result='你把这条提交当成了反向指标。未来的事，未来再说。'),
], once_ever=True)
ev('m_nap_dao', '午睡入定', '趴在工位上睡了二十分钟。醒来时你分不清是午休还是闭关。', 'SECRET', 'COMMON', 'FLAVOR', 10, cooldown=86400, effects={'mind': 8, 'cultivation': 5})
ev('m_elevator_npc', '电梯奇遇', '电梯里遇到大老板。三十层楼的行程，你俩都没说话。这是你本周最长的社交。', 'BOSS', 'COMMON', 'FLAVOR', 8, cooldown=172800, effects={'mind': -2, 'cultivation': 2})
ev('m_wifi_dao', '断网悟道', '公司断网一小时。IT说是故障，你说是天意。这一小时你完成了两天的活。', 'SECRET', 'RARE', 'NORMAL', 6, cooldown=604800, effects={'performance': 15, 'cultivation': 15, 'mind': 5})
ev('m_pie_smell', '画饼真香', '老板画的饼太大了，你居然闻到了香味。你需要冷静一下。', 'BOSS', 'COMMON', 'FLAVOR', 8, cooldown=86400, effects={'cultivation': 8, 'mind': -2})
ev('m_5g_spirit', '5G灵脉', '你发现公司某角落网速奇快。从此那里站满了"抽烟"的人。', 'SECRET', 'COMMON', 'FLAVOR', 8, cooldown=172800, effects={'cultivation': 10, 'mind': 3})
ev('m_old_file', '上古文档', '共享盘里有个文件夹叫"新建文件夹(3)"，里面有公司2009年的组织架构图。你在里面看到了老板的名字，那时候他还是你现在的职级。', 'SECRET', 'RARE', 'FLAVOR', 6, cooldown=604800, effects={'cultivation': 20, 'mind': 5})
ev('m_screen_ghost', '屏幕鬼影', '你的显示器左上角总是闪过一个白影。报修三次，师傅说"显示器没问题"。你开始怀疑是自己有问题。', 'SECRET', 'RARE', 'FLAVOR', 5, cooldown=604800, effects={'innerDemon': 5, 'cultivation': 10})
ev('m_ot_ghost', '加班幻觉', '凌晨的办公室，你听到有人叫你的名字。回头只有你工位的绿萝。它好像又黄了一片。', 'SECRET', 'RARE', 'FLAVOR', 5, cooldown=604800, effects={'innerDemon': 6, 'cultivation': 12})
ev('m_key_spirit', '键盘显灵', '你的键盘F键失灵了三天。今天它自己好了。你没修它，就像你不会去打扰一个正在闭关的高人。', 'SECRET', 'COMMON', 'FLAVOR', 7, cooldown=172800, effects={'cultivation': 8, 'mind': 3})
ev('m_ppt_dao', 'PPT悟道', '做到第38页时，你突然理解了老板所有的决策。原来PPT才是公司的功法秘籍。', 'SECRET', 'RARE', 'FLAVOR', 6, cooldown=604800, effects={'cultivation': 25, 'performance': 5, 'material': {'ppt_fragment': 1}})
ev('m_smell_debug', '闻Bug术', '你发现自己能"闻到"bug的味道了。这次是这排代码——果然，隐藏三层的空指针。', 'SECRET', 'RARE', 'NORMAL', 6, cooldown=86400, effects={'performance': 10, 'cultivation': 10, 'material': {'bug_crystal': 1}})
ev('m_nap_boss', '老板也在摸鱼', '你路过老板办公室，看到他在刷短视频。四目相对，他缓缓地、庄重地关掉了屏幕。从此你们有了共享的秘密。', 'BOSS', 'RARE', 'NORMAL', 5, cooldown=604800, effects={'relationship': {'BOSS': 8}, 'mind': 5}, once_ever=True)
ev('m_gate_pass', '门禁失效', '你的工牌今天早上突然刷不开门。保安看了你三秒，放你进去了。你在这个公司工作的证明，只剩工牌和眼神。', 'SECRET', 'COMMON', 'FLAVOR', 6, cooldown=172800, effects={'mind': -2, 'cultivation': 5, 'material': {'badge_fragment': 1}})
ev('m_duanwu', '节日粽子', '端午发了粽子。行政说这是"高端定制款"。你咬了一口，是蛋黄肉的，还挺好吃。', 'NPC', 'COMMON', 'FLAVOR', 6, cooldown=604800, effects={'mind': 6, 'salaryCost': 0})
ev('m_weather_rain', '暴雨通勤', '暴雨天，地铁限流。你淋着雨到公司，工位还没坐热就开始羡慕远程办公的人。', 'SECRET', 'COMMON', 'FLAVOR', 7, cooldown=604800, effects={'mind': -5, 'cultivation': 3})
ev('m_canteen_dao', '食堂玄学', '食堂阿姨的手今天抖了一下，多给了你一块肉。你觉得今天适合买彩票。', 'NPC', 'COMMON', 'FLAVOR', 8, cooldown=86400, effects={'mind': 5, 'cultivation': 3})
ev('m_water_cooler', '饮水机八卦', '饮水机旁听到了一个惊天八卦：原来隔壁组的OKR和你们的一模一样。', 'NPC', 'COMMON', 'FLAVOR', 8, cooldown=86400, effects={'mind': 2, 'cultivation': 4})
ev('m_second_screen', '副屏的秘密', '你发现副屏朝向的角度，刚好能让路过的人看到代码，而你看到的是弹幕网站。工位风水学，是一门大学问。', 'SECRET', 'COMMON', 'FLAVOR', 7, cooldown=172800, effects={'cultivation': 8, 'mind': 4, 'material': {'fishing_tip': 1}})
ev('m_startup_dream', '创业的梦', '午休时梦到自己创业成功，财务自由。醒来后闹钟响了，你还有三个需求要改。', 'SECRET', 'COMMON', 'FLAVOR', 8, cooldown=172800, effects={'mind': -3, 'cultivation': 8})

# ═══════════════════════════════════════════════════════════════════
# 四、NPC 事件（每个 NPC ≥ 3，共 18+）
# ═══════════════════════════════════════════════════════════════════

# BOSS
ev('npc_boss_1on1', '老板1对1', '老板约你1对1："聊聊你的职业规划。"你准备了一段话，他在看手机。', 'BOSS', 'COMMON', 'NORMAL', 9, cooldown=604800, choices=[
    ch('PLAN', '认真讲规划', chance=0.5, success={'relationship': {'BOSS': 8}, 'performance': 5}, failure={'mind': -5}, result='老板说"很好，保持"。你不知道保持什么。'),
    ch('LISTEN', '等他说', {'relationship': {'BOSS': 3}}, result='他说了四十分钟公司战略。你点头了十七次。'),
])
ev('npc_boss_dinner', '老板请客', '老板请核心成员吃饭。菜很好，话题很尬。全程你只在他说"年轻人要多吃"时动了筷子。', 'BOSS', 'RARE', 'NORMAL', 7, cooldown=604800, effects={'mind': 3, 'relationship': {'BOSS': 6}, 'salaryCost': 0})
ev('npc_boss_quiz', '老板突击提问', '老板突然问"这个功能的数据怎么样"。你打开了三份文档，数据都不一样。', 'BOSS', 'COMMON', 'NORMAL', 9, cooldown=28800, choices=[
    ch('HONEST', '说数据有出入', chance=0.5, success={'relationship': {'BOSS': 3}, 'mind': -2}, failure={'relationship': {'BOSS': -4}}, result='老板皱了皱眉，说"把数据搞准"。这成了你的新需求。'),
    ch('BLUFF', '报个大概', chance=0.4, success={'performance': 5}, failure={'relationship': {'BOSS': -6}, 'innerDemon': 3}, result='你报了个数。三天后有人引用了这个数，越传越大。'),
])
# PRODUCT
ev('npc_prod_review', '产品评审会', '产品讲解新需求，PPT第9页写着"技术实现很简单"。你的手在桌下握成了拳。', 'PRODUCT', 'COMMON', 'NORMAL', 10, cooldown=604800, choices=[
    ch('QUESTION', '问边界情况', chance=0.5, success={'performance': 6, 'relationship': {'PRODUCT': -2}}, failure={'mind': -5}, result='你问了三个"如果"。产品现场新造了三个需求。'),
    ch('SILENT', '保持沉默', {'mind': 2}, result='你全程微笑。会后需求文档多了两页。'),
])
ev('npc_prod_mockup', '原型图之谜', '产品发来的原型图上有个按钮没写文案，备注是"你懂的"。你不懂。没人懂。', 'PRODUCT', 'COMMON', 'FLAVOR', 9, cooldown=28800, effects={'mind': -3, 'cultivation': 3})
# TESTER
ev('npc_tester_warning', '测试预警', '测试小哥私下告诉你："明天要测的模块，我昨天点了两下，感觉有东西。"', 'NPC', 'COMMON', 'NORMAL', 9, cooldown=604800, choices=[
    ch('PRECHECK', '提前自查', {'performance': 8, 'relationship': {'TESTER': 6}, 'cultivation': 5}, result='你真查出了两个问题。测试小哥说"稳"。'),
    ch('CONFIDENT', '我的代码没问题', chance=0.3, success={'mind': 3}, failure={'performance': -8, 'relationship': {'TESTER': -3}, 'mind': -5}, result='测试第二天给你提了9个bug。其中一个标了P0。'),
])
ev('npc_tester_treat', '测试的零食', '测试小哥工位的零食柜永远敞开。他说"吃吧，提bug之前吃点甜的，大家都好说话"。', 'NPC', 'COMMON', 'FLAVOR', 8, cooldown=86400, effects={'mind': 4, 'relationship': {'TESTER': 3}, 'salaryCost': 0})
# JUNIOR
ev('npc_junior_fish', '小师妹求带', '小师妹说想学"师兄的摸鱼心法"。你看了看四周，压低了声音。', 'NPC', 'COMMON', 'NORMAL', 9, cooldown=604800, choices=[
    ch('TEACH', '传授三成', {'relationship': {'JUNIOR': 8}, 'cultivation': 5, 'mind': 4}, result='你教了她三成。她学得比你快。'),
    ch('REFUSE', '这个不能教', {'relationship': {'JUNIOR': -4}}, result='她说"哦"。第二周她摸鱼比你顺畅了。'),
])
ev('npc_junior_gossip', '小师妹的情报', '小师妹的消息比内网还快："听说下个月要调薪了，你去争取争取！"', 'NPC', 'COMMON', 'NORMAL', 8, cooldown=604800, effects={'mind': 5, 'cultivation': 5, 'relationship': {'JUNIOR': 2}})
# VETERAN
ev('npc_veteran_shortcut', '老油条的捷径', '老油条告诉你一个内部系统的隐藏快捷键，能省一半工单处理时间。"别外传，这是师门信物。"', 'NPC', 'COMMON', 'NORMAL', 8, cooldown=604800, effects={'performance': 8, 'relationship': {'VETERAN': 4}, 'cultivation': 5})
ev('npc_veteran_warning', '老油条的警告', '老油条意味深长地说："下周的会，你别第一个发言。"', 'NPC', 'COMMON', 'NORMAL', 8, cooldown=604800, choices=[
    ch('HEED', '听劝', {'mind': 3, 'relationship': {'VETERAN': 5}}, result='会上第一个发言的人被追加了三个需求。你后怕地摸了摸鼻子。'),
    ch('IGNORE2', '不以为然', chance=0.4, success={'performance': 5}, failure={'performance': -5, 'mind': -6, 'relationship': {'VETERAN': -3}}, result='你发言了。然后你领到了三个"顺便做一下"。'),
])
# HR
ev('npc_hr_review', 'HR面谈', 'HR仙子约你"例行沟通"。你回忆了自己有没有做过什么，想了十分钟，一无所得。', 'NPC', 'COMMON', 'NORMAL', 9, cooldown=604800, choices=[
    ch('OPEN', '说说真实想法', chance=0.5, success={'relationship': {'HR': 8}, 'mind': 3}, failure={'relationship': {'HR': -3}, 'innerDemon': 3}, result='你说希望能少一点无效加班。HR记了很多。你不知道她记的是哪一面。'),
    ch('SAFE', '标准答案', {'relationship': {'HR': 2}}, result='你说"挺好的，学到了很多"。HR笑着说"你每季度都这么说"。'),
])
ev('npc_hr_benefit', 'HR福利通知', 'HR发通知：补充医疗保险生效了。你研究了三分钟条款，结论是"希望永远用不上"。', 'NPC', 'COMMON', 'FLAVOR', 7, cooldown=604800, effects={'mind': 3})
ev('npc_hr_payroll', '薪资疑问', '你发现这个月工资多了300块。你去问HR，她说"查一下"。第二天，少了300。', 'NPC', 'COMMON', 'NORMAL', 6, cooldown=604800, effects={'mind': -4, 'salary': 0})

# ═══════════════════════════════════════════════════════════════════
# 五、稀有事件（≥ 12，含 EPIC）
# ═══════════════════════════════════════════════════════════════════

ev('r_poker_face', '扑克脸大师', '老板在会上说"这个项目谁做的，做得不错"。全组安静了五秒。你缓缓举手，保持扑克脸。', 'BOSS', 'RARE', 'NORMAL', 5, cooldown=604800, effects={'relationship': {'BOSS': 10}, 'performance': 10, 'mind': 8})
ev('r_deadline_miracle', '不可能的交付', ' deadline 提前了一周。你闭关两天，咖啡喝了九杯，交付了。你看着自己的手，怀疑它们悟了。', 'WORK', 'RARE', 'IMPORTANT', 5, cooldown=604800, effects={'performance': 20, 'salary': 80, 'mind': -15, 'innerDemon': 8, 'cultivation': 20})
ev('r_headhunter', '猎头来电', '猎头说有个"职级翻倍、薪资涨50%"的机会。你听完了，说了句"我再想想"。挂了电话，你把"再想想"设成了屏保。', 'SECRET', 'RARE', 'IMPORTANT', 5, cooldown=604800, choices=[
    ch('REPLY', '发简历看看', {'mind': -5, 'cultivation': 10, 'setFlags': ['headhunter_contacted']}, result='你更新了简历发过去。对方已读。'),
    ch('STAY', '再也不是', {'mind': 5, 'relationship': {'BOSS': 2}}, result='你删掉了短信。稳定也是一种修行。'),
])
ev('r_dark_kitchen', '深夜食堂', '加班到十一点，行政突然推来一车宵夜："老板请的。"烤串的热气里，你重新审视了这家公司。', 'WORK', 'RARE', 'NORMAL', 5, cooldown=604800, effects={'mind': 10, 'salary': 30, 'relationship': {'BOSS': 3}})
ev('r_gamified_kpi', '绩效奇迹', '季度绩效出来了：你是团队第一。奖金到账那一刻，你决定这季度继续装普通人。', 'WORK', 'EPIC', 'NORMAL', 4, cooldown=1209600, effects={'salary': 200, 'performance': 15, 'mind': 12, 'relationship': {'BOSS': 5}})
ev('r_system_enlightenment', '系统顿悟', '凌晨两点半，你突然想通了系统里所有纠缠不清的依赖关系。你爬起来画了张图，然后热泪盈眶。', 'SECRET', 'EPIC', 'NORMAL', 3, cooldown=1209600, effects={'cultivation': 80, 'mind': 15, 'performance': 10})
ev('r_zhuangzhou_dream', '庄周梦蝶', '午休你梦到自己是一只牛，在格子间的草原上吃草。醒来后发现，口水打湿了键盘。到底谁是梦？', 'SECRET', 'RARE', 'FLAVOR', 4, cooldown=604800, effects={'cultivation': 30, 'mind': 8})
ev('r_fire_drill', '消防演习', '全员疏散到楼下，烈日下站了四十分钟。你观察到：没有人在讨论工作，这是本月最轻松的时刻。', 'SECRET', 'COMMON', 'FLAVOR', 5, cooldown=1209600, effects={'mind': 8, 'cultivation': 5})
ev('r_anniversary_gift', '周年礼物', '入职周年，HR送了你一个定制马克杯，上面印着你的名字和日期。这是公司记得你的方式。', 'NPC', 'RARE', 'NORMAL', 4, cooldown=1209600, effects={'mind': 10, 'relationship': {'HR': 5}, 'grantEquipment': 'eq_mug'}, once_ever=True)
ev('r_boss_secret', '老板的秘密', '你无意间发现老板的电脑屏保是一只橘猫戴工牌的照片。原来他也有柔软的一面。', 'BOSS', 'RARE', 'FLAVOR', 4, cooldown=1209600, effects={'relationship': {'BOSS': 5}, 'mind': 5})
ev('r_zero_bug_day', '零Bug的一天', '今天测试一个bug都没提。全组陷入不安："他是不是请假了？"', 'BUG', 'RARE', 'FLAVOR', 4, cooldown=604800, effects={'mind': 8, 'performance': 5, 'cultivation': 10})
ev('r_promotion_wind', '晋升风声', 'HR和老板在会议室谈了一小时，白板上写着你的名字。你假装路过，听到了"储备"两个字。', 'BOSS', 'EPIC', 'IMPORTANT', 4, cooldown=1209600, effects={'mind': -5, 'cultivation': 20, 'relationship': {'BOSS': 3}, 'promotionModifier': 10})

# ═══════════════════════════════════════════════════════════════════
# 六、隐藏/彩蛋事件（≥ 10）
# ═══════════════════════════════════════════════════════════════════

ev('e_toilet_sage', '隔间仙人', '你在厕所隔间门板背面发现一行小字："此地灵气，可持续三分钟。切勿贪多。"落款日期是2015年。', 'SECRET', 'EPIC', 'FLAVOR', 2, modes=['FISHING', 'CULTIVATING'], cooldown=1209600, effects={'cultivation': 40, 'mind': 10}, once_ever=True)
ev('e_404_dao', '404之道', '你访问了一个404页面。页面写着："你寻找的页面已飞升。施主，回头是岸。"', 'SECRET', 'RARE', 'FLAVOR', 2, cooldown=604800, effects={'cultivation': 15, 'mind': 5})
ev('e_night_watch', '凌晨四点的办公室', '你凌晨四点回到公司取落下的电脑。整层楼的灯为你一人亮着。你突然理解了"孤独"和"自由"是同一个词。', 'SECRET', 'EPIC', 'FLAVOR', 1, cooldown=2592000, effects={'cultivation': 60, 'mind': 20, 'innerDemon': -10}, once_ever=True)
ev('e_cat', '楼道橘猫', '公司楼下有只橘猫，工牌挂着"首席摸鱼官"。它每天准时上班，从不加班。', 'SECRET', 'RARE', 'FLAVOR', 3, cooldown=604800, choices=[
    ch('PET', 'rua一把', {'mind': 10, 'cultivation': 5}, result='猫在你手上蹭了蹭。它的毛很软，它的生活比你松弛。'),
    ch('FEED', '投喂火腿肠', chance=0.8, success={'mind': 15, 'material': {'fishing_tip': 1}, 'setFlags': ['cat_friend']}, failure={'salaryCost': 3, 'mind': 5}, result='猫吃了火腿肠，看了你一眼，走开了。但你知道，你们已经是朋友。'),
])
ev('e_old_badge', '旧工牌', '你在抽屉深处翻到第一张工牌。照片上的自己眼睛发亮，头发浓密。', 'SECRET', 'RARE', 'FLAVOR', 3, cooldown=2592000, effects={'mind': -3, 'cultivation': 15, 'material': {'badge_fragment': 1}})
ev('e_music_moment', '耳机里的歌', '随机播放突然放到你大学时代的歌。窗外的阳光斜斜的，你恍惚了三秒，回到了那个不用开周会的年纪。', 'SECRET', 'RARE', 'FLAVOR', 3, cooldown=604800, effects={'mind': 12, 'cultivation': 10})
ev('e_last_word', '离职同事的留言', '你在茶水间的柜子底层发现一罐可乐，贴着字条："给下一个需要它的人。——2019年，14楼的我"', 'SECRET', 'RARE', 'FLAVOR', 2, cooldown=1209600, effects={'mind': 15, 'cultivation': 10}, once_ever=True)
ev('e_rain_window', '雨窗发呆', '暴雨敲窗，你盯着玻璃上的水痕发呆了五分钟。这五分钟，你没有想需求，没有想deadline。', 'SECRET', 'COMMON', 'FLAVOR', 3, cooldown=604800, effects={'mind': 10})
ev('e_dao_margin', '文档的边角', '你在一份2016年的需求文档页边发现手写小字："记得按时吃饭。"你摸了摸自己的胃，决定中午不吃轻食了。', 'SECRET', 'RARE', 'FLAVOR', 2, cooldown=1209600, effects={'mind': 8, 'cultivation': 8}, once_ever=True)
ev('e_star_dao', '加班后的星空', '深夜下班，你在写字楼前抬头，居然看到了星星。城市里难得一见。你在楼下站了十分钟才走。', 'SECRET', 'RARE', 'FLAVOR', 2, cooldown=1209600, effects={'mind': 18, 'cultivation': 20, 'innerDemon': -5}, once_ever=True)
ev('e_office_plant_flower', '绿萝开花', '你工位的绿萝——那盆你养了两年、黄过三次叶的绿萝——开出了一朵小白花。全网都说绿萝不开花。', 'SECRET', 'EPIC', 'FLAVOR', 1, cooldown=2592000, effects={'mind': 25, 'cultivation': 30}, once_ever=True)

# ═══════════════════════════════════════════════════════════════════
# 写出
# ═══════════════════════════════════════════════════════════════════

# 质量统计
chains = {}
branching = 0
rarity_count = {}
cats = {}
for e in events:
    chains.setdefault(e.get('chainId', '_'), []).append(e['id'])
    if e.get('choices') and (len(e['choices']) > 1 or any(c.get('successChance') for c in e['choices'])):
        branching += 1
    rarity_count[e['rarity']] = rarity_count.get(e['rarity'], 0) + 1
    cats[e['category']] = cats.get(e['category'], 0) + 1

ids = [e['id'] for e in events]
assert len(ids) == len(set(ids)), 'duplicate event id!'
chain_count = len([c for c in chains if c != '_'])

out = {'events': events}
io.open('assets/configs/v2/events.json', 'w', encoding='utf-8', newline='\n').write(
    json.dumps(out, ensure_ascii=False, indent=1) + '\n')

print(f'total events: {len(events)}')
print(f'branching events: {branching}')
print(f'chains: {chain_count}')
print(f'rarity: {rarity_count}')
print(f'categories: {cats}')
