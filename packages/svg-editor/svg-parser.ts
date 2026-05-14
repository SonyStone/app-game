import { SVGGraphicsElementType, SVGNode } from './svg-node';

export function svgParser(svgString: string): SVGNode {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  // Check for parsing errors
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    throw new Error('Invalid SVG: ' + errorNode.textContent);
  }

  const svgElement = doc.documentElement;
  if (svgElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('Root element must be <svg>');
  }

  return parseElement(svgElement);
}

function parseElement(element: Element): SVGNode {
  const tagName = element.tagName.toLowerCase() as SVGGraphicsElementType;

  // Validate if it's a supported SVG element
  const supportedElements = [
    'svg',
    'circle',
    'line',
    'ellipse',
    'rect',
    'polygon',
    'polyline',
    'path',
    'text',
    'image',
    'g'
  ];
  if (!supportedElements.includes(tagName)) {
    throw new Error(`Unsupported SVG element: ${tagName}`);
  }

  // Parse attributes
  const attributes: Record<string, string> = {};
  for (const attr of element.attributes) {
    // Skip xmlns and other namespace attributes for cleaner output
    if (!attr.name.startsWith('xmlns')) {
      attributes[attr.name] = attr.value;
    }
  }

  // Parse children
  const children: SVGNode[] = [];
  for (const child of element.children) {
    try {
      children.push(parseElement(child));
    } catch (error) {
      // Skip unsupported elements but continue parsing
      console.warn(`Skipping unsupported element: ${child.tagName}`);
    }
  }

  // Create the SVGNode
  const node: SVGNode = {
    component: tagName,
    ...attributes,
    ...(children.length > 0 && { children })
  } as SVGNode;

  return node;
}

export function parseFromFile(file: File): Promise<SVGNode> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const svgString = e.target?.result as string;
        const svgNode = svgParser(svgString);
        resolve(svgNode);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

// Utility function to validate SVG string before parsing
export function validateSVG(svgString: string): { isValid: boolean; error?: string } {
  try {
    svgParser(svgString);
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error'
    };
  }
}
