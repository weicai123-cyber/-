/*
 * 用项目内的 JDK 17 + Android SDK 构建 APK。
 * 环境变量只在本次进程内生效，不改系统设置。
 */
const path = require("path");

const SDK_ROOT = path.join(__dirname, "android-sdk");
const JDK_DIR = path.join(SDK_ROOT, "jdk17");

process.env.JAVA_HOME = JDK_DIR;
process.env.ANDROID_HOME = SDK_ROOT;
process.env.ANDROID_SDK_ROOT = SDK_ROOT;
process.env.PATH = [
  path.join(JDK_DIR, "bin"),
  path.join(SDK_ROOT, "platform-tools"),
  process.env.PATH,
].join(";");

// Gradle 缓存放在项目树【外面】：
// 之前放在 apkbuild/ 里面时，Gradle 的文件系统监视会和 transform 缓存
// 抢文件句柄，mergeReleaseNativeLibs 移动工作区时报
// "Could not move temporary workspace ... to immutable location"。
process.env.GRADLE_USER_HOME = path.join(__dirname, "..", ".gradle-home");

// 关掉 vfs 监视和守护进程，避免 Windows 上重演同一个句柄冲突
process.env.GRADLE_OPTS = "-Dorg.gradle.vfs.watch=false -Dorg.gradle.daemon=false";

console.log("JAVA_HOME   =", process.env.JAVA_HOME);
console.log("ANDROID_HOME=", process.env.ANDROID_HOME);

const { GenerateApp } = require("hbh-web2app");

GenerateApp({
  appName: "番茄钟",
  packageName: "com.mycompany.pomodoro",
  asset: path.join(__dirname, "..", "myapp"),
  // 必须给图标：模板的 mipmap 目录是空的，全靠 generateIcons() 生成
  appIcon: path.join(__dirname, "icon.png"),
})
  .then((apk) => {
    console.log("\n>>> APK:", apk);
  })
  .catch((e) => {
    console.error("\n[构建失败]", e && e.message);
    process.exit(1);
  });
