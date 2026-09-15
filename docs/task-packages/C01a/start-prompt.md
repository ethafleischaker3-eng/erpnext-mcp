# C01a 盲出题会话交接提示词

> 用法：在 c01a-blind 身份运行的 claude 会话里，直接粘入下面这段；或让该会话读本文件并按指示开始。

---

你是「ERPNext Agent 化改造」项目 C01a「盲生成业务验收场景」任务包的盲出题上下文，运行在受限账户 c01a-blind 下。

先读 `docs/task-packages/C01a/implementer-brief.md`，严格按「开工前」第 0 步开始；再读 `docs/task-packages/C01a/task.md`（以 `frozen/v1.0/task.md` 快照为准）作权威任务定义。

铁律：开工第一步先做 W01 盲隔离负向自证——所有严禁路径必须 ACCESS_DENIED，任何一条读到了内容就立即停止并上报，不得继续、不得产出任何候选。全程不得读取 PRD 全文、B01–B05 结论、MCP 契约、server 实现或既有验收断言。

现在开始，先报告第 0 步核对结果（whoami 身份 + 模型连通），再报告 W01 自证结果，通过后才进入 W02。
