/** Just a function */
export type System = (...args: any[]) => void;

/** Class or constructor Funtion */
export type Constructor<T> = new (...args: any[]) => T;
