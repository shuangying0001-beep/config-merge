---
name: "多环境配置合并校验工具（默认/系统/任务三层）"
display_name: 配置分层合并校验
description: "把 default/system/task 三层配置按优先级合并校验，自动修冲突、出 diff、可回滚。适合 dev/test/prod 多环境管理的后端/运维。"
market_desc: 多来源配置不再打架——default / system / task 三层自动合并，字段级校验 + 冲突自动修复（比如最大延迟小于最小延迟时自动纠正），还能快照存档、diff 对比、dry-run 预演。做有配置系统的工具/采集器/RPA 时直接复用，零依赖。
version: 1.0.1
---

# config-merge —— 配置分层合并与校验

> 把「默认值 / 系统配置 / 任务配置」三层合并成一份最终配置，自动校验、自动修复冲突，并支持快照与 diff。
> 纯函数实现（Node ESM，零依赖，仅用内置 `node:crypto`）。schema 可注入。

## 适用场景

- 有「全局默认 + 用户设置 + 单次任务参数」三层配置的工具 / 服务
- 配置冲突需要自动修复（如 `delayMax < delayMin` → 自动纠正）
- 任务前 dry-run 预演、配置版本快照与回归 diff

## 提供的函数

| 函数 | 说明 |
|------|------|
| `resolveConfig({defaults,system,task,schema?})` | 三层合并 + 校验 + 自动修复，返回含 `_meta`/`configHash` 的结果 |
| `diffConfigs(c1, c2)` | 对比两份配置，返回差异字段列表 |
| `configSnapshot(resolved)` / `configFromSnapshot(str)` | 快照存档 / 恢复 |
| `freezeConfig(resolved)` | 冻结为不可变快照 |
| `runAssertions(resolved, fns)` | 运行断言集合（dry-run 验证） |
| `commonAssertions` | 常用断言构造器：`range` / `gte` / `truthy` |

schema 字段规则：
- `systemOnly: true` —— 该字段任务层不可覆盖（只取系统/默认）
- `validator(v)` —— 值校验，不合法则跳过该来源
- `autoFix(resolved)` —— 返回 `{value, message}` 时自动修正并记录冲突

## 用法

```js
import { resolveConfig, diffConfigs, runAssertions, commonAssertions } from './scripts/config-merge.mjs';

const resolved = resolveConfig({
  defaults: { maxPages: 10, delayMin: 3000, delayMax: 8000 },
  system:   { delayMin: 5000 },
  task:     { maxPages: 5, delayMax: 1000 },  // delayMax 小于 delayMin，会被自动修复
  schema: {
    delayMax: { autoFix: (r) => r.delayMax < r.delayMin
      ? { value: r.delayMin + 2000, message: '最大延迟小于最小延迟，已自动修正' } : null },
  },
});
// resolved.delayMax === 7000; resolved._meta.conflicts 含一条自动修复记录

const check = runAssertions(resolved, [commonAssertions.gte('delayMax', 'delayMin')]);
// check.success === true
```

## 设计要点

- 优先级严格 `task > system > default`；校验失败跳过该来源降级取下一层。
- 所有自动修复都会写入 `_meta.conflicts`（标记 `autoFixed:true`），便于审计。
- `configHash` 由配置内容生成（不含 `_meta`），可用于缓存失效判断。

## 自测

```bash
node scripts/config-merge.mjs --selftest
```
