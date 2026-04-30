export function deepCompare(actual: unknown, expected: unknown, path = ''): string[] {
  const diffs: string[] = [];
  if (actual === expected) return diffs;
  if (typeof actual !== typeof expected) {
    diffs.push(`${path || 'root'}: type mismatch ${typeof actual} vs ${typeof expected}`);
    return diffs;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      diffs.push(`${path}: length ${actual.length} vs ${expected.length}`);
    }
    for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
      diffs.push(...deepCompare(actual[i], expected[i], `${path}[${i}]`));
    }
    return diffs;
  }
  if (typeof actual === 'object' && actual !== null && expected !== null) {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    for (const key of keys) {
      diffs.push(
        ...deepCompare(
          (actual as Record<string, unknown>)[key],
          (expected as Record<string, unknown>)[key],
          `${path}.${key}`,
        ),
      );
    }
    return diffs;
  }
  diffs.push(`${path}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  return diffs;
}

export function expectDeepEqual(actual: unknown, expected: unknown) {
  const diffs = deepCompare(actual, expected);
  if (diffs.length > 0) {
    throw new Error(`Differences:\n${diffs.join('\n')}`);
  }
}
