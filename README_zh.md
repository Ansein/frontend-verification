# 前端验收 Skill

`frontend-verification` 是一套可移植的前端验收协议，并以 Codex Skill 的形式打包。它也可以被 Claude Code、OpenCode 等 coding agent 复用，让前端或全栈开发任务在完成前进入浏览器验收闭环，而不是只停留在“构建通过”或“测试通过”。

它适合用于 coding agent 修改 UI、路由、样式、表单、接口联调、加载态、空状态、错误态、鉴权流程，或者修改了会影响前端页面表现的后端行为。

## 多模态要求

如果要做真正的视觉验收，执行该流程的 agent 或 reviewer LLM 应该具备多模态能力，这样才能检查截图和可见 UI 状态。纯文本 agent 仍然可以运行命令、收集日志、报告缺失证据，但无法可靠判断截图里的布局破损、空白页、裁切、重叠或视觉回归。

## 它解决什么问题

很多 agent 默认工作流是：

```text
改代码 -> 跑构建/测试 -> 根据终端报错修复 -> 声明完成
```

但人类前端程序员还会做：

```text
打开页面 -> 看控制台 -> 点几下 -> 看网络请求 -> 看 UI 有没有坏 -> 截图或复查
```

这个 Skill 的目标就是把第二段流程工程化，让 agent 在完成前必须实际验证受影响页面路径。

## 当前能力

- 探测目标项目已有的前端验收配置。
- 判断 package manager、可用 scripts、Playwright 配置和 E2E 目录。
- 优先使用目标项目已有的 `agent:verify` 命令。
- 在没有统一命令时，运行最接近的 typecheck、lint、build、test、Playwright 检查。
- 在可用时使用 Chrome DevTools MCP 或 Playwright MCP。
- 在没有 MCP 时，降级使用 Playwright CLI 或报告缺失前置条件。
- 在支持 subagent 的 Codex 环境中，可以采用 Builder / Reviewer 分离工作流。
- 要求打开受影响页面并实际执行用户路径。
- 检查 console error、page error、关键 network failure、空白页、交互失效和明显布局破损。
- 输出固定格式的 `PASS` / `FAIL` 验收报告。

## 项目结构

```text
frontend-verification/
  SKILL.md
  agents/
    openai.yaml
  scripts/
    detect_frontend_setup.mjs

README.md
README_zh.md
```

真正的 Skill 包是 `frontend-verification/` 目录。根目录下的 README 只是项目说明，不是 Codex 运行 Skill 时必须读取的文件。

## 快速测试

对任意前端项目运行只读探测脚本：

```bash
node frontend-verification/scripts/detect_frontend_setup.mjs --project <project-root> --json
```

对当前目录运行：

```bash
node frontend-verification/scripts/detect_frontend_setup.mjs --project . --json
```

这个脚本不会安装依赖、不会启动服务、不会修改文件。它只会报告：

- 检测到的 package manager
- 已有项目 scripts
- 建议运行的验证命令
- 建议使用的启动命令
- Playwright 是否安装
- 是否存在 Playwright config
- 是否存在 E2E 测试目录
- 缺少哪些前端验收前置条件

## 推荐的 AGENTS.md 规则

在目标项目的 `AGENTS.md` 里写：

```text
Use the `frontend-verification` skill for every frontend or full-stack change.

Do not mark the task complete until the changed user path has been verified in a browser and `npm run agent:verify` passes when available.
```

中文项目也可以写：

```text
凡是涉及前端或全栈用户路径的修改，完成前必须使用 `frontend-verification` Skill。

只有在变更过的用户路径已经通过浏览器实际验收，并且可用时 `npm run agent:verify` 通过后，任务才算完成。
```

## 目标项目的理想配置

推荐目标项目逐步具备：

```text
package.json 里有 npm run agent:verify
有 Playwright config
有一个核心路由或变更路由的 smoke test
AGENTS.md 里有触发本 Skill 的规则
可选：配置 Chrome DevTools MCP 做真实浏览器检查
```

这个 Skill 不会假设这些东西已经存在。缺失时，它应该先使用项目已有检查，并在报告中说明缺少什么，而不是为了普通功能修改偷偷安装依赖。

## 验收流程

1. 识别受影响的路由、组件、用户动作和预期状态。
2. 对目标项目运行 `scripts/detect_frontend_setup.mjs`。
3. 如果存在 `agent:verify`，优先运行它。
4. 如果没有统一命令，运行最接近的 typecheck、lint、build、test、Playwright 检查。
5. 用项目已有的 `dev`、`dev:all`、`start`、`preview` 等脚本启动应用。
6. 在浏览器中打开受影响路径。
7. 实际执行变更过的用户路径。
8. 对可见 UI 修改保存截图。
9. 对重要用户行为新增或更新聚焦的 E2E 测试。
10. 输出 `PASS` 或 `FAIL` 报告。

## Builder / Reviewer Subagent 工作流

如果当前 Codex 环境支持启动 subagent，推荐把开发和验收拆开：

```text
Builder agent
  -> 修改代码
  -> 运行基础检查
  -> 交给 reviewer subagent 验收

Reviewer subagent
  -> 使用 $frontend-verification
  -> 探测项目验证配置
  -> 运行检查和浏览器验收
  -> 带证据返回 PASS / FAIL 报告

Builder agent
  -> 根据 reviewer 发现的问题修复
  -> 必要时再次请求验收
```

Reviewer 应该保持 review 姿态：运行检查、启动应用、打开受影响浏览器路径、保存截图或测试产物、报告问题。除非主 agent 明确要求它修复，否则 reviewer 不应该修改源代码。

推荐 reviewer prompt：

```text
Use $frontend-verification to review this frontend/full-stack change.

Project root: <project-root>
Original request: <user request>
Changed files or summary: <summary>
Likely affected route/user flow: <route or flow if known>

Do not modify source files. Run the available verification checks, inspect the affected path in a browser when possible, and return the standard frontend verification report with PASS or FAIL.
```

如果当前环境不能启动 subagent，主 agent 仍然必须自己执行同一套验收流程，不能因为没有 reviewer 就跳过浏览器检查。

## 验收报告格式

```text
Frontend verification report

Changed route/path:
Setup detected:
Reviewer mode:
User flow checked:
Commands run:
Browser tool used:
Console errors:
Network failures:
Screenshots:
E2E result:
Remaining risks:
Final status: PASS / FAIL
```

只有当变更过的浏览器路径已经实际验收，并且相关检查干净时，才能写 `PASS`。

## 校验 Skill

校验 Skill 结构：

```bash
python C:/Users/16928/.codex/skills/.system/skill-creator/scripts/quick_validate.py frontend-verification
```

检查探测脚本语法：

```bash
node --check frontend-verification/scripts/detect_frontend_setup.mjs
```
