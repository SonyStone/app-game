/** Compare the selected Wet Blender's native size and scatter in document pixels; restore both tools. */
(function () {
  var s = stringIDToTypeID,
    c = charIDToTypeID,
    out = File($.fileName).parent.parent.fsName + '/fixtures/photoshop-wet-blender/',
    oldDoc = app.documents.length ? app.activeDocument : null,
    oldTool = app.currentTool,
    oldUnits = app.preferences.rulerUnits,
    oldColor = app.foregroundColor,
    oldDialogs = app.displayDialogs,
    doc,
    brushOld,
    smudgeOld,
    log = [];
  function get() {
    var r = new ActionReference();
    r.putEnumerated(s('application'), s('ordinal'), s('targetEnum'));
    return executeActionGet(r).getObjectValue(s('currentToolOptions'));
  }
  function set(tool, o) {
    var r = new ActionReference();
    r.putClass(s(tool));
    var d = new ActionDescriptor();
    d.putReference(s('null'), r);
    d.putObject(s('to'), s('currentToolOptions'), o);
    executeAction(s('set'), d, DialogModes.NO);
  }
  function clone(d) {
    var x = new ActionDescriptor();
    x.fromStream(d.toStream());
    return x;
  }
  function json(d) {
    var x = new ActionDescriptor();
    x.putObject(s('object'), s('object'), d);
    return executeAction(s('convertJSONdescriptor'), x, DialogModes.NO).getString(s('json'));
  }
  function write(name, value) {
    var f = new File(out + name);
    f.encoding = 'UTF8';
    if (!f.open('w')) throw Error('Cannot write ' + name);
    f.write(value);
    f.close();
  }
  function rgb(r, g, b) {
    var col = new SolidColor();
    col.rgb.red = r;
    col.rgb.green = g;
    col.rgb.blue = b;
    return col;
  }
  function fill(rect, color) {
    doc.selection.select(rect);
    doc.selection.fill(color);
    doc.selection.deselect();
  }
  try {
    app.currentTool = 'smudgeTool';
    smudgeOld = get();
    write('smudge-original.json', json(smudgeOld));
    if (smudgeOld.getObjectValue(s('brush')).getString(s('sampledData')) !== '8531a73c-a39f-11d5-b9d8-84b2aced726a')
      throw Error('Unexpected selected smudge tip');
    app.currentTool = 'paintbrushTool';
    brushOld = get();
    app.displayDialogs = DialogModes.NO;
    app.preferences.rulerUnits = Units.PIXELS;
    app.foregroundColor = rgb(0, 0, 0);
    var cases = [
      ['tip', false, 0],
      ['scatter100', false, 100],
      ['scatter208', false, 208],
      ['smudge', true, 208]
    ];
    for (var i = 0; i < cases.length; i++) {
      var name = cases[i][0],
        isSmudge = cases[i][1],
        scatter = cases[i][2],
        tool = isSmudge ? 'smudgeTool' : 'paintbrushTool',
        o = clone(smudgeOld);
      app.currentTool = tool;
      o.putInteger(s('opacity'), 100);
      o.putInteger(s('flow'), 100);
      o.putBoolean(s('useScatter'), scatter > 0);
      o.putBoolean(s('useTexture'), false);
      o.putBoolean(s('useColorDynamics'), false);
      o.putBoolean(s('usePaintDynamics'), false);
      if (scatter) {
        var sd = o.getObjectValue(s('scatterDynamics'));
        sd.putUnitDouble(s('jitter'), s('percentUnit'), scatter);
        o.putObject(s('scatterDynamics'), c('brVr'), sd);
      }
      var du = new ActionDescriptor();
      du.putBoolean(s('useDualBrush'), false);
      o.putObject(s('dualBrush'), s('dualBrush'), du);
      set(tool, o);
      write(name + '.json', json(get()));
      doc = app.documents.add(
        768,
        1024,
        72,
        'Wet Blender probe ' + name,
        NewDocumentMode.RGB,
        DocumentFill.WHITE,
        1,
        BitsPerChannelType.EIGHT,
        'sRGB IEC61966-2.1'
      );
      if (isSmudge) {
        fill(
          [
            [0, 0],
            [384, 0],
            [384, 1024],
            [0, 1024]
          ],
          rgb(255, 0, 0)
        );
        fill(
          [
            [384, 0],
            [768, 0],
            [768, 1024],
            [384, 1024]
          ],
          rgb(0, 128, 200)
        );
        fill(
          [
            [0, 600],
            [768, 600],
            [768, 1024],
            [0, 1024]
          ],
          rgb(0, 210, 90)
        );
        doc.saveAs(new File(out + 'source.png'), new PNGSaveOptions(), true, Extension.LOWERCASE);
      }
      var points = [];
      for (var j = 0; j < 2; j++) {
        var p = new PathPointInfo();
        p.anchor = [384, j ? 896 : 128];
        p.leftDirection = p.anchor;
        p.rightDirection = p.anchor;
        p.kind = PointKind.CORNERPOINT;
        points.push(p);
      }
      var sub = new SubPathInfo();
      sub.closed = false;
      sub.operation = ShapeOperation.SHAPEADD;
      sub.entireSubPath = points;
      var path = doc.pathItems.add('Probe', [sub]);
      path.strokePath(isSmudge ? ToolType.SMUDGE : ToolType.BRUSH, false);
      path.remove();
      doc.saveAs(new File(out + name + '.png'), new PNGSaveOptions(), true, Extension.LOWERCASE);
      doc.close(SaveOptions.DONOTSAVECHANGES);
      doc = null;
      log.push('OK ' + name);
    }
  } finally {
    if (doc) doc.close(SaveOptions.DONOTSAVECHANGES);
    if (brushOld) {
      app.currentTool = 'paintbrushTool';
      set('paintbrushTool', brushOld);
      log.push('Brush restored: ' + (json(get()) === json(brushOld)));
    }
    if (smudgeOld) {
      app.currentTool = 'smudgeTool';
      set('smudgeTool', smudgeOld);
      log.push('Smudge restored: ' + (json(get()) === json(smudgeOld)));
    }
    app.currentTool = oldTool;
    app.foregroundColor = oldColor;
    app.preferences.rulerUnits = oldUnits;
    app.displayDialogs = oldDialogs;
    if (oldDoc) app.activeDocument = oldDoc;
    write('log.txt', log.join('\n'));
  }
  return log.join('\n');
})();
