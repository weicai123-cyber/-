/*
 * 生成 512x512 番茄图标。
 * 模板要求提供 appIcon，否则 generateIcons() 不跑，
 * mipmap 里就是空的，AAPT 会报 ic_launcher_foreground not found。
 *
 * 这是自适应图标的前景层：内容必须收在中心 66% 的圆里，
 * 否则启动器裁切时会切掉边缘。
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <g transform="translate(256,278)">
    <ellipse cx="0" cy="0" rx="118" ry="108" fill="#ff6b5a"/>
    <ellipse cx="-40" cy="-34" rx="34" ry="23" fill="#ffffff" opacity="0.42"/>
    <ellipse cx="-58" cy="6" rx="14" ry="9" fill="#ffffff" opacity="0.26"/>
  </g>
  <rect x="247" y="122" width="18" height="52" rx="9" fill="#2fd07f"/>
  <g transform="translate(256,174)" fill="#2fd07f">
    <ellipse cx="0" cy="-24" rx="12" ry="28"/>
    <ellipse cx="0" cy="-24" rx="12" ry="28" transform="rotate(32)"/>
    <ellipse cx="0" cy="-24" rx="12" ry="28" transform="rotate(-32)"/>
    <ellipse cx="0" cy="-24" rx="11" ry="25" transform="rotate(64)"/>
    <ellipse cx="0" cy="-24" rx="11" ry="25" transform="rotate(-64)"/>
  </g>
</svg>`;

const OUT = path.join(__dirname, "icon.png");

sharp(Buffer.from(SVG))
  .resize(512, 512)
  .png()
  .toFile(OUT)
  .then(() => {
    const st = fs.statSync(OUT);
    console.log(`[完成] ${OUT}  ${st.size} 字节`);
  })
  .catch((e) => {
    console.error("[失败]", e.message);
    process.exit(1);
  });
