/** Reads Lab conversions and the active color configuration without modifying application state. */
(function () {
    var s = stringIDToTypeID;
    var reference = new ActionReference();
    reference.putProperty(s('property'), s('colorSettings'));
    reference.putEnumerated(s('application'), s('ordinal'), s('targetEnum'));
    var wrapper = new ActionDescriptor();
    wrapper.putObject(s('object'), s('object'), executeActionGet(reference));
    var configuration = executeAction(s('convertJSONdescriptor'), wrapper, DialogModes.NO).getString(s('json'));
    var cases = [];
    var lightness = [0, 5, 25, 50, 75, 95, 100];
    var chroma = [[0,0],[20,10],[-20,10],[10,-20],[40,40],[-40,40],[40,-40],[-40,-40],[127,127],[-128,-128]];
    for (var i = 0; i < lightness.length; i++) {
        for (var j = 0; j < chroma.length; j++) {
            var color = new SolidColor();
            color.lab.l = lightness[i];
            color.lab.a = chroma[j][0];
            color.lab.b = chroma[j][1];
            var rgb = color.rgb;
            cases.push('{"lab":[' + [lightness[i],chroma[j][0],chroma[j][1]].join(',') + '],"rgb":[' + [rgb.red,rgb.green,rgb.blue].join(',') + '],"hex":"#' + rgb.hexValue.toLowerCase() + '"}');
        }
    }
    var file = new File(Folder.temp + '/paint-native-lab-colors.json');
    file.encoding = 'UTF8';
    if (!file.open('w')) throw new Error('Cannot write Lab color probe');
    file.write('{"photoshop":"' + app.version + '","configuration":' + configuration + ',"cases":[' + cases.join(',') + ']}\n');
    file.close();
    return file.fsName;
})();
