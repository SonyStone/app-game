/** Compare native Gray conversion through SolidColor, descriptors, fills and actual Brush strokes.
 * Uses only its temporary document; restores Brush options, selected tool, foreground and dialog mode.
 * Returns CSV; the caller can store stdout beside the profile-color measurements.
 */
(function () {
  var s = stringIDToTypeID,
    c = charIDToTypeID,
    old = app.documents.length ? app.activeDocument : null,
    fg = app.foregroundColor,
    dlg = app.displayDialogs,
    doc = null,
    rows = [],
    tool = app.currentTool,
    options = null;
  function getOptions() {
    var r = new ActionReference();
    r.putEnumerated(s('application'), s('ordinal'), s('targetEnum'));
    return executeActionGet(r).getObjectValue(s('currentToolOptions'));
  }
  function setOptions(o) {
    var r = new ActionReference();
    r.putClass(s('paintbrushTool'));
    var d = new ActionDescriptor();
    d.putReference(s('null'), r);
    d.putObject(s('to'), s('currentToolOptions'), o);
    executeAction(s('set'), d, DialogModes.NO);
  }
  function sample() {
    var p = doc.colorSamplers.add([UnitValue(16, 'px'), UnitValue(16, 'px')]);
    var rgb = p.color.rgb;
    var out = rgb.hexValue;
    p.remove();
    return out;
  }
  function gray(value) {
    var d = new ActionDescriptor();
    d.putDouble(c('Gry '), value);
    return d;
  }
  function fillAction(value) {
    var d = new ActionDescriptor();
    d.putEnumerated(c('Usng'), c('FlCn'), c('Clr '));
    d.putObject(c('Clr '), c('Grsc'), gray(value));
    d.putUnitDouble(c('Opct'), c('#Prc'), 100);
    d.putEnumerated(c('Md  '), c('BlnM'), c('Nrml'));
    executeAction(c('Fl  '), d, DialogModes.NO);
  }
  try {
    app.displayDialogs = DialogModes.NO;
    app.currentTool = 'paintbrushTool';
    options = getOptions();
    var opt = new ActionDescriptor();
    opt.fromStream(options.toStream());
    var tip = new ActionDescriptor();
    tip.putUnitDouble(s('diameter'), s('pixelsUnit'), 32);
    tip.putUnitDouble(s('hardness'), s('percentUnit'), 100);
    tip.putUnitDouble(s('roundness'), s('percentUnit'), 100);
    tip.putUnitDouble(s('spacing'), s('percentUnit'), 10);
    opt.putObject(s('brush'), s('computedBrush'), tip);
    opt.putInteger(s('flow'), 100);
    opt.putInteger(s('opacity'), 100);
    opt.putEnumerated(s('mode'), s('blendMode'), s('normal'));
    var disabled = [
      'useTipDynamics',
      'useScatter',
      'useTexture',
      'useColorDynamics',
      'usePaintDynamics',
      'useBrushPose',
      'usePressureOverridesOpacity',
      'usePressureOverridesSize',
      'wetEdges',
      'noise',
      'repeat',
      'smoothing',
      'pressureSmoothing'
    ];
    for (var k = 0; k < disabled.length; k++) opt.putBoolean(s(disabled[k]), false);
    var dual = opt.getObjectValue(s('dualBrush'));
    dual.putBoolean(s('useDualBrush'), false);
    opt.putObject(s('dualBrush'), s('dualBrush'), dual);
    setOptions(opt);
    doc = app.documents.add(
      UnitValue(32, 'px'),
      UnitValue(32, 'px'),
      72,
      'Gray interpretation probe',
      NewDocumentMode.RGB,
      DocumentFill.WHITE,
      1,
      BitsPerChannelType.EIGHT,
      'sRGB IEC61966-2.1'
    );
    var levels = [0, 25, 50, 75, 100, 0.1, 1.5, 33.333, 49.999, 50.001, 89.999, 90.001, 99.9];
    for (var index = 0; index < levels.length; index++) {
      var i = levels[index];
      var color = new SolidColor();
      color.gray.gray = i;
      doc.selection.selectAll();
      doc.selection.fill(color);
      var direct = sample();
      app.foregroundColor = color;
      var fgRgb = app.foregroundColor.rgb.hexValue;
      doc.selection.fill(app.foregroundColor);
      var foregroundFill = sample();
      fillAction(i);
      var amFill = sample();
      var ref = new ActionReference();
      ref.putProperty(c('Clr '), c('FrgC'));
      var d = new ActionDescriptor();
      d.putReference(c('null'), ref);
      d.putObject(c('T   '), c('Grsc'), gray(i));
      executeAction(c('setd'), d, DialogModes.NO);
      var amFgRgb = app.foregroundColor.rgb.hexValue;
      doc.selection.fill(app.foregroundColor);
      var amFgFill = sample();
      var white = new SolidColor();
      white.rgb.hexValue = 'FFFFFF';
      doc.selection.fill(white);
      doc.selection.deselect();
      var pts = [];
      for (var x = 8; x <= 24; x += 16) {
        var pp = new PathPointInfo();
        pp.anchor = [x, 16];
        pp.leftDirection = pp.rightDirection = pp.anchor;
        pp.kind = PointKind.CORNERPOINT;
        pts.push(pp);
      }
      var sub = new SubPathInfo();
      sub.closed = false;
      sub.operation = ShapeOperation.SHAPEADD;
      sub.entireSubPath = pts;
      var path = doc.pathItems.add('Gray stroke', [sub]);
      path.strokePath(ToolType.BRUSH, false);
      path.remove();
      var brushed = sample();
      rows.push([i, direct, fgRgb, foregroundFill, amFill, amFgRgb, amFgFill, brushed].join(','));
    }
    return (
      'gray,directFill,foregroundRGB,foregroundFill,descriptorFill,descriptorForegroundRGB,descriptorForegroundFill,brushPixel\n' +
      rows.join('\n')
    );
  } finally {
    if (doc) doc.close(SaveOptions.DONOTSAVECHANGES);
    if (options) setOptions(options);
    app.currentTool = tool;
    app.foregroundColor = fg;
    app.displayDialogs = dlg;
    if (old) app.activeDocument = old;
  }
})();
