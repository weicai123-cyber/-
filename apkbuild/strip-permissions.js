/*
 * 砍掉模板 AndroidManifest.xml 里用不上的权限。
 *
 * 番茄钟只从 assets/www/index.html 用 file:// 加载自己的页面，
 * 不联网、不读写外部存储、不调用相机 —— 一条权限都不需要。
 * 留着它们只会在安装时弹一堆吓人的授权提示。
 *
 * 和 patch-template.js 一样必须改 zip 本身：setupWorkflow 每次构建前
 * 会清空 temp 目录重新解压，解压后再改是白改。
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const unzip = require("unzipper");

const TEMPLATE_ZIP = path.join(__dirname, "node_modules", "hbh-web2app", "Templates", "webview.zip");
const TMP = path.join(__dirname, "tpl_perm");
const MANIFEST = path.join(TMP, "app", "src", "main", "AndroidManifest.xml");

// 要删的权限。注意 DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION 不在这里 ——
// 它是 androidx.core 在构建时由 manifest merger 自己塞进去的，删不掉也不用管。
const DROP = [
  "android.permission.CAMERA",
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
];

const grab = (xml) =>
  [...xml.matchAll(/<uses-permission\b[^>]*\/>/g)].map((m) => {
    const name = /android:name\s*=\s*"([^"]+)"/.exec(m[0]);
    return { raw: m[0], name: name ? name[1] : "?" };
  });

(async () => {
  if (!fs.existsSync(TEMPLATE_ZIP)) throw new Error(`找不到模板：${TEMPLATE_ZIP}`);

  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  await fs.createReadStream(TEMPLATE_ZIP).pipe(unzip.Extract({ path: TMP })).promise();

  let xml = fs.readFileSync(MANIFEST, "utf8");
  const before = grab(xml);
  console.log(`[原有] ${before.length} 条：`);
  before.forEach((p) => console.log(`   ${p.name}`));

  // 顺带把权限上方那几行 <!-- Internet --> 之类的注释也带走，
  // 否则删完注释就变成悬空的废话
  const comments = [
    /\s*<!--\s*Internet\s*-->/gi,
    /\s*<!--\s*Network check\s*-->/gi,
    /\s*<!--\s*Downloads\s*-->/gi,
    /\s*<!--\s*File upload \/ camera support\s*-->/gi,
  ];
  comments.forEach((re) => (xml = xml.replace(re, "")));

  let dropped = 0;
  xml = xml.replace(/[ \t]*<uses-permission\b[^>]*\/>\s*\n?/g, (m) => {
    const name = /android:name\s*=\s*"([^"]+)"/.exec(m);
    if (name && DROP.includes(name[1])) {
      dropped++;
      return "";
    }
    return m;
  });

  // 删干净之后 <manifest> 开标签和 <application> 之间会留一坨空行
  xml = xml.replace(/\n{3,}/g, "\n\n");

  fs.writeFileSync(MANIFEST, xml);
  console.log(`\n[删除] ${dropped} 条`);

  const after = grab(xml);
  console.log(`[剩余] ${after.length} 条：`);
  after.forEach((p) => console.log(`   ${p.name}`));
  if (after.length) {
    const leftover = after.filter((p) => DROP.includes(p.name));
    if (leftover.length) throw new Error(`还有没删掉的：${leftover.map((p) => p.name).join(", ")}`);
  }

  // 重新打包（Node 没有内置 zip 写入能力）
  fs.unlinkSync(TEMPLATE_ZIP);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${TMP}\\*' -DestinationPath '${TEMPLATE_ZIP}' -Force"`,
    { stdio: "inherit" }
  );

  // 回读校验：确认解出来的结构和权限都对
  const verify = path.join(__dirname, "tpl_perm_verify");
  fs.rmSync(verify, { recursive: true, force: true });
  fs.mkdirSync(verify, { recursive: true });
  await fs.createReadStream(TEMPLATE_ZIP).pipe(unzip.Extract({ path: verify })).promise();

  const need = [
    "gradlew.bat",
    "gradlew",
    "gradle/wrapper/gradle-wrapper.jar",
    "gradle/wrapper/gradle-wrapper.properties",
    "gradle/libs.versions.toml",
    "settings.gradle",
    "app/build.gradle",
    "app/src/main/AndroidManifest.xml",
    "KeyStore/HBH",
  ];
  const missing = need.filter((f) => !fs.existsSync(path.join(verify, f)));
  const recheck = grab(fs.readFileSync(path.join(verify, "app", "src", "main", "AndroidManifest.xml"), "utf8"));
  console.log(`\n[校验] 关键文件缺失: ${missing.length ? missing.join(", ") : "无"}`);
  console.log(`[校验] 回读权限数: ${recheck.length}`);
  if (missing.length) throw new Error("重新打包后模板不完整");
  if (recheck.some((p) => DROP.includes(p.name))) throw new Error("回读仍有被删权限");

  console.log(`[完成] 模板已清理 (${(fs.statSync(TEMPLATE_ZIP).size / 1024).toFixed(0)}KB)`);
})().catch((e) => {
  console.error("[失败]", e.message);
  process.exit(1);
});
