import { TypedArray } from '@packages/webgl/typedArray';

export function download(data: TypedArray, filename: string) {
  const blob = new Blob([data]);

  const objectUrl = URL.createObjectURL(blob);
  const link = (<a href={objectUrl} download={filename + '.buffer'} style={{ display: 'none' }} />) as HTMLLinkElement;
  console.log('link', link, blob);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
