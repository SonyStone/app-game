import type { Folder } from './FolderStack';

/** Demo content and tab positions, ordered from the back to the front initially. */
export const folders = [
  {
    id: 'perceive',
    number: '21',
    name: 'Perceive',
    detail: 'Patterns',
    color: '#99997d',
    dark: false,
    left: 52,
    title: 'A different perspective',
    label: 'Pattern library',
    count: 128,
    date: '02 Feb — 21 Nov',
    year: '2026',
    layout: 'orbits'
  },
  {
    id: 'style',
    number: '91',
    name: 'Style',
    detail: 'Rolls',
    color: '#ffc66e',
    dark: false,
    left: 11,
    title: 'Make room for color',
    label: 'Color explorations',
    count: 316,
    date: '14 Mar — 08 Sep',
    year: '2026',
    layout: 'orbits'
  },
  {
    id: 'child',
    number: '33',
    name: 'Child',
    detail: 'Care',
    color: '#000000',
    dark: true,
    left: 64,
    title: 'Small things, big ideas',
    label: 'Everyday discoveries',
    count: 86,
    date: '06 Apr — 12 Oct',
    year: '2026',
    layout: 'studio'
  },
  {
    id: 'site',
    number: '31',
    name: 'Site',
    detail: 'Buttons',
    color: '#f2f2f2',
    dark: false,
    left: 37,
    title: 'Made to be pressed',
    label: 'Interface collection',
    count: 142,
    date: '18 Feb — 09 Dec',
    year: '2026',
    layout: 'studio'
  },
  {
    id: 'evolution',
    number: '99',
    name: 'Evolution',
    detail: 'Legacy',
    color: '#cececc',
    dark: false,
    left: 56,
    title: 'Ideas in the making',
    label: 'Work in progress',
    count: 99,
    date: '01 May — 16 Nov',
    year: '2026',
    layout: 'orbits'
  },
  {
    id: 'play',
    number: '23',
    name: 'Play',
    detail: 'Moon',
    color: '#aabbb5',
    dark: false,
    left: 19,
    title: 'Folders Generation',
    label: 'UI Design Place',
    count: 201,
    date: '09 Jan — 10 Des',
    year: '1974',
    layout: 'orbits'
  },
  {
    id: 'menu',
    number: '51',
    name: 'Menu',
    detail: 'Planning',
    color: '#000000',
    dark: true,
    left: 48,
    title: 'AI Generation Place',
    label: 'UI Design Place',
    count: 194,
    date: '03 Jan — 02 Des',
    year: '1969',
    layout: 'studio'
  },
  {
    id: 'music',
    number: '09',
    name: 'Music',
    detail: 'Wave',
    color: '#fafbf9',
    dark: false,
    left: 3,
    title: 'Place for creators',
    label: 'Orders for clients',
    count: 284,
    date: '01 Jan — 29 Dec',
    year: '',
    layout: 'studio'
  }
] as const satisfies readonly (Folder & {
  title: string;
  label: string;
  count: number;
  date: string;
  year: string;
  layout: 'studio' | 'orbits';
})[];

/** One of the eight configured demo folders. */
export type DemoFolder = (typeof folders)[number];
