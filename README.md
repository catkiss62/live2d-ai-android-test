# Live2D AI Android Test

一个用于验证“Live2D 模型 + DeepSeek V4 Flash High + Android App”链路的最小测试项目。

## 第一版范围

- Android App 内通过 WebView/WebGL 渲染 Cubism 3/4/5 模型
- 从手机文件选择器导入完整 Live2D ZIP，不把模型素材提交到仓库
- 自动寻找 `.model3.json` 并登记 ZIP 内的 `.exp3.json`
- 半透明聊天面板，模型被局部遮挡属于测试设计
- App 内填写 DeepSeek 兼容 Base URL、API Key、模型 ID
- 默认模型：`deepseek-v4-flash`
- 开启思考模式并发送 `reasoning_effort: high`
- 11 种基础情绪和 8 种对话动作
- 针对“迷梦”模型优先使用 `ParamAngleX2/Y2/Z2` 等实际参数

## 首次使用

1. 安装 GitHub Actions 生成的 debug APK。
2. 从 Live2D 官方下载 Cubism SDK for Web，并接受对应许可。
3. 从 SDK 的 `Core/` 目录取出 `live2dcubismcore.min.js`。
4. 在 App 顶部点击“导入Core”，选择该文件。
5. 点击“导入模型ZIP”，选择完整 Live2D 模型包，例如 `1083.【迷梦】.zip`。
6. 打开“API设置”，填写 DeepSeek API Key；默认 Base URL 为 `https://api.deepseek.com`。
7. 发送对话，观察文字回复、情绪和动作反馈。

## 为什么仓库不包含 Cubism Core

Cubism Core 是 Live2D 专有运行库，官方不允许直接将 Core 源文件放进公共 GitHub 仓库。测试者需要从官方 SDK 获取并在 App 内导入。代码与模型授权彼此独立。

## 模型文件

仓库不包含任何 Live2D 模型、贴图、`.moc3` 或第三方美术素材。App 在设备本地解压用户选择的 ZIP，导入内容保存在 App 私有目录。

## 构建

GitHub Actions 会先构建 Vite/Pixi Live2D 舞台，再使用 Gradle 构建 APK。也可以本地执行：

```bash
cd frontend
npm ci
npm run build
cd ..
gradle :app:assembleDebug
```

本项目仅用于技术验证，不代表对任何第三方 Live2D 模型提供再分发或商业使用授权。
