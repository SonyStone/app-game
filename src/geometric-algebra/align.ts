const options: any = {};

/** number of positive dimensions */
const p = 2;

/** optional number of negative dimensions */
const q = 0;

/** optional number of zero dimensions */
const r = 1;

// Calculate the total number of dimensions.
const tot = p + q + r;

// Unless specified, generate a full set of Clifford basis names. We generate them as an array of strings by starting
// from numbers in binary representation and changing the set bits into their relative position.
// Basis names are ordered first per grade, then lexically (not cyclic!).
// For 10 or more dimensions all names will be double digits ! 1e01 instead of 1e1 ..
const basis = (() => {
  const optionsBasis =
    options.basis &&
    (options.basis.length == 2 ** tot || r < 0 || options.Cayley) &&
    options.basis;

  const step_1 = [...Array(2 ** tot)];
  // => [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined]

  console.log(`step_1`, step_1);

  const step_2 = step_1.map((x, xi) =>
    ((1 << 30) + xi)
      .toString(2)
      .slice(-tot || -1) // => ["000", "001", "010", "011", "100", "101", "110", "111"]  (index of array in base 2)
      .replace(/./g, (a, ai) =>
        a == '0' ? '' : String.fromCharCode(66 + ai - (r != 0))
      )
  );

  console.log(`step_2`, step_2);

  // => ["", "3", "2", "23", "1", "13", "12", "123"] (1 bits replaced with their positions, 0's removed)

  const step_3 = step_2.sort((a, b) =>
    a.toString().length == b.toString().length
      ? a > b
        ? 1
        : b > a
        ? -1
        : 0
      : a.toString().length - b.toString().length
  );
  // => ["", "1", "2", "3", "12", "13", "23", "123"] (sorted numerically)

  const step_4 = step_3.map(
    (x) =>
      (x &&
        'e' +
          x.replace(/./g, (x) =>
            ('0' + (x.charCodeAt(0) - 65)).slice(tot > 9 ? -2 : -1)
          )) ||
      '1'
  );
  // => ["1", "e1", "e2", "e3", "e12", "e13", "e23", "e123"] (converted to commonly used basis names)

  return step_4;
})();

const gp = basis.map(() => basis.map(() => '0'));
const op: string[] = gp.map(() => gp.map(() => '0'));

export function ganja() {
  console.log(`basis`, basis);
}

// const Vee = new Function(
//   'b,res',
//   (
//     'res=res||new this.constructor();\n' +
//     op
//       .map(
//         (r, ri) =>
//           'res[' +
//           drm[ri] +
//           ']=' +
//           drms[ri] +
//           '*(' +
//           r
//             .map((x) =>
//               x.replace(/\[(.*?)\]/g, function (a, b) {
//                 return '[' + drm[b | 0] + ']' + (drms[b | 0] > 0 ? '' : '*-1');
//               })
//             )
//             .join('+')
//             .replace(/\+\-/g, '-')
//             .replace(/\+0/g, '')
//             .replace(/(\w*?)\[(.*?)\]/g, (a, b, c) =>
//               options.mix
//                 ? '(' + b + '.' + (c | 0 ? basis[c] : 's') + '||0)'
//                 : a
//             ) +
//           ');'
//       )
//       .join('\n') +
//     '\nreturn res;'
//   ).replace(/(b\[)|(this\[)/g, (a) => (a == 'b[' ? 'this[' : 'b['))
// );
