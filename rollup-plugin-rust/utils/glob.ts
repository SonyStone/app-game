import _glob, { IOptions } from 'glob';

export default function glob(
  pattern: string,
  options: IOptions
): Promise<string[]> {
  return new Promise(function (resolve, reject) {
    _glob(pattern, options, function (err, files) {
      err === null ? resolve(files) : reject(err);
    });
  });
}
