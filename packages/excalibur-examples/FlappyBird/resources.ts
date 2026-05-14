import { ImageSource, ImageWrapping, Sound } from 'excalibur';
import BirdImageUrl from './assets/bird.png?url';
import FailSoundUrl from './assets/fail.wav?url';
import FlapSoundUrl from './assets/flap.wav?url';
import GroundImageUrl from './assets/ground.png?url';
import PipeImageUrl from './assets/pipe.png?url';
import ScoreSoundUrl from './assets/score.wav?url';
import BackgroundMusicUrl from './assets/two_left_socks.ogg?url';

export const Resources = {
  // Relative to /public in vite

  // Images
  BirdImage: new ImageSource(BirdImageUrl),
  PipeImage: new ImageSource(PipeImageUrl, {
    wrapping: ImageWrapping.Clamp // Clamp is the default
  }),
  GroundImage: new ImageSource(GroundImageUrl, {
    wrapping: ImageWrapping.Repeat
  }),

  // Sounds
  FlapSound: new Sound(FlapSoundUrl),
  FailSound: new Sound(FailSoundUrl),
  ScoreSound: new Sound(ScoreSoundUrl),

  // Music
  BackgroundMusic: new Sound(BackgroundMusicUrl)
} as const;
