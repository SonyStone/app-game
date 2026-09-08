/** Read color conversions from Photoshop without changing tools, documents or preferences. */
(function () {
    var cases = [];
    var hues = [0, 30, 60, 90, 120, 180, 240, 300, 359.5, 360];
    var levels = [[100,100],[50,75],[0,50],[73.25,42.5]];
    for (var i = 0; i < hues.length; i++) {
        for (var j = 0; j < levels.length; j++) {
            var color = new SolidColor();
            color.hsb.hue = hues[i];
            color.hsb.saturation = levels[j][0];
            color.hsb.brightness = levels[j][1];
            var rgb = color.rgb;
            cases.push('{"hsb":[' + [hues[i],levels[j][0],levels[j][1]].join(',') + '],"rgb":[' + [rgb.red,rgb.green,rgb.blue].join(',') + '],"hex":"#' + rgb.hexValue.toLowerCase() + '"}');
        }
    }
    var grays = [];
    for (var gray = 0; gray <= 100; gray += 25) {
        var c = new SolidColor(); c.gray.gray = gray;
        grays.push('{"gray":' + gray + ',"rgb":[' + [c.rgb.red,c.rgb.green,c.rgb.blue].join(',') + ']}');
    }
    var file = new File(Folder.temp + '/paint-native-colors.json');
    file.encoding = 'UTF8';
    if (!file.open('w')) throw new Error('Cannot write color probe');
    file.write('{"photoshop":"' + app.version + '","hsb":[' + cases.join(',') + '],"gray":[' + grays.join(',') + ']}\n');
    file.close();
    return file.fsName;
})();
