---
name: runtime-testing-electron
description: Electron运行时测试中executeJavaScript高频轮询会干扰Cocos引擎加载，需先固定等待再低频轮询
type: feedback
---

Electron运行时验证脚本中，`webContents.executeJavaScript`的高频轮询（如每500ms）会干扰Cocos Creator引擎的场景加载和初始化，导致GameFacade永远无法就绪（GAME_BOOT_TIMEOUT）。

**Why:** 2026-11-09 V6.2运行时验证中发现：500ms间隔轮询`window.__GAME_FACADE__`导致游戏连续3次无法启动；改为先固定等待10秒再每2秒低频轮询后稳定通过。executeJavaScript每次调用都会向渲染器主线程发送求值请求，Cocos的SystemJS模块加载和场景初始化也在主线程执行，高频请求造成争用。

**How to apply:** 创建Electron运行时测试脚本时：
1. 等窗口创建用`browser-window-created`事件Promise，不要在`whenReady()`里立即查`getAllWindows()`（createWindow是async，gameServer.start()耗时）
2. 页面加载后先固定等待8-10秒让Cocos引擎完成初始化
3. 之后如需轮询facade就绪，间隔不低于2秒
4. 检查`setTimeout`延迟创建的DOM元素（如victory/promotion粒子）时，注入的JS需用`new Promise(resolve => setTimeout(resolve, 600))`异步等待
5. 运行前先`taskkill /f /im electron.exe`清理残留进程，残留进程会占用端口和资源导致加载超时