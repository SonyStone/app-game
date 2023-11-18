export function typename(value?: any): string | undefined {
  function stripConstructor(value: any) {
    if (value) {
      return value.replace("Constructor", "");
    } else {
      return value;
    }
  }

  if (value) {
    var mangled = value.constructor.toString();
    if (mangled) {
      var matches = mangled.match(/function (.+)\(/);
      if (matches) {
        // ...function Foo()...
        if (matches[1] == "Object") {
          // Hrm that's likely not right...
          // constructor may be fubar
          mangled = value.toString();
        } else {
          return stripConstructor(matches[1]);
        }
      }

      // [object Foo]
      matches = mangled.match(/\[object (.+)\]/);
      if (matches) {
        return stripConstructor(matches[1]);
      }
    }
  }

  return;
}
