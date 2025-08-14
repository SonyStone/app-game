import { Graphics } from '@packages/solid-pixi';
import { GraphicsOptions } from 'pixi.js';

export default function GraphicsSimple(props: Omit<GraphicsOptions, 'children'>) {
  return (
    <Graphics
      ref={(graphics) => {
        // Rectangle
        graphics.rect(50, 50, 100, 100);
        graphics.fill({
          color: 0xde3249
        });

        // Rectangle + line style 1
        graphics.rect(200, 50, 100, 100);
        graphics.fill({
          color: 0x650a5a
        });
        graphics.stroke({ width: 2, color: 0xfeeb77 });

        // Rectangle + line style 2
        graphics.rect(350, 50, 100, 100);
        graphics.fill({
          color: 0xc34288
        });
        graphics.stroke({ width: 10, color: 0xffbd01 });

        // Rectangle 2
        graphics.rect(530, 50, 140, 100);
        graphics.fill({
          color: 0xaa4f08
        });
        graphics.stroke({ width: 2, color: 0xffffff });

        // Circle
        graphics.circle(100, 250, 50);
        graphics.fill({
          color: 0xde3249,
          alpha: 1
        });

        // Circle + line style 1
        graphics.circle(250, 250, 50);
        graphics.fill({
          color: 0x650a5a,
          alpha: 1
        });
        graphics.stroke({ width: 2, color: 0xfeeb77 });

        // Circle + line style 2
        graphics.circle(400, 250, 50);
        graphics.fill({
          color: 0xc34288,
          alpha: 1
        });
        graphics.stroke({ width: 10, color: 0xffbd01 });

        // Ellipse + line style 2
        graphics.ellipse(600, 250, 80, 50);
        graphics.fill({
          color: 0xaa4f08,
          alpha: 1
        });
        graphics.stroke({ width: 2, color: 0xffffff });

        // Draw a shape
        graphics.moveTo(50, 350);
        graphics.lineTo(250, 350);
        graphics.lineTo(100, 400);
        graphics.lineTo(50, 350);
        graphics.fill({ color: 0xff3300 });
        graphics.stroke({ width: 4, color: 0xffd900 });

        // Draw a rounded rectangle
        graphics.roundRect(50, 440, 100, 100, 16);
        graphics.fill({ color: 0x650a5a, alpha: 0.25 });
        graphics.stroke({ width: 2, color: 0xff00ff });

        // Draw star
        graphics.star(360, 370, 5, 50);
        graphics.fill({ color: 0x35cc5a });
        graphics.stroke({ width: 2, color: 0xffffff });

        // Draw star 2
        graphics.star(280, 510, 7, 50);
        graphics.fill({ color: 0xffcc5a });
        graphics.stroke({ width: 2, color: 0xfffffd });

        // Draw star 3
        graphics.star(470, 450, 4, 50);
        graphics.fill({ color: 0x55335a });
        graphics.stroke({
          width: 4,
          color: 0xffffff
        });

        // Draw polygon
        const path = [600, 370, 700, 460, 780, 420, 730, 570, 590, 520];

        graphics.poly(path);
        graphics.fill({ color: 0x3500fa });
      }}
      {...props}
    />
  );
}
