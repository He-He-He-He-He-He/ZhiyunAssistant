// Native-only, process-memory permission. Never persisted, placed in AppStorage,
// exposed through a Web bridge, or inferred from a saved password/consent marker.
export class NativeAccountAcceptance {
  private static accountId: string = '';
  private static tenant: number = 0;
  private static canonical: string = '';
  private static epoch: number = 0;
  private static enrollmentSpent: boolean = false;
  private static listeners: (() => void)[] = [];
  static generation(): number { return NativeAccountAcceptance.epoch; }
  static enabled(): boolean { return !!NativeAccountAcceptance.accountId; }
  static current(gen: number): boolean { return NativeAccountAcceptance.enabled() && gen === NativeAccountAcceptance.epoch; }
  static matches(id: string, tenantId: number, username: string = ''): boolean {
    return NativeAccountAcceptance.enabled() && id === NativeAccountAcceptance.accountId &&
      tenantId === NativeAccountAcceptance.tenant && (!username || username === NativeAccountAcceptance.canonical);
  }
  static enrollmentAvailable(): boolean { return NativeAccountAcceptance.enabled() && !NativeAccountAcceptance.enrollmentSpent; }
  static grant(id: string, tenantId: number, canonical: string, checked: boolean): void {
    if (!checked || NativeAccountAcceptance.enabled() || !id || id !== id.trim() || id.length > 256 ||
      !Number.isSafeInteger(tenantId) || tenantId <= 0 || !canonical || canonical !== canonical.trim() ||
      canonical.length > 128) throw new Error('需要已有验证身份和本次原生勾选授权');
    NativeAccountAcceptance.accountId = id; NativeAccountAcceptance.tenant = tenantId;
    NativeAccountAcceptance.canonical = canonical; NativeAccountAcceptance.enrollmentSpent = false;
    NativeAccountAcceptance.changed();
  }
  static consumeEnrollment(id: string, tenantId: number, canonical: string): void {
    if (!NativeAccountAcceptance.matches(id, tenantId, canonical) || !NativeAccountAcceptance.enrollmentAvailable())
      throw new Error('本次原生验收验证已使用或身份不匹配');
    NativeAccountAcceptance.enrollmentSpent = true;
  }
  static revoke(): void {
    NativeAccountAcceptance.accountId = ''; NativeAccountAcceptance.tenant = 0; NativeAccountAcceptance.canonical = '';
    NativeAccountAcceptance.enrollmentSpent = true; NativeAccountAcceptance.changed();
  }
  static onChange(listener: () => void): void { NativeAccountAcceptance.listeners.push(listener); }
  private static changed(): void {
    NativeAccountAcceptance.epoch++;
    NativeAccountAcceptance.listeners.forEach((listener: () => void) => listener());
  }
}
