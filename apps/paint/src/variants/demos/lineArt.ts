/**
 * Line art for the fill demo: a house, a sun, a cloud and a flower drawn as closed dark outlines on transparent
 * paper, as a PNG file ready to place as a layer.
 */
export async function lineArtFile() {
  const canvas = new OffscreenCanvas(1400, 900);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is not available.');
  }

  context.strokeStyle = '#2b2b2b';
  context.lineWidth = 9;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  // House: walls, roof, door and window.
  outline(context, () => context.rect(200, 430, 380, 320));
  outline(context, () => {
    context.moveTo(170, 440);
    context.lineTo(390, 230);
    context.lineTo(610, 440);
    context.closePath();
  });
  outline(context, () => context.rect(330, 580, 110, 170));
  outline(context, () => context.rect(230, 490, 80, 70));
  outline(context, () => context.rect(470, 490, 80, 70));
  // Sun with rays.
  outline(context, () => context.arc(1150, 190, 90, 0, Math.PI * 2));
  for (let ray = 0; ray < 12; ray++) {
    const angle = (ray / 12) * Math.PI * 2;
    outline(context, () => {
      context.moveTo(1150 + Math.cos(angle) * 115, 190 + Math.sin(angle) * 115);
      context.lineTo(1150 + Math.cos(angle) * 160, 190 + Math.sin(angle) * 160);
    });
  }

  // Cloud.
  outline(context, () => {
    context.moveTo(700, 260);
    context.arc(760, 230, 60, Math.PI, Math.PI * 1.75);
    context.arc(850, 210, 70, Math.PI * 1.15, Math.PI * 1.9);
    context.arc(930, 250, 55, Math.PI * 1.35, Math.PI * 0.3);
    context.lineTo(700, 300);
    context.arc(700, 280, 20, Math.PI * 0.5, Math.PI * 1.5);
  });
  // Flower: stem, leaf, petals around a center.
  outline(context, () => {
    context.moveTo(960, 780);
    context.quadraticCurveTo(990, 680, 970, 600);
  });
  outline(context, () => {
    context.moveTo(975, 720);
    context.quadraticCurveTo(1060, 660, 1080, 700);
    context.quadraticCurveTo(1040, 750, 975, 720);
  });
  for (let petal = 0; petal < 6; petal++) {
    const angle = (petal / 6) * Math.PI * 2;
    outline(context, () => context.ellipse(970 + Math.cos(angle) * 55, 530 + Math.sin(angle) * 55, 42, 26, angle, 0, Math.PI * 2));
  }

  outline(context, () => context.arc(970, 530, 30, 0, Math.PI * 2));
  // Ground line.
  outline(context, () => {
    context.moveTo(80, 780);
    context.lineTo(1320, 780);
  });
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new File([blob], 'Line art.png', { type: 'image/png' });
}

/** Strokes one path built by `build`. */
function outline(context: OffscreenCanvasRenderingContext2D, build: () => void) {
  context.beginPath();
  build();
  context.stroke();
}
