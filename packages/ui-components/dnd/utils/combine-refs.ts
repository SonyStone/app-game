export type RefSetter<V> = (value: V) => void

export const combineRefs = <V>(...setRefs: RefSetter<V>[]): RefSetter<V> => {
  return ref => {
    for (const setRef of setRefs) {
      setRef(ref)
    }
  }
}
