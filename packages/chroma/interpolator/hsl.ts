import _hsx from './_hsx';

require('../io/hsl');

const hsl = (col1, col2, f) => {
  return _hsx(col1, col2, f, 'hsl');
};

// register interpolator
require('./index').hsl = hsl;

module.exports = hsl;
