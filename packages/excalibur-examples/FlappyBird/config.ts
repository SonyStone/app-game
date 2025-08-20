import { vec } from 'excalibur';

export const Config = {
  BirdStartPos: vec(200, 300),
  BirdAcceleration: 1200,
  BirdJumpVelocity: -800,
  BirdMinVelocity: -500,
  BirdMaxVelocity: 500,
  PipeSpeed: 200,
  PipeInterval: 1500,
  PipeGap: 150
} as const;
