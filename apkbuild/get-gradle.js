/*
 * services.gradle.org 在这台机器上连不通（连接超时），
 * 但国内镜像有同一个发行版。这里从镜像下载，然后把模板的
 * gradle-wrapper.properties 指向本地文件，wrapper 就不用再出网。
 */
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const { execSync } = require("child_process");
const unzip = require("unzipper");

const ZIP = path.join(__dirname, "gradle-8.13-bin.zip");
const MIRRORS = [
  "https://mirrors.cloud.tencent.com/gradle/gradle-8.13-bin.zip",
  "https://mirrors.huaweicloud.com/gradle/gradle-8.13-bin.zip",
];
// 镜像上的正确大小，用来校验下载完整性
const EXPECTED_SIZE = 136983045;

const TEMPLATE_ZIP = path.join(__dirname, "node_modules", "hbh-web2app", "Templates", "webview.zip");
const MB = 1024 * 1024;

async function download() {
  if (fs.existsSync(ZIP) && fs.statSync(ZIP).size === EXPECTED_SIZE) {
    console.log("[跳过] gradle-8.13-bin.zip 已存在且大小正确");
    return;
  }
  for (const url of MIRRORS) {
    try {
      console.log(`[下载] ${url}`);
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get("content-length")) || 0;
      let got = 0;
      let last = 0;
      const body = Readable.fromWeb(res.body);
      body.on("data", (c) => {
        got += c.length;
        if (Date.now() - last > 1000) {
          last = Date.now();
          process.stdout.write(`\r  ${(got / MB).toFixed(1)}MB / ${(total / MB).toFixed(1)}MB`);
        }
      });
      await pipeline(body, fs.createWriteStream(ZIP));
      process.stdout.write("\n");
      const size = fs.statSync(ZIP).size;
      if (size !== EXPECTED_SIZE) throw new Error(`大小不符：${size} != ${EXPECTED_SIZE}`);
      console.log(`[完成] ${(size / MB).toFixed(1)}MB`);
      return;
    } catch (e) {
      console.log(`\n[镜像失败] ${e.message}，换下一个`);
      fs.rmSync(ZIP, { force: true });
    }
  }
  throw new Error("所有镜像都失败");
}

/* 改模板里的 gradle-wrapper.properties，指向本地 zip */
async function patchWrapper() {
  const TMP = path.join(__dirname, "tpl_src");
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  await fs.createReadStream(TEMPLATE_ZIP).pipe(unzip.Extract({ path: TMP })).promise();

  const propsPath = path.join(TMP, "gradle", "wrapper", "gradle-wrapper.properties");
  console.log("[原内容]\n" + fs.readFileSync(propsPath, "utf8").trim());

  // file:/// 里的冒号在 .properties 里要转义成 \:
  const fileUrl = "file\\:///" + ZIP.replace(/\\/g, "/");
  const content = [
    "distributionBase=GRADLE_USER_HOME",
    "distributionPath=wrapper/dists",
    `distributionUrl=${fileUrl}`,
    "zipStoreBase=GRADLE_USER_HOME",
    "zipStorePath=wrapper/dists",
    "",
  ].join("\n");
  fs.writeFileSync(propsPath, content);
  console.log("[新内容]\n" + content.trim());

  fs.unlinkSync(TEMPLATE_ZIP);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${TMP}\\*' -DestinationPath '${TEMPLATE_ZIP}' -Force"`,
    { stdio: "inherit" }
  );

  // 回读校验
  const verify = path.join(__dirname, "tpl_verify2");
  fs.rmSync(verify, { recursive: true, force: true });
  fs.mkdirSync(verify, { recursive: true });
  await fs.createReadStream(TEMPLATE_ZIP).pipe(unzip.Extract({ path: verify })).promise();

  const readback = fs.readFileSync(path.join(verify, "gradle", "wrapper", "gradle-wrapper.properties"), "utf8");
  console.log("\n[回读]\n" + readback.trim());
  const must = ["gradlew.bat", "gradle/wrapper/gradle-wrapper.jar", "gradle/libs.versions.toml", "settings.gradle", "app/build.gradle", "local.properties"];
  const missing = must.filter((f) => !fs.existsSync(path.join(verify, f)));
  console.log(`[校验] 缺失: ${missing.length ? missing.join(", ") : "无"}`);
  if (missing.length) throw new Error("模板不完整");
}

(async () => {
  await download();
  await patchWrapper();
  console.log("\n[完成] Gradle 已就绪，模板 wrapper 已指向本地文件");
})().catch((e) => {
  console.error("[失败]", e.message);
  process.exit(1);
});
