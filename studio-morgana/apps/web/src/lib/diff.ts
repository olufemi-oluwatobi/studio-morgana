// Which lines of `next` are new or changed compared with `prev` (longest common subsequence over lines).
export function changedLines(prev: string, next: string): Set<number> {
  const a = prev.split('\n'), b = next.split('\n');
  if (a.length * b.length > 400_000) return new Set(b.map((_, i) => i + 1).filter((i) => a[i - 1] !== b[i - 1]));
  const n = a.length, m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = new Set<number>();
  let i = 0, j = 0;
  while (j < m) {
    if (i < n && a[i] === b[j]) { i++; j++; }
    else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else { out.add(j + 1); j++; }
  }
  return out;
}
