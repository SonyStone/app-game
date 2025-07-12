const COLORS = [
  'bg-red-100',
  'bg-blue-100',
  'bg-green-100',
  'bg-yellow-100',
  'bg-purple-100',
  'bg-pink-100',
  'bg-orange-100',
  'bg-teal-100',
  'bg-gray-100',
  'bg-indigo-100',
  'bg-lime-100',
  'bg-amber-100',
  'bg-cyan-100',
  'bg-emerald-100'
];

const COLORS_2 = [
  'bg-red-200',
  'bg-blue-200',
  'bg-green-200',
  'bg-yellow-200',
  'bg-purple-200',
  'bg-pink-200',
  'bg-orange-200',
  'bg-teal-200',
  'bg-gray-200',
  'bg-indigo-200',
  'bg-lime-200',
  'bg-amber-200',
  'bg-cyan-200',
  'bg-emerald-200'
];

export const getColorByIndex = (index: number) => {
  return COLORS[index % COLORS.length];
};

export const getColor2ByIndex = (index: number) => {
  return COLORS_2[index % COLORS_2.length];
};
