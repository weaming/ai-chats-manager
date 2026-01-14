export type DiffType = 'same' | 'added' | 'removed';

export interface DiffPart {
  type: DiffType;
  value: string;
}

/**
 * Compare two strings character by character and return the differences.
 * Uses a simplified Myers diff algorithm suitable for small-ish strings.
 */
export function diffChars(oldText: string, newText: string): DiffPart[] {
  const diffs: DiffPart[] = [];
  
  // Fast path for equality
  if (oldText === newText) {
    return [{ type: 'same', value: oldText }];
  }

  // Implementation of a simple recursive LCS based diff
  // This is not the most optimized Myers diff but sufficient for our use case (short text segments)
  
  const matrix: number[][] = [];
  const N = oldText.length;
  const M = newText.length;

  for (let i = 0; i <= N; i++) {
    matrix[i] = new Int32Array(M + 1) as any;
    for (let j = 0; j <= M; j++) {
      if (i === 0 || j === 0) {
        matrix[i]![j] = 0;
      } else if (oldText[i - 1] === newText[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]! + 1;
      } else {
        matrix[i]![j] = Math.max(matrix[i - 1]![j]!, matrix[i]![j - 1]!);
      }
    }
  }

  // Backtrack to find the diff
  const parts: DiffPart[] = [];
  let i = N;
  let j = M;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldText[i - 1] === newText[j - 1]) {
      parts.unshift({ type: 'same', value: oldText[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i]![j - 1]! >= matrix[i - 1]![j]!)) {
      parts.unshift({ type: 'added', value: newText[j - 1]! });
      j--;
    } else if (i > 0 && (j === 0 || matrix[i]![j - 1]! < matrix[i - 1]![j]!)) {
      parts.unshift({ type: 'removed', value: oldText[i - 1]! });
      i--;
    }
  }

  // Merge adjacent parts of the same type
  if (parts.length === 0) return [];

  const merged: DiffPart[] = [];
  let current = parts[0]!;

  for (let k = 1; k < parts.length; k++) {
    const next = parts[k]!;
    if (next.type === current.type) {
      current.value += next.value;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  return merged;
}
