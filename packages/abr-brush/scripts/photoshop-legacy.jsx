/** Compare Legacy and pressureSmoothing flags on controlled native Brush strokes.
 * Run through Photoshop's JavaScript API; output goes to the OS temporary folder.
 * Restores the active document, tool descriptor, foreground and dialog preference.
 * No ruler preference writes: Photoshop 26 can open a blocking dialog for those writes.
 */
(function () {
  var output = new Folder(Folder.temp + '/paint-native-legacy-calibration');
  if (!output.exists && !output.create()) throw new Error('Cannot create calibration directory');
  var s = stringIDToTypeID;
  var originalDocument = app.documents.length ? app.activeDocument : null;
  var originalTool = app.currentTool;
  var originalForeground = app.foregroundColor;
  var originalDialogs = app.displayDialogs;
  var originalOptions;
  var doc;
  var log = [];
  try {
    app.currentTool = 'paintbrushTool';
    originalOptions = getOptions();
    var recovery = new File(output + '/brush-tool-before.bin');
    recovery.encoding = 'BINARY';
    recovery.open('w');
    recovery.write(originalOptions.toStream());
    recovery.close();
    app.displayDialogs = DialogModes.NO;
    var black = new SolidColor();
    black.rgb.red = black.rgb.green = black.rgb.blue = 0;
    app.foregroundColor = black;
    log.push('Photoshop ' + app.version);
    var cases = [];
    for (var simulated = 0; simulated < 2; simulated++)
      for (var legacy = 0; legacy < 2; legacy++)
        for (var smooth = 0; smooth < 2; smooth++)
          cases.push(['pressure' + simulated + '-legacy' + legacy + '-smooth' + smooth, simulated, legacy, smooth]);
    for (var i = 0; i < cases.length; i++) {
      var test = cases[i];
      configure(test[1], test[2], test[3]);
      log.push(test[0] + '\n' + descriptorJSON(getOptions()));
      doc = app.documents.add(
        UnitValue(512, 'px'),
        UnitValue(160, 'px'),
        72,
        'Brush research ' + test[0],
        NewDocumentMode.RGB,
        DocumentFill.WHITE,
        1,
        BitsPerChannelType.EIGHT,
        'sRGB IEC61966-2.1'
      );
      var coordinates = [
        [64, 80],
        [448, 80]
      ];
      var points = [];
      for (var j = 0; j < coordinates.length; j++) {
        var point = new PathPointInfo();
        point.anchor = coordinates[j];
        point.leftDirection = coordinates[j];
        point.rightDirection = coordinates[j];
        point.kind = PointKind.CORNERPOINT;
        points.push(point);
      }
      var subpath = new SubPathInfo();
      subpath.closed = false;
      subpath.operation = ShapeOperation.SHAPEADD;
      subpath.entireSubPath = points;
      var path = doc.pathItems.add('Probe path', [subpath]);
      path.strokePath(ToolType.BRUSH, !!test[1]);
      path.remove();
      var png = new PNGSaveOptions();
      doc.saveAs(new File(output + '/' + test[0] + '.png'), png, true, Extension.LOWERCASE);
      doc.close(SaveOptions.DONOTSAVECHANGES);
      doc = null;
    }
    log.push('Completed all ' + cases.length + ' cases.');
  } catch (error) {
    log.push('ERROR line ' + error.line + ': ' + error.message);
    throw error;
  } finally {
    if (doc) doc.close(SaveOptions.DONOTSAVECHANGES);
    if (originalOptions) {
      setOptions(originalOptions);
      log.push('Brush options restored exactly: ' + (descriptorJSON(getOptions()) === descriptorJSON(originalOptions)));
    }
    app.currentTool = originalTool;
    app.foregroundColor = originalForeground;
    app.displayDialogs = originalDialogs;
    if (originalDocument) app.activeDocument = originalDocument;
    var file = new File(output + '/probe-log.txt');
    file.encoding = 'UTF8';
    file.open('w');
    file.write(log.join('\n'));
    file.close();
  }
  return log[log.length - 2] + '\n' + log[log.length - 1];

  /** Read actual current tool settings so every fixture records its effective configuration. */
  function getOptions() {
    var reference = new ActionReference();
    reference.putEnumerated(s('application'), s('ordinal'), s('targetEnum'));
    return executeActionGet(reference).getObjectValue(s('currentToolOptions'));
  }

  /** Set the Brush Tool descriptor without creating or replacing a saved preset. */
  function setOptions(options) {
    var reference = new ActionReference();
    reference.putClass(s('paintbrushTool'));
    var descriptor = new ActionDescriptor();
    descriptor.putReference(s('null'), reference);
    descriptor.putObject(s('to'), s('currentToolOptions'), options);
    executeAction(s('set'), descriptor, DialogModes.NO);
  }

  /** Toggle only the two stored flags on a controlled soft round brush. */
  function configure(simulated, legacy, smooth) {
    var options = new ActionDescriptor();
    options.fromStream(originalOptions.toStream());
    var tip = new ActionDescriptor();
    tip.putUnitDouble(s('diameter'), s('pixelsUnit'), 63.5);
    tip.putUnitDouble(s('hardness'), s('percentUnit'), 35);
    tip.putUnitDouble(s('angle'), s('angleUnit'), 0);
    tip.putUnitDouble(s('roundness'), s('percentUnit'), 100);
    tip.putUnitDouble(s('spacing'), s('percentUnit'), 17);
    tip.putBoolean(s('flipX'), false);
    tip.putBoolean(s('flipY'), false);
    options.putObject(s('brush'), s('computedBrush'), tip);
    options.putInteger(s('opacity'), 75);
    options.putInteger(s('flow'), 35);
    options.putEnumerated(s('mode'), s('blendMode'), s('normal'));
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
      'brushProjection',
      'flipX',
      'flipY'
    ];
    for (var i = 0; i < disabled.length; i++) options.putBoolean(s(disabled[i]), false);
    options.putDouble(s('smoothingValue'), 0);
    var dual = options.getObjectValue(s('dualBrush'));
    dual.putBoolean(s('useDualBrush'), false);
    options.putObject(s('dualBrush'), s('dualBrush'), dual);
    var neutral = new ActionDescriptor();
    neutral.putInteger(charIDToTypeID('bVTy'), 0);
    neutral.putInteger(charIDToTypeID('fStp'), 25);
    neutral.putUnitDouble(s('jitter'), s('percentUnit'), 0);
    neutral.putUnitDouble(s('minimum'), s('percentUnit'), 0);
    options.putObject(charIDToTypeID('opVr'), charIDToTypeID('brVr'), neutral);
    options.putObject(charIDToTypeID('prVr'), charIDToTypeID('brVr'), neutral);
    options.putObject(s('angleDynamics'), charIDToTypeID('brVr'), neutral);
    options.putObject(s('roundnessDynamics'), charIDToTypeID('brVr'), neutral);
    neutral.putInteger(charIDToTypeID('bVTy'), simulated ? 2 : 0);
    options.putObject(charIDToTypeID('szVr'), charIDToTypeID('brVr'), neutral);
    options.putUnitDouble(s('minimumDiameter'), s('percentUnit'), 0);
    options.putBoolean(s('useTipDynamics'), !!simulated);
    options.putBoolean(s('useLegacy'), !!legacy);
    options.putBoolean(s('pressureSmoothing'), !!smooth);
    setOptions(options);
  }

  /** Serialize descriptors through Photoshop's own conversion event. */
  function descriptorJSON(value) {
    var descriptor = new ActionDescriptor();
    descriptor.putObject(s('object'), s('object'), value);
    return executeAction(s('convertJSONdescriptor'), descriptor, DialogModes.NO).getString(s('json'));
  }
})();
