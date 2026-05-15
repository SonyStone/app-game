// ============================================================================
// MARK: Demo Data
// ============================================================================

export type DemoItem = {
  id: string;
  label: string;
  color: string;
};

export function createDemoItems(count = 8): DemoItem[] {
  const colors = [
    '#e74c3c',
    '#3498db',
    '#2ecc71',
    '#f39c12',
    '#9b59b6',
    '#1abc9c',
    '#e67e22',
    '#2980b9',
    '#c0392b',
    '#27ae60',
    '#8e44ad',
    '#d35400'
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    label: `Item ${i + 1}`,
    color: colors[i % colors.length]!
  }));
}

export function createGridItems(count = 12): DemoItem[] {
  return createDemoItems(count);
}

// ============================================================================
// MARK: Nested Demo Data
// ============================================================================

export type NodeData = {
  id: string;
  label: string;
  color: string;
  isGroup: boolean;
};

/** Static node definitions — never mutated, identity-stable for <For>. */
export const NODES: Record<string, NodeData> = {
  // Groups
  fruits: { id: 'fruits', label: '🍎 Fruits', color: '#e74c3c', isGroup: true },
  veggies: { id: 'veggies', label: '🥕 Vegetables', color: '#2ecc71', isGroup: true },
  grains: { id: 'grains', label: '🌾 Grains', color: '#d4a017', isGroup: true },
  dairy: { id: 'dairy', label: '🧀 Dairy', color: '#f5f5dc', isGroup: true },
  // Fruits
  apple: { id: 'apple', label: 'Apple', color: '#e74c3c', isGroup: false },
  banana: { id: 'banana', label: 'Banana', color: '#f1c40f', isGroup: false },
  cherry: { id: 'cherry', label: 'Cherry', color: '#c0392b', isGroup: false },
  mango: { id: 'mango', label: 'Mango', color: '#ff9933', isGroup: false },
  grape: { id: 'grape', label: 'Grape', color: '#8e44ad', isGroup: false },
  // Vegetables
  carrot: { id: 'carrot', label: 'Carrot', color: '#e67e22', isGroup: false },
  pea: { id: 'pea', label: 'Pea', color: '#27ae60', isGroup: false },
  broccoli: { id: 'broccoli', label: 'Broccoli', color: '#1abc9c', isGroup: false },
  pepper: { id: 'pepper', label: 'Pepper', color: '#e74c3c', isGroup: false },
  // Grains
  rice: { id: 'rice', label: 'Rice', color: '#ecf0f1', isGroup: false },
  oats: { id: 'oats', label: 'Oats', color: '#c8b88a', isGroup: false },
  wheat: { id: 'wheat', label: 'Wheat', color: '#d4a017', isGroup: false },
  // Dairy
  milk: { id: 'milk', label: 'Milk', color: '#f0f0f0', isGroup: false },
  cheese: { id: 'cheese', label: 'Cheese', color: '#f4d03f', isGroup: false },
  yogurt: { id: 'yogurt', label: 'Yogurt', color: '#fadbd8', isGroup: false }
};

/** Tree structure as parentKey → ordered child IDs. */
export function createInitialTree(): Record<string, string[]> {
  return {
    root: ['fruits', 'veggies', 'grains', 'dairy'],
    fruits: ['apple', 'banana', 'cherry', 'mango', 'grape'],
    veggies: ['carrot', 'pea', 'broccoli', 'pepper'],
    grains: ['rice', 'oats', 'wheat'],
    dairy: ['milk', 'cheese', 'yogurt']
  };
}
