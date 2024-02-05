import { COLOR_ATTACHMENT } from '@webgl/static-variables';

export type ColorAttachmentNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** Up to 16 texture attachments 0 to 15 */
export function getColorAttachmentNumber(cAttachNum: ColorAttachmentNumber): COLOR_ATTACHMENT {
  return COLOR_ATTACHMENT.COLOR_ATTACHMENT0 + cAttachNum;
}
