# Live2D AI Android Test

一个用于验证“Live2D 模型 + DeepSeek V4 Flash High + Android App”链路，并逐步制作 Sen 专属 AI 伴侣表现工具的测试项目。

> **AI / 开发者接手前必读：[`docs/LIVE2D_HANDOFF.md`](docs/LIVE2D_HANDOFF.md)**  
> 新发现必须加入细节文档；新功能先标记“已制作·待实机确认”，用户真机认可后才能标记“已实机确认”。

## 当前测试范围

- Android App 内通过 WebView/WebGL 渲染 Cubism 3/4/5 模型
- 未导入离线 Core 时，自动使用 Live2D 官方托管的 Cubism Core for Web
- 从手机文件选择器导入完整 Live2D ZIP，不把模型素材提交到仓库
- 自动寻找 `.model3.json` 并登记 ZIP 内的 `.exp3.json`
- Sen 2K 模型导入时保留原始 2K，同时生成可切换的 1K 流畅副本；原 ZIP 和原始贴图不变
- 固定使用上方约 2/3 模型预览、下方约 1/3 不透明测试面板；聊天面板按需打开
- App 内填写 DeepSeek 兼容 Base URL、API Key、模型 ID
- 默认模型：`deepseek-v4-flash`
- 开启思考模式并发送 `reasoning_effort: high`
- 11 种基础情绪和 8 种对话动作；程序情绪的脸部差值为原设计 1.65 倍，附带头部姿态为 1.3 倍
- 通过 ModelProfile 区分模型参数：迷梦优先写 `ParamAngleX2/Y2/Z2`；Sen 必须写标准 `ParamAngleX/Y/Z`，再由物理生成 X2/Y2/Z2
- 模型调整模式：单指拖动、双指缩放，完成后自动保存位置和大小
- 输入法弹出时保持角色舞台坐标，不再随 WebView 高度变化跳位
- 九宫格触屏跟随：眼睛先到、头部 X/Y/Z 后到、身体 X/Z 再跟随；身体 Y 严格限制，避免拉扁
- 触屏跟随支持“标准／明显／极限”三档，默认明显；档位会保存在本机
- 头部连续滑动触发摸头，支持默认区域和双点校准；1/10 概率出现疑惑彩蛋
- 摸头校准支持头顶窄长方形：最小宽度 8%、最小高度 6%
- 参考 Soullink、my-neuro 与 AIRI 的分层思路，加入非周期微动、随机注视、专注倾听和防重复低频自主动作
- 三档“随风摆动”使用头身不同频率和相位，另有按参考视频编排的展示级环绕动作
- 四个风摆动作只把最终脸部左右转向收至接近“标准跟随”，不削弱身体摆动、头部位置和物理惯性
- 所有参数动作的头部、身体和视线位移统一使用 2 倍幅度；程序情绪单独增强，ZIP 原生表情、呼吸和触屏跟随不乘倍数
- 语义动作导演：LLM只判断赞同、疑惑、庆祝等意图，本地选择具体动作并防止重复
- 表演参数在 motion 后、physics 前写入，使迷梦的头发、衣服和饰品能消费 X2/Y2/Z2 物理输入
- 对模型声明范围和语义安全范围进行双重限幅，降低不同模型参数含义不一致导致的变形
- 固定实体测试面板：26 种动作、11 种情绪，以及 ZIP 自动发现的表情、外观和动作文件
- ZIP 外观／部件使用可持久化的独立开关：多个预设可以叠加，单个预设内部的原作者多参数组合保持不变
- Sen 原生内容分组：13 个用户预设、`daiji` 特效支撑循环、36 个键盘动作；Watermark 与 press 不进入普通预设列表
- 模型诊断显示 moc3 体积、贴图数量/尺寸、估算 RGBA 内存、原生预设与动作数量；顶部状态显示本次舞台加载耗时

当前版本尚未接入 TTS 音频源，因此没有声音驱动的口型。模型已有 `ParamMouthOpenY`，后续可接真实音量口型；该计划和确认状态记录在交接文档中。

## 首次使用

1. 安装 GitHub Actions 生成的 v0.4.0-test debug APK。
2. 点击“导入ZIP”，选择完整 Live2D 模型包；Sen 首次生成 26 张 1K 副本可能需要几分钟。
3. 保持联网，App 会从 Live2D 官方地址加载 Cubism Core。
4. 如需调整构图，点击“调整模型”，单指拖动、双指缩放，再点“完成调整”保存；长按按钮可恢复默认。
5. 在下方固定面板切换“画质：1K流畅／2K高清”，逐个检查参数动作、原生动作和预设。
6. 点击顶部“对话”显示聊天框；打开“API设置”填写 DeepSeek API Key，默认 Base URL 为 `https://api.deepseek.com`。
7. 发送对话，观察文字回复、情绪、动作以及自主待机反馈；点“对话”可再次收起聊天框。

如果需要离线使用，可以从 Cubism SDK for Web 的 `Core/` 目录取得
`live2dcubismcore.min.js`，再点击 App 顶部的“离线Core”导入。

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
