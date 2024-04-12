import { Color } from './color';

export const chroma = (...args: any) => {
  return new chroma.Color(...args);
};

chroma.Color = Color;
chroma.version = '@@version';
