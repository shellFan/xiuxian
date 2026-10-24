---
name: phase5-progress
description: PC V1 Desktop完成 - Electron+pc-patch.js运行时UI接线+EXE打包验证通过
type: project
---

PC V1 Desktop Build完成。pc-patch.js通过System.import('cc')获取Cocos运行时，cc.js.getClassByName('CocosBootstrapComponent').instance.facade获取Facade。3按钮+5Tab+5事件全部绑定。EXE打包到dist/牛马修仙传-win32-x64/。存档/读档正常。
**Why:** 标记PC桌面版验收完成状态
**How to apply:** 后续PC相关修改参考此方案，注意ccclass名是'CocosBootstrapComponent'非'CocosBootstrap'，不要修改System.import链

## 2026-10-12 项目启动验证（gameplay-v2分支）

- 分支：gameplay-v2（HEAD: f7507c6）
- Cocos Creator 3.8.4 安装路径：`C:\ProgramData\cocos\editors\Creator\3.8.4\CocosCreator.exe`
- Electron 28.3.3 二进制通过华为云镜像手动下载（`desktop/download-electron.cjs`）
- 完整启动流程：`npm run pc:build`（~55秒）→ `npm run pc:copy` → `npm run pc:dev`
- 游戏成功运行：GAME_READY、720x1280画布、存档系统正常
- **Cocos CDN 403问题**：download.cocos.com 需签名认证，签名API为 `https://www.cocos.com/server/productionVersion/download?url=<encoded_url>`，返回带auth_key+exptime的有效链接