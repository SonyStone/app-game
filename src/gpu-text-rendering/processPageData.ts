import { GL_BUFFER_TYPE, GL_STATIC_VARIABLES } from '@webgl/static-variables';

export function processPageData(
  gl: WebGLRenderingContext,
  canvas: HTMLCanvasElement,
  pageData: any
) {
  console.log('Loaded ' + pageData.length + ' page(s)');

  computePageLocations(canvas, pageData);
  const pageVerts = new Float32Array(pageData.length * 6 * 2);

  for (let i = 0; i < pageData.length; i++) {
    const j = i * 6 * 2;
    const x0 = -pageData[i].x;
    const y0 = pageData[i].y;
    const x1 = x0 + pageData[i].width / pageData[0].width;
    const y1 = y0 + pageData[i].height / pageData[0].height;
    pageVerts[j + 0] = x0;
    pageVerts[j + 1] = y0;
    pageVerts[j + 2] = x0;
    pageVerts[j + 3] = y0;
    pageVerts[j + 4] = x1;
    pageVerts[j + 5] = y0;
    pageVerts[j + 6] = x0;
    pageVerts[j + 7] = y1;
    pageVerts[j + 8] = x1;
    pageVerts[j + 9] = y1;
    pageVerts[j + 10] = x1;
    pageVerts[j + 11] = y1;
  }
  const pageBuffer = gl.createBuffer()!;
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, pageBuffer);
  gl.bufferData(
    GL_BUFFER_TYPE.ARRAY_BUFFER,
    pageVerts,
    GL_STATIC_VARIABLES.STATIC_DRAW
  );

  return { pageBuffer, pageData };
}

function computePageLocations(canvas: HTMLCanvasElement, pageData: any) {
  const cols = Math.floor(
    Math.sqrt(
      (((pageData.length / canvas.height) * canvas.width) / pageData[0].width) *
        pageData[0].height
    )
  );

  for (let i = 0; i < pageData.length; i++) {
    const page = pageData[i];
    page.x = -(i % cols);
    page.y = Math.floor(i / cols);

    const gap = 1.06;
    page.x *= gap;
    page.y *= gap;
  }
}
