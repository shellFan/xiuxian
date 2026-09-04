# AI 美术生成 Prompt Pack

状态：后续生图用文字包；本轮没有生成图、没有宣称资源已导入。统一风格锁在此处，生成后必须人工审稿。不要把每张图的随机美术风格当“多样性”。

## 共用母版 P0

每次使用下面完整母版，再追加一个编号需求和其输出要求。使用已批准角色三视图作为参考图（获得后），不同模型/seed记入清单；没有参考图时先做角色基准，不先批量出十级。

> Original cozy mobile game “Niuma Xiuxian”: Chinese contemporary office meets playful cultivation fantasy. Chibi anthropomorphic ox with short blunt horns, broad ox ears, cream muzzle, warm gray-brown fur, human-shaped 2.5-head-tall body, rounded three-finger gloves. Modern office clothes with subtle jade/cloud motifs, witty but kind workplace satire. Warm rice-paper cream, deep ink outlines, muted jade teal, restrained cinnabar and antique gold accents. Clean 2D hand-painted game sprites, readable silhouettes, soft top-left light, consistent 3/4 view, simplified shapes readable at 64 pixels. No text, letters, numerals, watermarks, logos, QR codes, real company marks, copyrighted characters, photorealism, grim gore, shiny 3D plastic, elaborate armor, ornate visual clutter, extra limbs or malformed hands. Decorative symbols only; game labels will be rendered separately.

母版是风格定义，不保证生成器能正确alpha或尺寸；生成后检查背景/边缘，必要时编辑，再人工标APPROVED。不要让模型生成可读中文按钮文字。

## P01 角色基准立绘

> Create the canonical full-body ox office cultivator, relaxed upright pose, tired-but-amused eyebrows, holding an unbranded laptop and a paper ID card. Plain shirt, canvas bag, tiny wooden pencil charm. Three separate aligned front, 3/4, and side views with identical anatomy and palette; clear space between views. No environment, no text. Export concept sheet 1536×1024; then isolate the approved 3/4 pose to a transparent 512×512 sprite, feet at normalized anchor (0.5,0.12). Keep horns fully visible.

## 十职业立绘（P02–P11）

每条=完整P0+以下提示。每图512×512透明背景、同镜头/同体积/同脚底锚；此处服装不是改变真实career title，映射见CHARACTER-VISUAL-GUIDE。

| ID / assetKey | 追加提示 |
|---|---|
| P02 / ui/career/career_01_portrait | Intern ox, loose cream T-shirt under rolled-sleeve shirt, battered canvas bag, temporary paper badge, pencil as an unawakened flying sword. Slightly slouched, hopeful smile, one tiny breath curl. Full body, no desk. |
| P03 / ui/career/career_02_portrait | Regular employee ox, fitted mist-teal shirt, plain lanyard and plastic badge, thermal mug and ordinary keyboard held like a cultivation manual. More confident posture, tiny steam ribbon. Full body, no desk. |
| P04 / ui/career/career_03_portrait | Core contributor ox, blue-teal knitted vest and headset, worn badge, coffee cup and compact dual-monitor talisman hovering near one hand. Busy cheerful expression, minimal glyph light. Full body, no desk. |
| P05 / ui/career/career_04_portrait | Team backbone ox, jade short jacket, small team pin, copper-edge badge, folding fan made of sticky notes. Two floating notes, clean short teal arc, steady stance. Full body, no desk. |
| P06 / ui/career/career_05_portrait | Project backbone ox, dark-teal modern diagonal-collar jacket, timer accessory and project tag, rolled requirements bamboo scroll plus stylus. One page levitating, restrained fine gold edge. Full body, no desk. |
| P07 / ui/career/career_06_portrait | Department backbone ox, ink-blue casual suit, silver-edge badge, KPI scroll with abstract marks and a reversible folding fan. Silver square-shaped glimmer, composed smile. Full body, no desk. |
| P08 / ui/career/career_07_portrait | Department supervisor ox, modern mandarin-collar suit in ink-teal with tiny cinnabar trim, tie pin and silver-copper badge, performance seal and folding fan. Stable half-ring aura, authoritative but friendly. Full body, no desk. |
| P09 / ui/career/career_08_portrait | Department manager ox, sleek long dark suit, gold-edge badge and cufflinks, cloud-pattern book and levitating fountain pen. A single thin antique-gold halo, no royal crown. Full body, no desk. |
| P10 / ui/career/career_09_portrait | Senior manager ox, dark-purple half-cape suit, layered gold badge, jade headset, a flying-sword-shaped laptop and thick OKR tome without letters. Two broken halo segments, calm raised eyebrow. Full body, no desk. |
| P11 / ui/career/career_10_portrait | Regional deputy director ox, modern indigo long coat with gold-white trim and floating badge, seated on a small cloud-like executive chair, signing-pen sword, tiny ox-shaped spirit silhouette behind shoulder. Keep body proportions identical, humorous not tyrannical. Full silhouette and chair inside canvas. |

## 场景与组件（P12–P24）

### P12 办公室背景

> Original vertical office stage, softly worn desk area, muted teal cubicle walls, window with distant city towers and faint cultivation clouds, unbranded monitor, keyboard, takeaway carton, coffee, plant, printer, meeting-room glass and a tiny glowing router. Low contrast center reserved for an interactive 4×4 board added later; no grid or characters, no HUD or text. Soft top-left daylight, cream/teal/ink palette. 750×1667 concept, protect the central 750×1334 crop; extend wall and sky at top rather than stretch furniture.

变体只替换场景等级物件：1掉漆小桌、2开放区、3双屏、4部门资料墙、5独立会客角、6观景高管区、7传送电梯与炼丹咖啡机；构图/透视/光源不变。拆图层参考OFFICE-SCENE-GUIDE，不直接拿整张带UI画面当可点击资源。

### P13 主按钮

> A single clean rounded jade-teal game button blank, subtle rice-paper painted texture, dark ink outline, a restrained bevel painted in 2D. Transparent outside, flat unobstructed center for later text, consistent corners suitable for nine-slice. No icon or lettering. 384×128, safe corner region 24px, create normal and slightly darker pressed as separate aligned assets.

### P14 奖励按钮

> Same geometry as the jade button, antique-gold fill with deep warm ink outline and a small triangular play-symbol recess on the left. Center and right blank for UI text. Cheerful optional reward, no fake close button or urgent red dots. 384×128 transparent, matching 24px corners; no letters or amounts.

### P15 UI Panel / CommonModal

> Cream rice-paper game panel with rounded corners and dark ink contour, subtle cloud motifs only at four corners, clean blank header and content region. Small jade seal ornament separate from text zone. Designed for nine-slice: fixed 32px corners and flat tileable center. 768×768 transparent outside, no text, no buttons baked in.

### P16 境界徽章

> Four separate ox-cultivation badges, identical visual weight: qi as a jade line ring with short horns; foundation as a double jade square and keyboard key; golden core as an antique-gold orb within rounded octagon; nascent spirit as a silver ox silhouette with two broken violet rings. No letters. Each 256×256 transparent, readable at 48px, same outline and top-left light. Deliver each separately, not one atlas with uncontrolled padding.

### P17 成就图标

> A consistent set of office-cultivation achievement icons: paired ox badges joining, coin-filled payslip, folded fish-shaped sticky note, cloud-wrapped keyboard, stamped scroll, tiny office chair, hidden sealed envelope. Cream/teal/ink with rare gold highlights, no text. Each 256×256 transparent with 12% safe padding, same silhouette density; locked placeholder must not reveal hidden achievement subject.

### P18 办公室事件插画

> Small editorial game vignette: chibi ox at a review table facing a comically long blank paper scroll while a coffee cup emits a tiny cultivation cloud. Warm workplace absurdity, not humiliation. No readable text, real brands or charts full of numbers. 512×320; keep faces in central 80%, clear top edge for external title. Produce calm positive, paper-chaos negative, forked-scroll choice, violet rare and playful tiny-stamp egg treatments using the same style.

### P19 工资/灵石 icon

> One antique-gold hexagonal spirit coin clipped to a tiny blank folded payslip, thick ink outline, warm gold highlight top-left, transparent, no currency logo or numbers. 256×256, readable 32px, centered with 12% padding.

### P20 修为 icon

> A compact violet cultivation wisp curling around a jade keyboard key, three clean strokes, soft top-left highlight, thick ink silhouette, transparent 256×256, no text, readable 32px, 12% padding.

### P21 道心 icon

> A jade heart-shaped lotus with two small ox-horn leaves, calm warm center, simple ink outline, transparent 256×256, no text, readable 32px. Same light and padding as salary icon.

### P22 KPI icon

> A short cream paper scroll with one large cinnabar checkmark-like abstract seal, dark ink ends, no real writing or percentages, transparent 256×256, readable 32px, same light and padding.

### P23 合成特效帧

> Four separate aligned frames of two small jade strokes meeting at a central ox-horn seal, followed by a tiny antique-gold sparkle and fade. No explosion, smoke wall or screen flash. Each 256×256 transparent with same center anchor and scale, no text. Never render worker movement into this effect; UI controls target alignment.

### P24 教程指针

> A rounded cream three-finger game glove pointing downward with a short jade cuff, dark ink outline, gentle helpful pose, transparent 128×128. No human photorealism, no text, no extra fingers. Clear silhouette at 48px.

## 人工整合关卡

先P01→确认剪影与色板→P02/P06/P11三档验证成长→再批量其余职业→图标与Panel→背景。每批最多5项审查，按角色比例/光源/描边/可读性/主题五栏评定，任一不符重做；不能因为文件数量齐了就交付。

生成图不能代替Prefab、动画绑定和安全区实现。九宫格拉伸、透明边、颜色对比、64px小图、长屏裁剪在Cocos中实测；音效使用独立原创制作计划，不把图像prompt当音频。
