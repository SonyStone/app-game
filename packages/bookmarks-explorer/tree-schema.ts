import { z } from 'zod';

// const TREE_CREATE = 1000;
export const NODE_NEWROOT = 2000;
export const NODE_INSERT = 2001;
// const NODE_REPLACE = 2002;
// const NODE_DELETE = 2003;
// const NODE_MOVE = 2004;

// const NODE_UPDATE_CHROME_OBJ_DATA = 3005;
// const NODE_UPDATE_MARKS = 3006;

// const LOG_ERROR = 9000;
const EOF = 11111;

export type NodeNewRoot = z.infer<typeof NodeNewRootSchema>;
const NodeNewRootSchema = z.object({
  type: z.literal(NODE_NEWROOT),
  node: z.object({
    type: z.literal('session'),
    colapsed: z.literal(true).optional(),
    data: z.object({
      treeId: z.string(),
      nextDId: z.int(),
      nonDumpedDId: z.int()
    })
  })
});

export type Marks = z.infer<typeof marksSchema>;
const marksSchema = z.object({
  relicons: z.tuple([]),
  customTitle: z.string().optional(),
  customFavicon: z.string().optional()
});

export type Timestamp = z.infer<typeof timestampSchema>;
const timestampSchema = z.number().min(0).brand<'Timestamp'>();

export type UnixTimestamp = z.infer<typeof unixTimestampSchema>;
const unixTimestampSchema = z.int().min(0).brand<'UnixTimestamp'>();

export type Url = z.infer<typeof urlSchema>;
const urlSchema = z.string().brand<'Url'>();

export type DefaultNode = z.infer<typeof DefaultNodeSchema>;
const DefaultNodeSchema = z.object({
  marks: marksSchema,
  colapsed: z.literal(true).optional(),
  data: z.object({
    active: z.boolean().optional(),
    audible: z.boolean(),
    autoDiscardable: z.boolean(),
    discarded: z.boolean(),
    favIconUrl: urlSchema.optional(),
    groupId: z.number().optional(),
    highlighted: z.boolean().optional(),
    lastAccessed: timestampSchema.optional(),
    mutedInfo: z.object({
      muted: z.boolean()
    }),
    title: z.string(),
    url: urlSchema
  })
});

export type WinNode = z.infer<typeof WinNodeSchema>;
const WinNodeSchema = z.object({
  type: z.literal('win'),
  colapsed: z.literal(true).optional(),
  data: z.object({
    focused: z.literal(true).optional(),
    id: z.int(),
    rect: z.templateLiteral([z.int(), '_', z.int(), '_', z.int(), '_', z.int()])
  })
});

export type TabNode = z.infer<typeof TabNodeSchema>;
const TabNodeSchema = z.object({
  type: z.literal('tab'),
  colapsed: z.literal(true).optional(),
  data: z.object({
    audible: z.boolean(),
    autoDiscardable: z.boolean(),
    discarded: z.boolean(),
    favIconUrl: urlSchema,
    groupId: z.number(),
    highlighted: z.boolean().optional(),
    id: z.int(),
    lastAccessed: timestampSchema,
    mutedInfo: z.object({
      muted: z.boolean()
    }),
    title: z.string(),
    url: urlSchema,
    windowId: z.int()
  })
});

export type SavedwinNode = z.infer<typeof SavedwinNodeSchema>;
const SavedwinNodeSchema = z.object({
  type: z.literal('savedwin'),
  marks: marksSchema,
  colapsed: z.literal(true).optional(),
  data: z.object({
    state: z.literal(['minimized', 'maximized']).optional(),
    focused: z.literal(true).optional(),
    type: z.literal('normal'),
    rect: z.templateLiteral([z.int(), '_', z.int(), '_', z.int(), '_', z.int()]),
    crashDetectedDate: unixTimestampSchema.optional(),
    closeDate: unixTimestampSchema.optional()
  })
});

export type NodeInsert = z.infer<typeof nodeInsertSchema>;
const nodeInsertSchema = z.tuple([
  z.literal(NODE_INSERT),
  z.union([z.discriminatedUnion('type', [SavedwinNodeSchema, WinNodeSchema, TabNodeSchema]), DefaultNodeSchema]),
  z.array(z.int())
]);

export type EndOfFile = z.infer<typeof endOfFileSchema>;
const endOfFileSchema = z.object({
  type: z.literal(EOF),
  time: z.int()
});

export type BookmarksTree = z.infer<typeof bookmarksTreeSchema>;
export const bookmarksTreeSchema = z.array(z.union([NodeNewRootSchema, nodeInsertSchema, endOfFileSchema]));

export function isNodeNewRoot(node: unknown): node is NodeNewRoot {
  return typeof node === 'object' && node !== null && 'type' in node && (node as NodeNewRoot).type === NODE_NEWROOT;
}

export function isNodeInsert(node: unknown): node is NodeInsert {
  return Array.isArray(node) && node[0] === NODE_INSERT;
}
