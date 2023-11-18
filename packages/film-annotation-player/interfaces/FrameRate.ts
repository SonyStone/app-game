export interface FrameRateOption {
  name: string;
  value: number;
}

export const FRAME_RATES: FrameRateOption[] = [
  { name: 'film: 24', value: 24 },
  { name: 'NTSC: 29.97', value: 29.97 },
  { name: 'NTSC_Film: 23.976', value: 23.976 },
  { name: 'NTSC_HD: 59.94', value: 59.94 },
  { name: 'PAL: 25', value: 25 },
  { name: 'PAL_HD: 50', value: 50 },
  { name: 'web: 30', value: 30 },
  { name: 'high: 60', value: 60 },
];
