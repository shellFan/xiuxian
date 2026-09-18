# -*- coding: utf-8 -*-
"""Phase 6: inject V2 renderers + modals into desktop/ui-overlay.js (part 2)."""
import io

p = 'desktop/ui-overlay.js'
s = io.open(p, encoding='utf-8').read()

old = "  var PAGE_TITLES = {\n    HOME: '', TASKS: '任务', CRAFT: '物品合成', PROMOTION: '晋升渡劫', MORE: '更多',\n    SECT: '宗门页', LEADERBOARD: '排行榜', FRIENDS: '好友', ACHIEVEMENTS: '成就', SETTINGS: '设置',\n  };"
new = "  var PAGE_TITLES = {\n    HOME: '', TASKS: '任务', CRAFT: '物品合成', PROMOTION: '晋升渡劫', MORE: '更多',\n    SECT: '宗门页', LEADERBOARD: '排行榜', FRIENDS: '好友', ACHIEVEMENTS: '成就', SETTINGS: '设置',\n    TECHNIQUES: '功法', EQUIPMENT: '法宝', NPC: '人际关系', SETTLEMENT: '下班结算', DEV: 'DEV 面板',\n  };"
assert old in s, 'PAGE_TITLES anchor'
s = s.replace(old, new)

old = "      case 'SETTINGS': return renderSettings();"
new = ("      case 'SETTINGS': return renderSettings();\n"
       "      case 'TECHNIQUES': return renderTechniques();\n"
       "      case 'EQUIPMENT': return renderEquipment();\n"
       "      case 'NPC': return renderNpc();\n"
       "      case 'SETTLEMENT': return renderSettlementPage();\n"
       "      case 'DEV': return renderDev();")
assert old in s, 'renderCurrent anchor'
s = s.replace(old, new)

old = ("      '<div class=\"ux-more-grid\">' +\n"
       "        moreItem('sect', '⚔️', '宗门', '选择你的流派') +\n"
       "        moreItem('leaderboard', '🏆', '排行榜', '修为职级大比拼') +\n"
       "        moreItem('friends', '👥', '好友', '拜访好友赠灵石') +\n"
       "        moreItem('achievements', '📜', '成就', '职场修仙履历') +\n"
       "        moreItem('settings', '⚙️', '设置', '音效与存档') +\n"
       "      '</div>' +")
new = ("      '<div class=\"ux-more-grid\">' +\n"
       "        moreItem('techniques', '📖', '功法', '主修与辅助 Build') +\n"
       "        moreItem('equipment', '🎽', '法宝', '三槽职场法宝') +\n"
       "        moreItem('npc', '🧑‍🤝‍🧑', '人际', '六位核心NPC关系') +\n"
       "        moreItem('sect', '⚔️', '宗门', '选择你的流派') +\n"
       "        moreItem('leaderboard', '🏆', '排行榜', '修为职级大比拼') +\n"
       "        moreItem('friends', '👥', '好友', '拜访好友赠灵石') +\n"
       "        moreItem('achievements', '📜', '成就', '职场修仙履历') +\n"
       "        moreItem('settings', '⚙️', '设置', '音效与存档') +\n"
       "      '</div>' +")
assert old in s, 'more grid anchor'
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('part2 hooks done')
