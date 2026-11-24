# 红莉栖标识素材

2026-11-25，按用户要求使用内置 `image_gen`（imagegen 技能）生成 Q 版牧濑红莉栖头像，透明背景。未使用 CLI/API fallback，也没有引入运行时图片服务。

- `kurisu-avatar.png`：256 × 256，侧栏。
- `kurisu-favicon-32.png`：32 × 32，浏览器页签。
- `kurisu-favicon-16.png`：16 × 16，ICO 的小尺寸来源。
- `kurisu-icon-192.png`：192 × 192，高分辨率图标。
- `kurisu-apple-touch-icon.png`：180 × 180，收藏到主屏幕。
- `favicon.ico`：封装 16／32 两档 PNG，兼容默认图标请求。

派生 PNG 由 macOS `sips` 等比例缩小原始方图，保留透明度；ICO 仅打包派生 PNG。所有界面引用均使用仓库内资源。

## 最终生成提示词

```text
Use case: logo-brand. Asset type: square app mascot avatar used at 40 pixels in a developer workbench sidebar and at 16–32 pixels as browser favicon. Primary request: a beautifully drawn chibi Makise Kurisu (红莉栖) from Steins;Gate, recognizable long auburn reddish-brown hair with her side swept bangs, expressive blue eyes, white shirt collar and red necktie with a little beige jacket at shoulders. Only head and tiny upper shoulders, oversized face, friendly confident subtle smile, slightly tsundere personality. Style: polished clean anime chibi icon, bold smooth dark brown outlines, large simple shapes, flat colors with restrained cel shading. Composition: perfectly centered face filling most of square canvas, symmetrical enough to read at favicon size, all hair safely inside a small 5% margin. Transparent background, crisp alpha edges. No text, letters, watermark, props, frame, gradients or busy background. Warm auburn hair should dominate the silhouette; premium cute character avatar.
```
