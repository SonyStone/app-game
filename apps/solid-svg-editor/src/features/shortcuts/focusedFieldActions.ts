import { evaluateNumberExpression } from '../../editor/number-expression';

/**
 * GodSVG's Find: focuses and selects the search field on screen (marked `data-search-field`, such as the color
 * utilities search). Returns `false` when there is none, so the browser's own find runs instead.
 */
export function focusSearchField(): boolean {
  const field = Array.from(document.querySelectorAll<HTMLInputElement>('[data-search-field]')).find(
    (element) => element.getClientRects().length > 0
  );

  if (!field) {
    return false;
  }

  field.focus();
  field.select();
  return true;
}

/**
 * GodSVG's Evaluate: in the focused text field, replaces the selected text (or all of it) with the value of the
 * arithmetic it holds, such as `12*2+1` → `25`, keeping the selection around the result. The field's `input` event
 * fires; nothing is committed. Returns `false` when no text field has focus or the text is not an expression.
 */
export function evaluateFocusedField(): boolean {
  const field = document.activeElement;

  if (!(field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement && field.type === 'text'))) {
    return false;
  }

  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? field.value.length;
  const selected = start !== end;
  const value = evaluateNumberExpression(selected ? field.value.slice(start, end) : field.value);

  if (Number.isNaN(value)) {
    return false;
  }

  // GodSVG keeps up to 6 decimals (Utils.MAX_NUMERIC_PRECISION).
  const result = String(Number(value.toFixed(6)));
  field.setRangeText(result, selected ? start : 0, selected ? end : field.value.length, selected ? 'select' : 'end');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
