/** Both recognizers make the same exclusive decision after six pixels of intent. */
export function dragAxis(dx: number, dy: number): 'horizontal' | 'vertical' | undefined {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
}
