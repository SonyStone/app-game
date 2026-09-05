import { describe, expect, it, vi } from 'vitest';
import type { IMeshCapture } from '../shared/capture/meshCapture';
import { buildPreviewGeometry, createPreviewNormalization, visitWireframeSegments } from './mesh-preview';

describe('mesh wireframe traversal', () => {
  it('does not connect triangle strips across primitive restarts or degenerate stitches', () => {
    const edges: string[] = [];
    visitWireframeSegments([0, 1, 2, 2, 3, 3, 4, 5, -1, 6, 7, 8], 5, (left, right) => {
      edges.push(`${Math.min(left, right)}:${Math.max(left, right)}`);
    });

    expect(edges).not.toContain('2:3');
    expect(edges).not.toContain('5:6');
    expect(edges).toContain('0:2');
    expect(edges).toContain('3:5');
    expect(edges).toContain('6:8');
  });

  it('covers a complete Sketchfab-sized triangle strip', () => {
    const elements = Array.from({ length: 31_511 }, (_, index) => index);

    expect(visitWireframeSegments(elements, 5, vi.fn())).toBe(63_019);
  });

  it('filters an anomalously long connector triangle from preview geometry', () => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let triangle = 0; triangle < 100; triangle++) {
      const offset = triangle * 3;
      positions.push(0, 0, 0, 1, 0, 0, 0, 1, 0);
      indices.push(offset, offset + 1, offset + 2);
    }
    positions.push(0, 0, 0, 1, 0, 0, 1_000, 1_000, 0);
    indices.push(300, 301, 302);

    const geometry = buildPreviewGeometry(createMesh(positions, indices));

    expect(geometry.triangles).toHaveLength(300);
    expect(Array.from(geometry.triangles)).not.toContain(302);
    expect(Array.from(geometry.edges)).not.toContain(302);
  });

  it('removes spatially degenerate strip stitches made from duplicate positions', () => {
    const geometry = buildPreviewGeometry(
      createMesh([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 2, 1, 0, 1, 2, 0], [0, 1, 2, 3, 4, 5], 5)
    );

    expect(Array.from(geometry.triangles)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps separate meshes in the same normalized coordinate system', () => {
    const left = createMesh([-11, -1, 0, -9, -1, 0, -10, 1, 0], [0, 1, 2]);
    const right = createMesh([9, -1, 0, 11, -1, 0, 10, 1, 0], [0, 1, 2]);
    const normalization = createPreviewNormalization([left, right]);

    const leftGeometry = buildPreviewGeometry(left, normalization);
    const rightGeometry = buildPreviewGeometry(right, normalization);

    expect(Math.max(leftGeometry.positions[0]!, leftGeometry.positions[3]!, leftGeometry.positions[6]!)).toBeLessThan(
      0
    );
    expect(
      Math.min(rightGeometry.positions[0]!, rightGeometry.positions[3]!, rightGeometry.positions[6]!)
    ).toBeGreaterThan(0);
  });
});

function createMesh(positions: number[], indices: number[], mode = 4): Extract<IMeshCapture, { status: 'available' }> {
  return {
    status: 'available',
    commandId: 1,
    mode,
    modeName: mode === 5 ? 'TRIANGLE_STRIP' : 'TRIANGLES',
    positionAttribute: 'position',
    positionSource: 'raw-buffer',
    positionSpace: 'buffer',
    availableAttributes: [{ name: 'position', dimensions: 3, type: 'FLOAT', location: 0 }],
    dimensions: 3,
    positions,
    indices,
    elementCount: indices.length,
    capturedElementCount: indices.length,
    instanceCount: 1,
    truncated: false
  };
}
