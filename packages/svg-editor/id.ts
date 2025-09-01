import { Brand } from '@packages/utils/Brand.type';

let id = 0;
export const getId = () => id++ as Id;

export type Id = Brand<number, 'Id'>;
