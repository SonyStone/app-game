import { createContextProvider } from '@app-game/solid-utils';
import Stats from 'stats.js';

export const [StatsProvider, useStats] = createContextProvider(() => {
  const stats = new Stats();

  return stats;
});
