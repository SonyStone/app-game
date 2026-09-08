/** Compares SolidColor conversion with native RGB/8 fills in a temporary sRGB document. */
(function(){
 var oldDocument=app.documents.length?app.activeDocument:null, oldDialogs=app.displayDialogs;
 var doc=null,rows=[];
 try {
  app.displayDialogs=DialogModes.NO;
  doc=app.documents.add(UnitValue(32,'px'),UnitValue(32,'px'),72,'Lab color probe',NewDocumentMode.RGB,DocumentFill.WHITE,1,BitsPerChannelType.EIGHT,'sRGB IEC61966-2.1');
  var labs=[], lightness=[0,5,25,50,75,95,100], chroma=[[0,0],[20,10],[-20,10],[10,-20],[40,40],[-40,40],[40,-40],[-40,-40],[127,127],[-128,-128]];
 for(var l=0;l<lightness.length;l++) for(var c=0;c<chroma.length;c++)labs.push([lightness[l],chroma[c][0],chroma[c][1]]);
  for(var i=0;i<labs.length;i++){
   var color=new SolidColor(); color.lab.l=labs[i][0];color.lab.a=labs[i][1];color.lab.b=labs[i][2];
   doc.selection.selectAll();doc.selection.fill(color,ColorBlendMode.NORMAL,100,false);doc.selection.deselect();
   var sample=doc.colorSamplers.add([UnitValue(16,'px'),UnitValue(16,'px')]);var rgb=sample.color.rgb;
   rows.push('{"lab":['+labs[i].join(',')+'],"solid":['+[color.rgb.red,color.rgb.green,color.rgb.blue].join(',')+'],"pixel":['+[rgb.red,rgb.green,rgb.blue].join(',')+']}');
   sample.remove();
  }
  var file=new File(Folder.temp+'/paint-native-lab-raster.json');file.encoding='UTF8';if(!file.open('w'))throw Error('Cannot write Lab raster probe');file.write('{"photoshop":"'+app.version+'","profile":"'+doc.colorProfileName+'","cases":['+rows.join(',')+']}');file.close();return file.fsName;
 } finally {
  if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);
  if(oldDocument)app.activeDocument=oldDocument;
  app.displayDialogs=oldDialogs;
 }
})();
