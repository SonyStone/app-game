import { createContextProvider } from './utils/createContextProvider';
import Stats from 'stats.js';

export const [StatsProvider, useStats] = createContextProvider(() => {
  const stats = new Stats();

  return stats;
});
