import {
  attributeEnumValues,
  colorAttributesWithCurrentColorAllowed,
  colorAttributesWithNoneAllowed,
  colorAttributesWithUrlAllowed,
  defaultElements,
  getAttributeDefault,
  getAttributeType,
  getRecognizedAttributes,
  iconForElement,
  iconForNode,
  isAttributeRecognized,
  isRecognizedElement,
  isValidChild,
  recognizedElements,
  type AttributeType,
  type RecognizedElement
} from '../svg-db';
import type { SvgElementNode } from '../svg-model';
import { getHandles } from './handles';
import type { SvgIcon } from './svg-icon';
import type { HandleDescriptor } from './types';

export interface SvgElementCapability {
  readonly name: RecognizedElement;
  readonly defaults: Readonly<Record<string, string>>;
  readonly attributes: readonly string[];
  readonly icon: SvgIcon;
}

export interface SvgAttributeCapability {
  readonly name: string;
  readonly type: AttributeType;
  readonly defaultValue: string;
  readonly enumValues: readonly string[];
  readonly color: SvgColorAttributeCapability;
}

export interface SvgColorAttributeCapability {
  readonly allowNone: boolean;
  readonly allowUrl: boolean;
  readonly allowCurrentColor: boolean;
}

export interface SvgCapabilityRegistry {
  readonly elements: readonly SvgElementCapability[];
  readonly getElement: (name: string) => SvgElementCapability | undefined;
  readonly getAttribute: (name: string) => SvgAttributeCapability;
  readonly getAttributeDefault: (name: string) => string;
  readonly getAttributeType: (name: string) => AttributeType;
  readonly iconForElement: (name: string) => SvgIcon;
  readonly iconForNode: (kind: 'text' | 'comment' | 'cdata') => SvgIcon;
  readonly isAttributeRecognized: (elementName: string, attributeName: string) => boolean;
  readonly isCompactAttribute: (elementName: string, attributeName: string) => boolean;
  readonly isRecognizedElement: (name: string) => name is RecognizedElement;
  readonly isValidChild: (parentName: string, childName: string) => boolean;
  readonly getHandles: (root: SvgElementNode, selectedIds: readonly string[]) => readonly HandleDescriptor[];
}

export function createSvgCapabilityRegistry(
  capabilities: readonly SvgElementCapability[] = recognizedElements.map((name) => ({
    name,
    defaults: defaultElements[name],
    attributes: getRecognizedAttributes(name),
    icon: iconForElement(name)
  }))
): SvgCapabilityRegistry {
  const byName = new Map(capabilities.map((capability) => [capability.name, capability]));

  return {
    elements: capabilities,
    getElement: (name) => byName.get(name as RecognizedElement),
    getAttribute: createAttributeCapability,
    getAttributeDefault,
    getAttributeType,
    iconForElement,
    iconForNode,
    isAttributeRecognized,
    isCompactAttribute: (elementName, attributeName) => {
      if (!isAttributeRecognized(elementName, attributeName)) {
        return false;
      }

      const type = getAttributeType(attributeName);
      return type !== 'pathdata' && !(type === 'list' && attributeName === 'points');
    },
    isRecognizedElement,
    isValidChild,
    getHandles
  };
}

export const svgCapabilities = createSvgCapabilityRegistry();

function createAttributeCapability(name: string): SvgAttributeCapability {
  return {
    name,
    type: getAttributeType(name),
    defaultValue: getAttributeDefault(name),
    enumValues: enumValuesForAttribute(name),
    color: {
      allowNone: includesString(colorAttributesWithNoneAllowed, name),
      allowUrl: includesString(colorAttributesWithUrlAllowed, name),
      allowCurrentColor: includesString(colorAttributesWithCurrentColorAllowed, name)
    }
  };
}

function enumValuesForAttribute(name: string): readonly string[] {
  const values: Record<string, readonly string[]> = attributeEnumValues;
  return values[name] ?? [];
}

function includesString(values: readonly string[], value: string): boolean {
  return values.some((item) => item === value);
}
