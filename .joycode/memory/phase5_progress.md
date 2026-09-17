---
name: phase5-progress
description: PC V1 Desktop完成 - Electron+pc-patch.js运行时UI接线+EXE打包验证通过
type: project
---

PC V1 Desktop Build完成。pc-patch.js通过System.import('cc')获取Cocos运行时，cc.js.getClassByName('CocosBootstrapComponent').instance.facade获取Facade。3按钮+5Tab+5事件全部绑定。EXE打包到dist/牛马修仙传-win32-x64/。存档/读档正常。
**Why:** 标记PC桌面版验收完成状态
**How to apply:** 后续PC相关修改参考此方案，注意ccclass名是'CocosBootstrapComponent'非'CocosBootstrap'，不要修改System.import链