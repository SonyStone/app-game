/**
 * Parses out the Wangset information from Tiled 1.1.5+ map data, if present.
 *
 * Since a given tile can be in more than one wangset, the resulting properties
 * are nested. `tile.data.wangid[someWangsetName]` will return the array-based wang id in
 * this implementation.
 *
 * Note that we're not guaranteed that there will be any 'normal' tiles if the only
 * thing in the tilset are wangtile definitions, so this has to be parsed separately.
 *
 * See https://doc.mapeditor.org/en/latest/manual/using-wang-tiles/ for more information.
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.ParseWangsets
 * @since 3.53.0
 *
 * @param {Array.<object>} wangsets - The array of wangset objects (parsed from JSON)
 * @param {object} datas - The field into which to put wangset data from Tiled.
 *
 * @return {object} An object containing the tileset and image collection data.
 */
export function parseWangsets(wangsets: any[], datas: any) {
  for (let w = 0; w < wangsets.length; w++) {
    let wangset = wangsets[w];
    let identifier = w;

    if (wangset.name && wangset.name !== '') {
      identifier = wangset.name;
    }

    if (Array.isArray(wangset.wangtiles) && wangset.wangtiles.length > 0) {
      let edgeColors: any = {};
      let cornerColors: any = {};

      let c;
      let color;
      let colorIndex;

      // Tiled before v2020.09.09
      if (Array.isArray(wangset.edgecolors)) {
        for (c = 0; c < wangset.edgecolors.length; c++) {
          colorIndex = 1 + c;
          color = wangset.edgecolors[c];

          if (color.name !== '') {
            edgeColors[colorIndex] = color.name;
          }
        }
      }

      if (Array.isArray(wangset.cornercolors)) {
        for (c = 0; c < wangset.cornercolors.length; c++) {
          colorIndex = 1 + c;
          color = wangset.cornercolors[c];

          if (color.name !== '') {
            cornerColors[colorIndex] = color.name;
          }
        }
      }

      // Tiled after v2020.09.09
      if (Array.isArray(wangset.colors)) {
        for (c = 0; c < wangset.colors.length; c++) {
          color = wangset.colors[c];
          colorIndex = 1 + c;

          if (color.name !== '') {
            edgeColors[colorIndex] = cornerColors[colorIndex] = color.name;
          }
        }
      }

      // The wangid layout is north, northeast, east, southeast, etc.
      let idLayout = [
        edgeColors,
        cornerColors,
        edgeColors,
        cornerColors,
        edgeColors,
        cornerColors,
        edgeColors,
        cornerColors,
      ];

      for (let t = 0; t < wangset.wangtiles.length; t++) {
        let wangtile = wangset.wangtiles[t];

        let obj = datas[wangtile.tileid] || (datas[wangtile.tileid] = {});

        obj = obj.wangid || (obj.wangid = {});

        let wangid = [];

        for (
          let i = 0;
          i < Math.min(idLayout.length, wangtile.wangid.length);
          i++
        ) {
          color = wangtile.wangid[i];

          if (color === 0) {
            wangid.push(undefined);
            continue;
          }

          let renamed = idLayout[i][color];

          if (renamed !== undefined) {
            wangid.push(renamed);
            continue;
          }

          wangid.push(color);
        }

        obj[identifier] = wangid;
      }
    }
  }
}
