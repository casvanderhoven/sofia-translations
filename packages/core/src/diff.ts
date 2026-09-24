/**
 * Longest-common-subsequence alignment of two string sequences.
 * Returns matched index pairs [i, j] in increasing order. O(n·m), fine for section-sized inputs.
 */
export function lcsAlign(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return [];
  // Fast path: identical sequences.
  if (n === m && a.every((x, k) => x === b[k])) return a.map((_, k) => [k, k]);

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}
