import { Branded } from '@packages/utils/branded.type';

let id = 0;
export const getId = () => id++ as Id;

export type Id = Branded<number, 'Id'>;
