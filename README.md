# 配置分层合并校验 · config-merge

> 多来源配置不再打架——default / system / task 三层自动合并，字段级校验 + 冲突自动修复，还能快照存档、diff 对比、dry-run 预演。

把「默认值 / 系统配置 / 任务配置」三层合并成一份最终配置，自动校验、自动修复冲突（如 `delayMax < delayMin` → 自动纠正），并支持快照与 diff。纯函数实现（Node ESM，零依赖，仅用内置 `node:crypto`），schema 可注入。

## 适用场景
- 有「全局默认 + 用户设置 + 单次任务参数」三层配置的工具 / 服务
- 配置冲突需要自动修复
- 任务前 dry-run 预演、配置版本快照与回归 diff

## 作为 AI 技能使用
本仓库是一个 AI Agent Skill。将 `SKILL.md` 放入 Agent 的 skills 目录即可启用；`scripts/`、`references/`、`assets/` 为配套资源。

## 许可
MIT — 可自由用于商业与个人项目。

---
由教备神器自动发布。欢迎提 PR / Issue。