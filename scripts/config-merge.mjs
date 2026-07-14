// config-merge —— 配置分层合并 + 快照 + diff + dry-run 断言
// 从 caijiqi-kaifa/electron/config/resolver.ts + dry-run.ts 抽取并通用化。
// 纯函数（Node ESM，零依赖，仅用内置 node:crypto）。schema 可注入。

import { createHash } from 'node:crypto';

/**
 * 三层合并解析器
 * @param {object} params
 *   defaults {object}  最低优先级（兜底值）
 *   system  {object}  系统配置（中优先级）
 *   task    {object}  任务配置（最高优先级）
 *   schema  {object}  可选，字段规则：
 *      { field: { systemOnly?, validator?(v), autoFix?(resolved)=>{value,message}|null } }
 * @returns 解析后的配置对象，含 _meta（fieldSources / conflicts）、configHash、resolvedAt
 */
export function resolveConfig({ defaults = {}, system = {}, task = {}, schema = {} } = {}) {
  const fieldSources = {};
  const conflicts = [];

  const keys = new Set([
    ...Object.keys(defaults),
    ...Object.keys(system),
    ...Object.keys(task),
    ...Object.keys(schema),
  ]);

  const resolved = {};

  const recordSource = (field, finalValue, source, systemValue, taskValue, overrideReason) => {
    fieldSources[field] = { source, finalValue, systemValue, taskValue, overrideReason };
  };

  for (const field of keys) {
    const rule = schema[field] || {};
    const defaultV = defaults[field];
    const systemV = system[field];
    const taskV = task[field];

    // systemOnly：忽略任务层覆盖
    const effectiveTaskV = rule.systemOnly ? undefined : taskV;

    const pick = (v, src, sysV, tV) => {
      if (v !== undefined && v !== null) {
        if (!rule.validator || rule.validator(v)) {
          recordSource(field, v, src, sysV, tV, src === 'task' ? 'task.override' : undefined);
          return v;
        }
      }
      return undefined;
    };

    let value =
      pick(effectiveTaskV, 'task', systemV, taskV) ??
      pick(systemV, 'system', systemV, taskV) ??
      pick(defaultV, 'default', systemV, taskV);

    if (value === undefined) value = defaultV; // 最终兜底
    resolved[field] = value;
  }

  // 自动修正钩子（冲突检测 + 修复）
  for (const [field, rule] of Object.entries(schema)) {
    if (typeof rule.autoFix === 'function') {
      const fix = rule.autoFix(resolved);
      if (fix && fix.value !== resolved[field]) {
        const original = resolved[field];
        resolved[field] = fix.value;
        conflicts.push({
          field,
          message: fix.message || '已自动修正',
          autoFixed: true,
          originalValue: original,
          fixedValue: fix.value,
        });
        if (fieldSources[field]) {
          fieldSources[field].finalValue = fix.value;
          fieldSources[field].overrideReason = 'autoFix';
        }
      }
    }
  }

  const configForHash = { ...resolved };
  const configHash = createHash('md5').update(JSON.stringify(configForHash)).digest('hex').slice(0, 8);

  return {
    ...resolved,
    _meta: { fieldSources, conflicts, systemConfig: system, taskConfig: task },
    configHash,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * 冻结为不可变快照
 */
export function freezeConfig(resolved) {
  return Object.freeze({ ...resolved });
}

/**
 * 生成配置快照 JSON（不含 _meta）
 */
export function configSnapshot(resolved) {
  const snap = { ...resolved };
  delete snap._meta;
  return JSON.stringify(snap);
}

/**
 * 从快照恢复
 */
export function configFromSnapshot(snapshot) {
  return JSON.parse(snapshot);
}

/**
 * 比较两个配置的差异
 */
export function diffConfigs(c1, c2) {
  const diffs = [];
  const keys = new Set([...Object.keys(c1), ...Object.keys(c2)]);
  for (const k of keys) {
    if (k === '_meta' || k === 'configHash' || k === 'resolvedAt') continue;
    const v1 = c1[k], v2 = c2[k];
    if (JSON.stringify(v1) !== JSON.stringify(v2)) diffs.push({ field: k, value1: v1, value2: v2 });
  }
  return diffs;
}

/**
 * 运行断言集合（dry-run 验证）
 * @param {object} resolved resolveConfig 的结果
 * @param {Array<Function>} assertions 每个返回 {name, condition, expected, actual, passed, message}
 */
export function runAssertions(resolved, assertions = []) {
  const results = assertions.map((fn) => {
    try { return fn(resolved); }
    catch (e) { return { name: 'error', condition: '-', expected: '-', actual: String(e), passed: false, message: '断言执行异常: ' + e.message }; }
  });
  const passed = results.every((r) => r.passed);
  return { success: passed, assertions: results };
}

/**
 * 便捷构造常见断言
 */
export const commonAssertions = {
  range: (field, min, max) => (r) => {
    const v = r[field];
    const passed = typeof v === 'number' && v >= min && v <= max;
    return { name: `${field}_range`, condition: `${min} <= ${field} <= ${max}`, expected: `${min}~${max}`, actual: v, passed, message: passed ? `✅ ${field}=${v}` : `❌ ${field}=${v} 越界` };
  },
  gte: (a, b) => (r) => {
    const passed = r[a] >= r[b];
    return { name: `${a}_gte_${b}`, condition: `${a} >= ${b}`, expected: true, actual: passed, passed, message: passed ? `✅ ${a}(${r[a]}) >= ${b}(${r[b]})` : `❌ ${a}(${r[a]}) < ${b}(${r[b]})` };
  },
  truthy: (field) => (r) => {
    const passed = !!r[field];
    return { name: `${field}_truthy`, condition: `${field} 为真`, expected: true, actual: passed, passed, message: passed ? `✅ ${field}` : `❌ ${field} 为空` };
  },
};

// ───────────────────────── 自测 ─────────────────────────
function _assert(name, cond) {
  if (!cond) { console.error('FAIL:', name); process.exitCode = 1; }
  else console.log('PASS:', name);
}

if (process.argv.includes('--selftest')) {
  const defaults = { maxPages: 10, startPage: 1, delayMin: 3000, delayMax: 8000, mode: 'default' };
  const system = { delayMin: 5000, mode: 'system' };
  const task = { maxPages: 5, mode: 'task' };

  const schema = {
    delayMax: {
      validator: (v) => typeof v === 'number' && v > 0,
      // 冲突检测：delayMax < delayMin 时自动修正为 delayMin + 2000
      autoFix: (r) => (r.delayMax < r.delayMin ? { value: r.delayMin + 2000, message: '最大延迟小于最小延迟，已自动修正' } : null),
    },
    startPage: {
      autoFix: (r) => (r.startPage > r.maxPages ? { value: 1, message: '起始页超过最大页数，已自动修正' } : null),
    },
    mode: { systemOnly: true }, // 该字段任务层不可覆盖
  };

  // 1) 优先级：task > system > default
  const r1 = resolveConfig({ defaults, system, task, schema });
  _assert('task overrides', r1.maxPages === 5);
  _assert('system middle', r1.delayMin === 5000);
  _assert('default lowest', r1.delayMax === 8000);
  _assert('systemOnly ignores task', r1.mode === 'system');

  // 2) 自动修正
  const task2 = { delayMax: 1000, startPage: 99 };
  const r2 = resolveConfig({ defaults, system, task: task2, schema });
  _assert('autoFix delayMax', r2.delayMax === 7000);
  _assert('autoFix startPage', r2.startPage === 1);
  _assert('conflict recorded', r2._meta.conflicts.length === 2);

  // 3) diff
  const d = diffConfigs(r1, r2);
  _assert('diff detects change', d.some((x) => x.field === 'delayMax'));

  // 4) snapshot 往返
  const snap = configSnapshot(r1);
  const back = configFromSnapshot(snap);
  _assert('snapshot round-trip', back.maxPages === 5 && !('_meta' in back));

  // 5) dry-run 断言
  const res = runAssertions(r1, [
    commonAssertions.gte('delayMax', 'delayMin'),
    commonAssertions.range('maxPages', 1, 100),
    commonAssertions.truthy('mode'),
  ]);
  _assert('dryRun success', res.success && res.assertions.length === 3);

  // 6) hash 稳定
  _assert('configHash present', typeof r1.configHash === 'string' && r1.configHash.length === 8);

  console.log('config-merge self-test done.');
}
