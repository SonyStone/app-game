/** GodSVG's id rules: empty is fine (no id); whitespace or a leading `#` is invalid; non-name characters warn. */
export function idValidity(id: string): 'valid' | 'warning' | 'invalid' {
  if (id === '') {
    return 'valid';
  }

  if (id.startsWith('#') || /\s/.test(id)) {
    return 'invalid';
  }

  return /^[-.:_0-9A-Za-z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}]*$/u.test(id)
    ? 'valid'
    : 'warning';
}
