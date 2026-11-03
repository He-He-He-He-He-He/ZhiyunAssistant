/** Validated in-app assistant actions. This module does not expose an external interface. */
export type ActionSchema = { type: 'string' | 'number' | 'boolean' | 'object' | 'array'; properties?: Record<string, ActionSchema>; required?: string[]; items?: ActionSchema; enum?: unknown[]; minimum?: number; maximum?: number; maxLength?: number; maxItems?: number };
export type ActionGuard = (() => void) & { signal?: AbortSignal };
export type ActionDefinition = { name: string; description: string; parameters: ActionSchema; run: (args: Record<string, unknown>, guard: ActionGuard) => Promise<unknown> | unknown };
export function validateActionValue(value: unknown, schema: ActionSchema, path = '参数'): void {
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(path + '必须是对象');
    const data = value as Record<string, unknown>, properties = schema.properties || {};
    for (const key of schema.required || []) if (!Object.hasOwn(data, key)) throw new Error(path + '缺少 ' + key);
    for (const key of Object.keys(data)) { if (!Object.hasOwn(properties, key)) throw new Error('未知参数：' + key); validateActionValue(data[key], properties[key], key); }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? 100) || !schema.items) throw new Error(path + '列表不正确');
    for (const item of value) validateActionValue(item, schema.items, path);
  } else {
    if (typeof value !== schema.type || (schema.type === 'number' && !Number.isFinite(value))) throw new Error(path + '类型不正确');
    if (typeof value === 'string' && value.length > (schema.maxLength ?? 12000)) throw new Error(path + '过长');
    if (typeof value === 'number' && ((schema.minimum != null && value < schema.minimum) || (schema.maximum != null && value > schema.maximum))) throw new Error(path + '超出范围');
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error(path + '不是有效选项');
}
export class AppActions {
  private readonly actions = new Map<string, ActionDefinition>();
  register(action: ActionDefinition): void {
    if (!/^[a-z][a-z0-9_]*$/.test(action.name) || this.actions.has(action.name) || action.parameters.type !== 'object') throw new Error('操作名称或参数无效');
    this.actions.set(action.name, action);
  }
  catalogue(): Array<Omit<ActionDefinition, 'run'>> { return Array.from(this.actions.values(), ({ run: _run, ...entry }) => entry); }
  async execute(name: string, args: unknown, guard: ActionGuard = () => {}): Promise<unknown> {
    guard(); const action = this.actions.get(name); if (!action) throw new Error('应用没有提供此操作：' + name);
    validateActionValue(args, action.parameters); const result = await action.run(args as Record<string, unknown>, guard); guard(); return result ?? { ok: true };
  }
}
