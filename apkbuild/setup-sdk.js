/*
 * 项目内安装 JDK 17 + Android SDK（不碰系统 PATH / JAVA_HOME）
 * 只在这个脚本和后续构建的子进程里临时设置环境变量。
 */
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const { execSync } = require("child_process");
const unzip = require("unzipper");

const SDK_ROOT    = path.join(__dirname, "android-sdk");
const JDK_DIR     = path.join(SDK_ROOT, "jdk17");
const CMDLINE_DIR = path.join(SDK_ROOT, "cmdline-tools", "latest");

const JDK_URL =
  "https://download.java.net/java/GA/jdk17.0.1/2a2082e5a09d4267845be086888add4f/12/GPL/openjdk-17.0.1_windows-x64_bin.zip";
const CMDTOOLS_URL =
  "https://dl.google.com/android/repository/commandlinetools-win-9477386_latest.zip";

// 模板是 compileSdk 36，AGP 8.13 默认 build-tools 35 —— 都装上，避免构建中途再下载
const COMPONENTS = [
  "platform-tools",
  "platforms;android-36",
  "platforms;android-34",
  "build-tools;35.0.0",
  "build-tools;34.0.0",
];

const MB = 1024 * 1024;

/* fetch 自动跟随重定向，比包自带的 https.get 版本可靠 */
async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`[跳过] ${path.basename(dest)} 已存在`);
    return;
  }
  console.log(`[下载] ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} <- ${url}`);

  const total = Number(res.headers.get("content-length")) || 0;
  let got = 0;
  let last = 0;
  const body = Readable.fromWeb(res.body);
  body.on("data", (c) => {
    got += c.length;
    if (Date.now() - last > 1000) {
      last = Date.now();
      const pct = total ? ` (${((got / total) * 100).toFixed(1)}%)` : "";
      process.stdout.write(`\r  ${(got / MB).toFixed(1)}MB / ${(total / MB).toFixed(1)}MB${pct}   `);
    }
  });

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(body, fs.createWriteStream(dest));
  process.stdout.write("\n");

  const size = fs.statSync(dest).size;
  if (size === 0) throw new Error(`下载结果是 0 字节：${url}`);
  console.log(`[完成] ${path.basename(dest)}  ${(size / MB).toFixed(1)}MB`);
}

/* 解压后把唯一的顶层目录搬到 target（jdk-17.0.1 -> jdk17，cmdline-tools -> latest） */
async function extractSingleRoot(zipPath, target) {
  const tmp = path.join(SDK_ROOT, "tmp_extract");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  await fs.createReadStream(zipPath).pipe(unzip.Extract({ path: tmp })).promise();

  const entries = fs.readdirSync(tmp);
  if (entries.length !== 1) throw new Error(`压缩包顶层不唯一：${entries.join(", ")}`);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(path.join(tmp, entries[0]), target);
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* 后续构建也要用这套环境变量 */
function buildEnv() {
  return {
    ...process.env,
    JAVA_HOME: JDK_DIR,
    ANDROID_HOME: SDK_ROOT,
    ANDROID_SDK_ROOT: SDK_ROOT,
    PATH: `${path.join(JDK_DIR, "bin")};${path.join(SDK_ROOT, "platform-tools")};${path.join(CMDLINE_DIR, "bin")};${process.env.PATH}`,
  };
}

(async () => {
  try {
    console.log("=== 1/3 安装 OpenJDK 17 ===");
    if (!fs.existsSync(JDK_DIR)) {
      const zip = path.join(SDK_ROOT, "jdk17.zip");
      await download(JDK_URL, zip);
      await extractSingleRoot(zip, JDK_DIR);
      fs.unlinkSync(zip);
    } else {
      console.log("[跳过] jdk17 已存在");
    }

    console.log("\n=== 2/3 安装 Android command-line tools ===");
    if (!fs.existsSync(CMDLINE_DIR)) {
      const zip = path.join(SDK_ROOT, "cmdline-tools.zip");
      await download(CMDTOOLS_URL, zip);
      await extractSingleRoot(zip, CMDLINE_DIR);
      fs.unlinkSync(zip);
    } else {
      console.log("[跳过] cmdline-tools 已存在");
    }

    const env = buildEnv();
    console.log("\n=== 验证 JDK 17 ===");
    console.log(execSync(`"${path.join(JDK_DIR, "bin", "java")}" -version`, { env }).toString().trim());

    const sdkmanager = path.join(CMDLINE_DIR, "bin", "sdkmanager.bat");

    console.log("\n=== 3/3 接受 SDK 许可 ===");
    execSync(`"${sdkmanager}" --sdk_root="${SDK_ROOT}" --licenses`, {
      env,
      stdio: ["pipe", "inherit", "inherit"],
      input: "y\n".repeat(80),
    });

    console.log("\n=== 安装 SDK 组件 ===");
    execSync(`"${sdkmanager}" --sdk_root="${SDK_ROOT}" ${COMPONENTS.map((c) => `"${c}"`).join(" ")}`, {
      env,
      stdio: "inherit",
    });

    console.log("\n=== 安装完成 ===");
    execSync(`"${sdkmanager}" --sdk_root="${SDK_ROOT}" --list_installed`, { env, stdio: "inherit" });
    console.log(`\nSDK 根目录: ${SDK_ROOT}`);
  } catch (e) {
    console.error("\n[失败]", e.message);
    process.exit(1);
  }
})();
