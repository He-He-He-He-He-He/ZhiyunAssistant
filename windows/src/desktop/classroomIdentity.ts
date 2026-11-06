// Parse identities directly from independently fetched infosimple responses. The ordinary
// Account model supplies a default tenant; that fallback is not sufficient for authentication.
export interface ClassroomIdentity { id: string; tenantId: number; username: string }
export function classroomIdentity(response: unknown): ClassroomIdentity | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const params = (response as { params?: unknown }).params;
  if (!params || typeof params !== 'object') return undefined;
  const { id, tenant_id, account } = params as { id?: unknown; tenant_id?: unknown; account?: unknown };
  const validId = typeof id === 'string' ? id.length > 0 && id.length <= 128 && id.trim() === id && !/[\x00-\x1f\x7f]/.test(id) : typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
  const validUsername = typeof account === 'string' && account.length > 0 && account.length <= 128 && account.trim() === account && !/[\x00-\x1f\x7f]/.test(account);
  if (!validId || !validUsername || typeof tenant_id !== 'number' || !Number.isSafeInteger(tenant_id) || tenant_id <= 0) return undefined;
  return { id: String(id), tenantId: tenant_id, username: account };
}
export function sameClassroomIdentity(first: unknown, second: unknown): boolean {
  const a = classroomIdentity(first), b = classroomIdentity(second);
  return !!a && !!b && a.id === b.id && a.tenantId === b.tenantId && a.username === b.username;
}
