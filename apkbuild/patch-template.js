/*
 * 修补 hbh-web2app 自带的模板 zip。
 *
 * 模板里的 local.properties 写死了作者机器上的 SDK 路径：
 *   sdk.dir=C:\Users\HashirAttari\AppData\Local\Android\Sdk
 * AGP 优先读 sdk.dir，路径不存在就直接报错，不看 ANDROID_HOME。
 * 而 setupWorkflow 每次构建前会清空 temp 目录，解压后再补也没用，
 * 所以只能改 zip 本身。
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const unzip = require("unzipper");

const TEMPLATE_ZIP = path.join(__dirname, "node_modules", "hbh-web2app", "Templates", "webview.zip");
const SDK_ROOT = path.join(__dirname, "android-sdk");
const TMP = path.join(__dirname, "tpl_src");

// Java properties 里 : 和 \ 都要转义，跟原文件保持一致的写法
const sdkDir = SDK_ROOT.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
const LOCAL_PROPS = `sdk.dir=${sdkDir}\n`;

(async () => {
  if (!fs.existsSync(TEMPLATE_ZIP)) throw new Error(`找不到模板：${TEMPLATE_ZIP}`);

  // 备份原文件（只备份一次）
  const backup = TEMPLATE_ZIP + ".orig";
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(TEMPLATE_ZIP, backup);
    console.log(`[备份] ${path.basename(backup)}`);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  await fs.createReadStream(TEMPLATE_ZIP).pipe(unzip.Extract({ path: TMP })).promise();

  const before = fs.readFileSync(path.join(TMP, "local.properties"), "utf8").trim();
  console.log(`[原内容] ${before}`);

  fs.writeFileSync(path.join(TMP, "local.properties"), LOCAL_PROPS);
  console.log(`[新内容] ${LOCAL_PROPS.trim()}`);

  // Compress-Archive 重新打包（Node 没有内置的 zip 写入能力）
  fs.unlinkSync(TEMPLATE_ZIP);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${TMP}\\*' -DestinationPath '${TEMPLATE_ZIP}' -Force"`,
    { stdio: "inherit" }
  );

  // 回读校验：确认解出来的结构和内容都对
  const verify = path.join(__dirname, "tpl_verify");
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
  console.log(`\n[校验] local.properties = ${fs.readFileSync(path.join(verify, "local.properties"), "utf8").trim()}`);
  console.log(`[校验] 关键文件缺失: ${missing.length ? missing.join(", ") : "无"}`);
  if (missing.length) throw new Error("重新打包后模板不完整");

  console.log(`[完成] 模板已修补 (${(fs.statSync(TEMPLATE_ZIP).size / 1024).toFixed(0)}KB)`);
})().catch((e) => {
  console.error("[失败]", e.message);
  process.exit(1);
});
