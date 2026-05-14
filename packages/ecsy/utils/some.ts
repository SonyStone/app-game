export const some = <T>(values: T | T[]) => (fn: (value: T) => boolean): boolean => {
  if (Array.isArray(values)) {

    return values.some(fn)

  } else {
    return fn(values)
  }
}