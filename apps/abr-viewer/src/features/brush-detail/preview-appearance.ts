import type { BrushFormValues } from './brush-form-schema';

/** Collection thumbnails show neutral marks; the interactive preview retains saved paint colors and mode. */
export function previewAppearance(
  values: BrushFormValues,
  options: {
    thumbnail?: boolean;
    brushColor?: string;
    secondaryColor?: string;
  }
) {
  if (options.thumbnail) {
    return {
      values: ['PbTl', 'PcTl'].includes(values.tool.type)
        ? { ...values, tool: { ...values.tool, mode: 'Nrml' } }
        : values,
      color: '#ffffff',
      secondaryColor: '#ffffff'
    };
  }
  return {
    values,
    color: values.tool.foreground || options.brushColor || '#ffffff',
    secondaryColor: values.tool.background || options.secondaryColor
  };
}
