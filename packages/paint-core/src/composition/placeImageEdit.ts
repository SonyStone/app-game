import type { Point, ViewSize } from '../camera';
import { imageTiles, placeImage } from '../imageTiles';
import { defineDocumentEdit } from './documentEdit';

/**
 * Places a decodable image as a new layer above the active one, centered on `center` in document pixels and scaled
 * down to fit `fit`, as one undoable change named `name`.
 */
export const placeImageEdit = defineDocumentEdit({
  id: 'place-image',
  parse: (input: unknown): PlaceImageCommand => {
    const command = input as Partial<PlaceImageCommand> | undefined;
    if (!(command?.file instanceof Blob) || typeof command.name !== 'string' || !command.center || !command.fit) {
      throw new Error('Place an image file.');
    }

    return command as PlaceImageCommand;
  },
  async run(_context, command) {
    const bitmap = await createImageBitmap(command.file).catch(() => {
      throw new Error('This file is not an image Paint can read.');
    });
    const place = placeImage(bitmap.width, bitmap.height, command.center, command.fit);
    const context = new OffscreenCanvas(place.width, place.height).getContext('2d');
    if (!context) throw new Error('Could not read the image.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, place.width, place.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, place.width, place.height).data;
    const id = crypto.randomUUID();
    const changes = [...imageTiles(pixels, place.width, place.height, place.left, place.top)].map(([key, after]) => ({
      layerId: id,
      key,
      before: undefined,
      after
    }));
    if (!changes.length) throw new Error('The image is fully transparent.');
    return { changes, layer: { id, name: command.name, visible: true, opacity: 1, blend: 'normal' } };
  }
});

/** An image file to place, with the layer name and where it goes in document pixels. */
export type PlaceImageCommand = { file: Blob; name: string; center: Point; fit: ViewSize };
