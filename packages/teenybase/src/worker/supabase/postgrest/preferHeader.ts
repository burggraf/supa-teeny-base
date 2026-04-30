export interface PreferResult {
  preferReturn: 'representation' | 'minimal' | null;
  preferCount: 'exact' | 'planned' | 'estimated' | null;
  preferResolution: 'merge-duplicates' | 'ignore-duplicates' | null;
  preferHandling: 'strict' | 'lenient' | null;
}

const RETURN_VALUES = new Set(['representation', 'minimal']);
const COUNT_VALUES = new Set(['exact', 'planned', 'estimated']);
const RESOLUTION_VALUES = new Set(['merge-duplicates', 'ignore-duplicates']);
const HANDLING_VALUES = new Set(['strict', 'lenient']);

/**
 * Parse the Prefer header per RFC 7240 / PostgREST conventions.
 *
 * Examples:
 * - "return=representation"
 * - "return=minimal, count=exact"
 * - "resolution=ignore-duplicates"
 * - "handling=strict"
 */
export function parsePreferHeader(prefer: string | null | undefined): PreferResult {
  const result: PreferResult = {
    preferReturn: null,
    preferCount: null,
    preferResolution: null,
    preferHandling: null,
  };
  if (!prefer) return result;

  for (const part of prefer.split(',')) {
    const [key, ...rest] = part.trim().split('=');
    const value = rest.join('=').trim();

    switch (key.toLowerCase()) {
      case 'return':
        if (RETURN_VALUES.has(value)) result.preferReturn = value as PreferResult['preferReturn'];
        break;
      case 'count':
        if (COUNT_VALUES.has(value)) result.preferCount = value as PreferResult['preferCount'];
        break;
      case 'resolution':
        if (RESOLUTION_VALUES.has(value)) result.preferResolution = value as PreferResult['preferResolution'];
        break;
      case 'handling':
        if (HANDLING_VALUES.has(value)) result.preferHandling = value as PreferResult['preferHandling'];
        break;
    }
  }
  return result;
}
