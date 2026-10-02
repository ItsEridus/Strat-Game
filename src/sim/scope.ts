// A short-lived cache for expensive national measures (military power, power scores,
// staffing) while the world stands still: inside withScope(), each is computed once.
// Outside a scope nothing is cached, so callers elsewhere always see fresh values.
let scope: Map<string, unknown> | null = null;

export function withScope<T>(f: () => T): T {
  const outer = scope;
  scope = outer ?? new Map();
  try { return f(); } finally { scope = outer; }
}
export function scoped<T>(key: string, f: () => T): T {
  if (!scope) return f();
  if (scope.has(key)) return scope.get(key) as T;
  const v = f();
  scope.set(key, v);
  return v;
}
