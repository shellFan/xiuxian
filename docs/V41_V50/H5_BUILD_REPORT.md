# H5 构建与部署报告（H5_BUILD_REPORT）

> 2026-11-23 · Cocos Creator 3.8.4 CLI 构建（platform=web-mobile，70s） · 产物 `release/h5/`

## 1. 产物清单

| 项 | 体积 | 说明 |
|---|---|---|
| index.html | 4KB | 入口（含 loading） |
| cocos-js/ | 5711KB | 引擎（web-mobile 含更多模块，按需加载） |
| assets/ | 7444KB | 业务资源（同微信，含两大 PNG 5MB） |
| src/ | 645KB | 业务代码 |
| style.css / index.js | 8KB | 样式与启动 |
| **合计** | **≈14MB**（首次加载按需 <5MB 目标待压测） | |

## 2. 移动适配现状（代码层，实测依据）

- 视口/安全区：index.html viewport 由 Cocos 生成；safe-area 走 safe-area-service（wx.getSystemInfoSync / web fallback）+ overlay CSS（.ux-root 适配）
- 触摸：CDP 移动模拟（360×640→430×932 六视口）36 页扫描 **0 溢出 0 异常**（V31 mobile-sweep 实证）
- 前后台：platform-service onShow/onHide（visibilitychange）
- 存储：Electron 文件 > sys.localStorage > 内存 三级链路（cocos-bootstrap）；H5 落 localStorage，fail-closed
- 横竖屏：portrait 优先；横屏未强制处理（recorded）

## 3. 部署（Nginx 示例）

```nginx
server {
    listen 443 ssl http2;
    server_name xiuxian.example.com;
    root /var/www/xiuxian-h5;          # = release/h5 目录
    index index.html;

    # 资源带 hash 的长缓存；入口短缓存
    location ~* \.(js|css|png|jpg|webp|plist|wasm)$ { expires 30d; add_header Cache-Control "public, immutable"; }
    location = /index.html { add_header Cache-Control "no-cache"; }

    # 单页游戏入口回退（未知路径回 index.html）
    location / { try_files $uri $uri/ /index.html; }

    # gzip（引擎 JS 3MB 压缩后 ~1MB）
    gzip on; gzip_types application/javascript text/css image/svg+xml; gzip_min_length 1024;
}
```

部署步骤：`rsync release/h5/ → /var/www/xiuxian-h5/` → HTTPS 证书 → 浏览器访问验收（iOS Safari / Android Chrome / 微信内置浏览器三环境人工过一遍核心流）。

## 4. H5 平台约束核对

- **无微信专有 API**：H5 链路 platform-service=web fallback（getSystemInfoSync → web 探测），无 wx.* 直接调用 ✓（平台隔离 5 文件，web-adapter 无 wx）
- 本地存档：localStorage（fail-closed）✓；云存档接口：**未实现**（无后端，不伪造同步——接口抽象已留 PlatformService）
- 加载：引擎 JS 3.1MB gzip 后约 1MB；两大 PNG 5MB 是首屏加载大头 → 同微信优化路径（§大图降分辨率，H5 亦受益）

## 5. 判定

生产构建**有效**、可部署；移动适配经 6 视口实测；首屏体积优化依赖两大图处理（同微信路径）。部署验收需真实 HTTPS 域名（人工）→ **BLOCKED(需部署环境)**，本地产物静态服务已验证可用（V11–V31 探针全程跑在 release 产物上）。
