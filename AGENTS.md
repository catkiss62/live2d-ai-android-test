# AI 接手须知

开始修改前必须完整阅读：

1. `docs/LIVE2D_HANDOFF.md`：当前实现、模型特殊点、测试确认状态和后续任务。
2. `model-profiles/mimeng.json`：迷梦模型的机器可读参数档案。
3. `README.md`：构建、授权和导入方式。

## 强制维护规则

- 发现新的模型参数、变形风险、动作规律或真机差异时，必须加入 `docs/LIVE2D_HANDOFF.md`。
- 新功能制作时先登记为 **已制作·待实机确认**，不能因为编译通过就标为确认。
- 只有用户明确反馈真机效果可用或满意后，才能改为 **已实机确认**。
- 用户反馈有问题时标为 **需调整**，记录表现和下一次尝试，避免重复打补丁。
- 不要把 Live2D 模型、Cubism Core 或用户 API Key 提交到公开仓库。
- 迷梦优先写入 `ParamAngleX2/Y2/Z2`；不要随意改回普通 `ParamAngleX/Y/Z`。
- `ParamBodyAngleY` 必须保持极小限幅。该模型曾因身体 Y 过大出现压扁/拉伸。

## 修改与交付

- 修改前先在交接文档的“本轮待确认”登记目标。
- 前端必须运行 `cd frontend && npm run build`。
- Android 版本号、界面版本、README 和 Actions 成功提示必须一起更新。
- 生成 APK 后验证它是带签名块的 Android APK，并确认新前端代码确实打入包内。
