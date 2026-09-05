import {
  createMethodProxy,
  installWebGLContextHook as installCanvasWebGLContextHook,
  type MethodCall,
  type WebGLContext as SharedWebGLContext,
  type WebGLContextTarget
} from '@app-game/webgl-debug';

/** A WebGL 1 or WebGL 2 rendering context. */
export type WebGLContext = SharedWebGLContext;

/** The kinds of WebGL objects shown by the inspector. */
export type WebGLResourceKind =
  | 'buffer'
  | 'framebuffer'
  | 'program'
  | 'renderbuffer'
  | 'sampler'
  | 'shader'
  | 'texture'
  | 'transform-feedback'
  | 'vertex-array'
  | 'query'
  | 'sync'
  | 'unknown';

/** One formatted state value, optionally linked to a WebGL resource. */
export interface WebGLStateRow {
  readonly key: string;
  readonly value: string;
  readonly resourceId?: string;
}

/** A related group of global WebGL state. */
export interface WebGLStateGroup {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly WebGLStateRow[];
}

/** The bindings for one texture unit. */
export interface WebGLTextureUnitSnapshot {
  readonly index: number;
  readonly active: boolean;
  readonly bindings: readonly WebGLStateRow[];
}

/** The current vertex-array state for one attribute index. */
export interface WebGLVertexAttributeSnapshot {
  readonly index: number;
  readonly enabled: boolean;
  readonly size: string;
  readonly type: string;
  readonly normalized: string;
  readonly stride: string;
  readonly offset: string;
  readonly divisor: string;
  readonly buffer: string;
  readonly bufferId?: string;
}

/** One WebGL2 indexed uniform or transform-feedback buffer binding. */
export interface WebGLIndexedBufferBindingSnapshot {
  readonly target: 'uniform' | 'transform-feedback';
  readonly index: number;
  readonly buffer: string;
  readonly bufferId?: string;
  readonly offset: string;
  readonly size: string;
}

/** A resource created through the instrumented context. */
export interface WebGLResourceSnapshot {
  readonly id: string;
  readonly kind: WebGLResourceKind;
  readonly deleted: boolean;
  readonly details: readonly WebGLStateRow[];
  /** Named outgoing references to other resources or diagram nodes. */
  readonly relations: readonly WebGLResourceRelationSnapshot[];
  readonly links: readonly string[];
}

/** A direct binding or an indirect draw-time relationship between diagram nodes. */
export interface WebGLResourceRelationSnapshot {
  readonly label: string;
  readonly targetId: string;
  readonly direct: boolean;
}

/** One application call captured by the inspector. */
export type WebGLCallSnapshot =
  | { readonly status: 'ok'; readonly name: string; readonly arguments: string; readonly sequence: number }
  | {
      readonly status: 'error';
      readonly name: string;
      readonly arguments: string;
      readonly message: string;
      readonly sequence: number;
    };

/** A complete, immutable view consumed by the Solid diagram. */
export interface WebGLStateSnapshot {
  readonly version: 1 | 2;
  readonly revision: number;
  readonly drawCalls: number;
  readonly groups: readonly WebGLStateGroup[];
  readonly textureUnits: readonly WebGLTextureUnitSnapshot[];
  readonly vertexAttributes: readonly WebGLVertexAttributeSnapshot[];
  readonly indexedBufferBindings: readonly WebGLIndexedBufferBindingSnapshot[];
  readonly resources: readonly WebGLResourceSnapshot[];
  readonly recentCalls: readonly WebGLCallSnapshot[];
}

/** Controls the amount of potentially large indexed state read by each snapshot. */
export interface WebGLInspectorOptions {
  /** Maximum texture units shown. Defaults to 8. */
  readonly maxTextureUnits?: number;
  /** Maximum vertex attributes shown. Defaults to 8. */
  readonly maxVertexAttributes?: number;
  /** Maximum calls retained in the activity log. Defaults to 40. */
  readonly maxRecentCalls?: number;
  /** Maximum bindings shown for each indexed buffer target. Defaults to 8. */
  readonly maxIndexedBindings?: number;
}

/** A proxied context and its state inspector. */
export interface InstrumentedWebGLContext<TContext extends WebGLContext> {
  /** Drop-in replacement for the original context. */
  readonly context: TContext;
  /** State reader and subscription source used by the diagram. */
  readonly inspector: WebGLInspector;
}

/** A temporary patch of `HTMLCanvasElement.getContext`. */
export interface WebGLContextHook {
  /** Every context first requested while the hook is installed. */
  readonly inspectors: ReadonlySet<WebGLInspector>;
  /** Restores the original `getContext` implementation. */
  restore(): void;
}

/** Options for patching context creation in the current page or a same-origin iframe. */
export interface WebGLContextHookOptions extends WebGLInspectorOptions {
  /** Window whose canvas prototype will be patched. Defaults to the current window. */
  readonly target?: WebGLContextTarget;
  /** Called once for every context first requested while the hook is installed. */
  readonly onContext?: (inspector: WebGLInspector) => void;
}

type SnapshotListener = (snapshot: WebGLStateSnapshot) => void;
type GLObject = object;
type ValueFormat = 'enum' | 'hex' | 'plain';

interface StateDefinition {
  readonly key: string;
  readonly format?: ValueFormat;
}

interface StateGroupDefinition {
  readonly id: string;
  readonly title: string;
  readonly states: readonly StateDefinition[];
}

interface ResourceRecord {
  readonly object: GLObject;
  readonly id: string;
  readonly kind: WebGLResourceKind;
  readonly details: Map<string, string>;
  readonly relations: Map<string, WebGLResourceRelationSnapshot>;
  deleted: boolean;
}

interface MutableCall {
  readonly name: string;
  readonly arguments: readonly unknown[];
  readonly result?: unknown;
  readonly error?: unknown;
}

const inspectorsByContext = new WeakMap<object, WebGLInspector>();
const rawContexts = new WeakMap<object, WebGLContext>();
const instrumentedContexts = new WeakMap<object, WebGLContext>();

/**
 * Observes a context without changing the WebGL API seen by its caller.
 *
 * All methods run with the native context as `this`, which keeps browser brand checks and existing
 * WebGL libraries working. Calls made before instrumentation can be read as global state, but their
 * resource metadata cannot be reconstructed.
 */
export function instrumentWebGLContext<TContext extends WebGLContext>(
  context: TContext,
  options: WebGLInspectorOptions = {}
): InstrumentedWebGLContext<TContext> {
  const existing = inspectorsByContext.get(context);
  if (existing) {
    return { context: (instrumentedContexts.get(context) ?? context) as TContext, inspector: existing };
  }

  const inspector = new WebGLInspector(context, options);
  const extensionCache = new WeakMap<object, object>();
  const proxy = createMethodProxy(context, {
    transformResult: (result, invocation) =>
      invocation.name === 'getExtension' ? wrapExtension(result, inspector, extensionCache) : result,
    onCall: (call) => recordInterceptedCall(inspector, call)
  });

  // TypeScript cannot express a Proxy that preserves overloaded DOM method signatures.
  const instrumented = proxy as TContext;
  inspectorsByContext.set(context, inspector);
  inspectorsByContext.set(instrumented, inspector);
  rawContexts.set(instrumented, context);
  instrumentedContexts.set(context, instrumented);
  instrumentedContexts.set(instrumented, instrumented);
  return { context: instrumented, inspector };
}

/** Returns the inspector associated with a native or instrumented context. */
export function getWebGLInspector(context: WebGLContext): WebGLInspector | undefined {
  return inspectorsByContext.get(context);
}

/** Returns the native context behind an instrumented context. */
export function getRawWebGLContext<TContext extends WebGLContext>(context: TContext): TContext {
  return (rawContexts.get(context) ?? context) as TContext;
}

/**
 * Makes future `canvas.getContext('webgl' | 'webgl2')` calls return instrumented contexts.
 * Install before the target application creates its contexts and call `restore` on teardown.
 */
export function installWebGLContextHook(options: WebGLContextHookOptions = {}): WebGLContextHook {
  const inspectors = new Set<WebGLInspector>();
  const inspectorOptions = {
    maxIndexedBindings: options.maxIndexedBindings,
    maxRecentCalls: options.maxRecentCalls,
    maxTextureUnits: options.maxTextureUnits,
    maxVertexAttributes: options.maxVertexAttributes
  } satisfies WebGLInspectorOptions;
  const hook = installCanvasWebGLContextHook({
    target: options.target,
    wrapContext: (context) => instrumentWebGLContext(context, inspectorOptions).context,
    onContext: (context) => {
      const inspector = getWebGLInspector(context);
      if (!inspector) throw new Error('The WebGL context hook did not create an inspector.');
      inspectors.add(inspector);
      options.onContext?.(inspector);
    }
  });

  return {
    inspectors,
    restore: () => hook.restore()
  };
}

/** Reads WebGL state and notifies subscribers after application mutations. */
export class WebGLInspector {
  readonly context: WebGLContext;

  private readonly listeners = new Set<SnapshotListener>();
  private readonly resourceByObject = new WeakMap<GLObject, ResourceRecord>();
  private readonly resources: ResourceRecord[] = [];
  private readonly resourceCounters = new Map<WebGLResourceKind, number>();
  private readonly enumNames = new Map<number, string>();
  private readonly locationNames = new WeakMap<object, string>();
  private readonly options: Required<WebGLInspectorOptions>;
  private readonly calls: WebGLCallSnapshot[] = [];
  private revision = 0;
  private sequence = 0;
  private drawCalls = 0;
  private notificationQueued = false;
  private disposed = false;

  constructor(context: WebGLContext, options: WebGLInspectorOptions = {}) {
    this.context = context;
    this.options = {
      maxTextureUnits: options.maxTextureUnits ?? 8,
      maxVertexAttributes: options.maxVertexAttributes ?? 8,
      maxRecentCalls: options.maxRecentCalls ?? 40,
      maxIndexedBindings: options.maxIndexedBindings ?? 8
    };
    this.scanEnumNames();
  }

  /** Reads the current native state immediately. */
  capture(): WebGLStateSnapshot {
    return {
      version: isWebGL2(this.context) ? 2 : 1,
      revision: this.revision,
      drawCalls: this.drawCalls,
      groups: STATE_GROUPS.map((definition) => this.captureGroup(definition)),
      textureUnits: this.captureTextureUnits(),
      vertexAttributes: this.captureVertexAttributes(),
      indexedBufferBindings: this.captureIndexedBufferBindings(),
      resources: this.resources.map((resource) => this.snapshotResource(resource)),
      recentCalls: [...this.calls]
    };
  }

  /** Subscribes to coalesced snapshots. The listener receives an initial snapshot synchronously. */
  subscribe(listener: SnapshotListener): () => void {
    if (this.disposed) throw new Error('Cannot subscribe to a disposed WebGLInspector.');
    this.listeners.add(listener);
    listener(this.capture());
    return () => this.listeners.delete(listener);
  }

  /** Stops notifications and releases all listeners. The WebGL context remains usable. */
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  /** @internal Records a proxied context or extension call. */
  record(call: MutableCall): void {
    this.sequence += 1;
    const formattedArguments = call.arguments.map((value) => this.formatCallArgument(value)).join(', ');
    if (call.error !== undefined) {
      this.calls.push({
        status: 'error',
        name: call.name,
        arguments: formattedArguments,
        message: call.error instanceof Error ? call.error.message : String(call.error),
        sequence: this.sequence
      });
    } else {
      this.calls.push({ status: 'ok', name: call.name, arguments: formattedArguments, sequence: this.sequence });
      this.recordResourceChanges(call);
    }
    this.calls.splice(0, Math.max(0, this.calls.length - this.options.maxRecentCalls));
    if (DRAW_METHOD_PATTERN.test(call.name)) this.drawCalls += 1;
    if (call.error !== undefined || isMutation(call.name)) this.queueNotification();
  }

  private queueNotification(): void {
    if (this.notificationQueued || this.disposed) return;
    this.notificationQueued = true;
    queueMicrotask(() => {
      this.notificationQueued = false;
      if (this.disposed) return;
      this.revision += 1;
      const snapshot = this.capture();
      for (const listener of this.listeners) listener(snapshot);
    });
  }

  private captureGroup(definition: StateGroupDefinition): WebGLStateGroup {
    return {
      id: definition.id,
      title: definition.title,
      rows: definition.states.flatMap((state) => {
        const value = this.readParameter(state.key);
        return value.found ? [this.formatRow(state.key, value.value, state.format)] : [];
      })
    };
  }

  private captureTextureUnits(): readonly WebGLTextureUnitSnapshot[] {
    const gl = this.context;
    const activeTexture = this.readNumberParameter('ACTIVE_TEXTURE');
    const texture0 = this.enumValue('TEXTURE0');
    const maximum = this.readNumberParameter('MAX_COMBINED_TEXTURE_IMAGE_UNITS');
    if (activeTexture === undefined || texture0 === undefined || maximum === undefined) return [];
    const count = Math.min(maximum, this.options.maxTextureUnits);
    const bindingNames = isWebGL2(gl)
      ? [
          'TEXTURE_BINDING_2D',
          'TEXTURE_BINDING_CUBE_MAP',
          'TEXTURE_BINDING_3D',
          'TEXTURE_BINDING_2D_ARRAY',
          'SAMPLER_BINDING'
        ]
      : ['TEXTURE_BINDING_2D', 'TEXTURE_BINDING_CUBE_MAP'];
    const units: WebGLTextureUnitSnapshot[] = [];
    try {
      for (let index = 0; index < count; index += 1) {
        gl.activeTexture(texture0 + index);
        units.push({
          index,
          active: activeTexture === texture0 + index,
          bindings: bindingNames.flatMap((name) => {
            const value = this.readParameter(name);
            return value.found
              ? [this.formatRow(name.replace('TEXTURE_BINDING_', '').replace('_BINDING', ''), value.value)]
              : [];
          })
        });
      }
    } finally {
      gl.activeTexture(activeTexture);
    }
    return units;
  }

  private captureVertexAttributes(): readonly WebGLVertexAttributeSnapshot[] {
    const gl = this.context;
    const maximum = this.readNumberParameter('MAX_VERTEX_ATTRIBS');
    if (maximum === undefined) return [];
    const attributes: WebGLVertexAttributeSnapshot[] = [];
    const count = Math.min(maximum, this.options.maxVertexAttributes);
    for (let index = 0; index < count; index += 1) {
      const enabled = this.readVertexAttribute(index, 'VERTEX_ATTRIB_ARRAY_ENABLED');
      const buffer = this.readVertexAttribute(index, 'VERTEX_ATTRIB_ARRAY_BUFFER_BINDING');
      const bufferRecord = isObject(buffer) ? this.ensureResource(buffer, 'buffer') : undefined;
      attributes.push({
        index,
        enabled: Boolean(enabled),
        size: this.formatValue(this.readVertexAttribute(index, 'VERTEX_ATTRIB_ARRAY_SIZE')),
        type: this.formatValue(this.readVertexAttribute(index, 'VERTEX_ATTRIB_ARRAY_TYPE'), 'enum'),
        normalized: this.formatValue(this.readVertexAttribute(index, 'VERTEX_ATTRIB_ARRAY_NORMALIZED')),
        stride: this.formatValue(this.readVertexAttribute(index, 'VERTEX_ATTRIB_ARRAY_STRIDE')),
        offset: this.readVertexAttributeOffset(index),
        divisor: isWebGL2(gl) ? this.formatValue(this.readVertexAttribute(index, 'VERTEX_ATTRIB_ARRAY_DIVISOR')) : '0',
        buffer: bufferRecord?.id ?? 'null',
        ...(bufferRecord ? { bufferId: bufferRecord.id } : {})
      });
    }
    return attributes;
  }

  private captureIndexedBufferBindings(): readonly WebGLIndexedBufferBindingSnapshot[] {
    if (!isWebGL2(this.context)) return [];
    const gl = this.context;
    const bindings: WebGLIndexedBufferBindingSnapshot[] = [];
    const targets = [
      {
        target: 'uniform',
        binding: gl.UNIFORM_BUFFER_BINDING,
        start: gl.UNIFORM_BUFFER_START,
        size: gl.UNIFORM_BUFFER_SIZE,
        maximum: this.readNumberParameter('MAX_UNIFORM_BUFFER_BINDINGS')
      },
      {
        target: 'transform-feedback',
        binding: gl.TRANSFORM_FEEDBACK_BUFFER_BINDING,
        start: gl.TRANSFORM_FEEDBACK_BUFFER_START,
        size: gl.TRANSFORM_FEEDBACK_BUFFER_SIZE,
        maximum: this.readNumberParameter('MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS')
      }
    ] as const;

    for (const target of targets) {
      const count = Math.min(target.maximum ?? 0, this.options.maxIndexedBindings);
      for (let index = 0; index < count; index += 1) {
        const buffer = this.safeCall(() => gl.getIndexedParameter(target.binding, index));
        const resource = isObject(buffer) ? this.ensureResource(buffer, 'buffer') : undefined;
        bindings.push({
          target: target.target,
          index,
          buffer: resource?.id ?? 'null',
          ...(resource ? { bufferId: resource.id } : {}),
          offset: this.formatValue(this.safeCall(() => gl.getIndexedParameter(target.start, index))),
          size: this.formatValue(this.safeCall(() => gl.getIndexedParameter(target.size, index)))
        });
      }
    }
    return bindings;
  }

  private readVertexAttribute(index: number, name: string): unknown {
    const value = this.enumValue(name);
    if (value === undefined) return undefined;
    try {
      return this.context.getVertexAttrib(index, value);
    } catch {
      return undefined;
    }
  }

  private readVertexAttributeOffset(index: number): string {
    const pointer = this.enumValue('VERTEX_ATTRIB_ARRAY_POINTER');
    if (pointer === undefined) return '0';
    try {
      return String(this.context.getVertexAttribOffset(index, pointer));
    } catch {
      return '0';
    }
  }

  private readParameter(name: string): { readonly found: true; readonly value: unknown } | { readonly found: false } {
    const pname = this.enumValue(name);
    if (pname === undefined) return { found: false };
    try {
      return { found: true, value: this.context.getParameter(pname) };
    } catch {
      return { found: false };
    }
  }

  private readNumberParameter(name: string): number | undefined {
    const result = this.readParameter(name);
    return result.found && typeof result.value === 'number' ? result.value : undefined;
  }

  private formatRow(key: string, value: unknown, format: ValueFormat = 'plain'): WebGLStateRow {
    const resource = this.findOrCreateResource(value);
    if (value === null && key.includes('FRAMEBUFFER_BINDING')) {
      return { key, value: 'null (canvas)', resourceId: 'canvas' };
    }
    if (value === null && key === 'VERTEX_ARRAY_BINDING') {
      return { key, value: 'null (default VAO)', resourceId: 'vertex-array-default' };
    }
    if (key === 'ACTIVE_TEXTURE' && typeof value === 'number') {
      const texture0 = this.enumValue('TEXTURE0');
      const index = texture0 === undefined ? undefined : value - texture0;
      return {
        key,
        value: this.formatValue(value, 'enum'),
        ...(index === undefined ? {} : { resourceId: `texture-unit-${index}` })
      };
    }
    return {
      key,
      value: resource?.id ?? this.formatValue(value, format),
      ...(resource ? { resourceId: resource.id } : {})
    };
  }

  private formatValue(value: unknown, format: ValueFormat = 'plain'): string {
    if (value === undefined) return 'n/a';
    if (value === null) return 'null';
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') {
      if (format === 'hex') return `0x${value.toString(16).toUpperCase()}`;
      if (format === 'enum') return this.enumNames.get(value) ?? String(value);
      return Number.isInteger(value) ? String(value) : formatFloat(value);
    }
    if (typeof value === 'string') return value;
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      const values = Array.from(value as ArrayLike<unknown>);
      return (
        values
          .slice(0, 16)
          .map((item) => this.formatValue(item))
          .join(', ') + (values.length > 16 ? ', …' : '')
      );
    }
    if (isObject(value)) {
      const resource = this.findOrCreateResource(value);
      return resource?.id ?? Object.prototype.toString.call(value).slice(8, -1);
    }
    return String(value);
  }

  private formatCallArgument(value: unknown): string {
    if (isObject(value) && !ArrayBuffer.isView(value)) {
      const existing = this.resourceByObject.get(value);
      if (existing) return existing.id;
    }
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value.length > 42 ? `${value.slice(0, 39)}…` : JSON.stringify(value);
    if (ArrayBuffer.isView(value)) return `${value.constructor.name}[${value.byteLength}b]`;
    return this.formatValue(value);
  }

  private findOrCreateResource(value: unknown): ResourceRecord | undefined {
    if (!isObject(value) || Array.isArray(value) || ArrayBuffer.isView(value)) return undefined;
    const existing = this.resourceByObject.get(value);
    if (existing) return existing;
    const kind = inferResourceKind(value);
    return kind === 'unknown' ? undefined : this.ensureResource(value, kind);
  }

  private recordResourceChanges(call: MutableCall): void {
    const creationKind = CREATION_METHODS[call.name];
    if (creationKind && isObject(call.result)) {
      const created = this.ensureResource(call.result, creationKind);
      if (call.name === 'createShader' && typeof call.arguments[0] === 'number') {
        created.details.set('type', this.enumNames.get(call.arguments[0]) ?? String(call.arguments[0]));
      }
    }
    const deletionKind = DELETION_METHODS[call.name];
    const firstArgument = call.arguments[0];
    if (deletionKind && isObject(firstArgument)) {
      const deleted = this.ensureResource(firstArgument, deletionKind);
      deleted.deleted = true;
      deleted.details.set('status', 'delete requested');
    }
    if (call.name === 'getUniformLocation' && isObject(call.result) && typeof call.arguments[1] === 'string') {
      this.locationNames.set(call.result, call.arguments[1]);
    }
    this.recordShaderChanges(call);
    this.recordProgramChanges(call);
    this.recordBufferChanges(call);
    this.recordTextureChanges(call);
    this.recordFramebufferChanges(call);
    this.recordRenderbufferChanges(call);
    this.recordVertexArrayChanges(call);
    this.recordSamplerChanges(call);
    this.recordIndexedBufferChanges(call);
    this.recordDrawRelationships(call);
  }

  private recordShaderChanges(call: MutableCall): void {
    const shader = call.arguments[0];
    if (!isObject(shader)) return;
    const record = this.resourceByObject.get(shader);
    if (record?.kind !== 'shader') return;
    if (call.name === 'shaderSource' && typeof call.arguments[1] === 'string') {
      const source = call.arguments[1];
      record.details.set('source', `${source.split('\n').length} lines, ${source.length} chars`);
    }
    if (call.name === 'compileShader') {
      const status = this.safeCall(() =>
        this.context.getShaderParameter(shader as WebGLShader, this.context.COMPILE_STATUS)
      );
      record.details.set('compiled', String(Boolean(status)));
      const log = this.safeCall(() => this.context.getShaderInfoLog(shader as WebGLShader));
      if (log) record.details.set('log', String(log));
    }
  }

  private recordProgramChanges(call: MutableCall): void {
    const currentProgram = UNIFORM_METHOD_PATTERN.test(call.name) ? this.readParameter('CURRENT_PROGRAM') : undefined;
    const program = currentProgram?.found ? currentProgram.value : call.arguments[0];
    if (!isObject(program)) return;
    const record = this.resourceByObject.get(program);
    if (record?.kind !== 'program') return;
    if ((call.name === 'attachShader' || call.name === 'detachShader') && isObject(call.arguments[1])) {
      const shader = this.ensureResource(call.arguments[1], 'shader');
      const relationKey = `shader:${shader.id}`;
      if (call.name === 'attachShader') {
        const shaderType = shader.details.get('type')?.replace('_SHADER', '').toLowerCase() ?? 'shader';
        this.setRelation(record, relationKey, `${shaderType} shader`, shader.id, true);
      } else {
        record.relations.delete(relationKey);
      }
      record.details.set(
        'shaders',
        [...record.relations.values()]
          .filter((relation) => relation.label.endsWith('shader'))
          .map((relation) => relation.targetId)
          .join(', ') || 'none'
      );
    }
    if (call.name === 'linkProgram') {
      const linked = this.safeCall(() =>
        this.context.getProgramParameter(program as WebGLProgram, this.context.LINK_STATUS)
      );
      record.details.set('linked', String(Boolean(linked)));
      const attributes = this.safeCall(() =>
        this.context.getProgramParameter(program as WebGLProgram, this.context.ACTIVE_ATTRIBUTES)
      );
      const uniforms = this.safeCall(() =>
        this.context.getProgramParameter(program as WebGLProgram, this.context.ACTIVE_UNIFORMS)
      );
      record.details.set('attributes', String(attributes ?? 0));
      record.details.set('uniforms', String(uniforms ?? 0));
      this.recordProgramInterface(record, program as WebGLProgram, Number(attributes ?? 0), Number(uniforms ?? 0));
      const log = this.safeCall(() => this.context.getProgramInfoLog(program as WebGLProgram));
      if (log) record.details.set('log', String(log));
    }
    if (UNIFORM_METHOD_PATTERN.test(call.name)) {
      const location = call.arguments[0];
      const name = isObject(location) ? this.locationNames.get(location) : undefined;
      record.details.set('last uniform', name ?? 'location');
      if (name) {
        record.details.set(
          `uniform ${name}`,
          call.arguments
            .slice(1)
            .map((value) => this.formatCallArgument(value))
            .join(', ')
        );
      }
    }
  }

  private recordProgramInterface(
    record: ResourceRecord,
    program: WebGLProgram,
    attributeCount: number,
    uniformCount: number
  ): void {
    for (let index = 0; index < Math.min(attributeCount, 24); index += 1) {
      const info = this.safeCall(() => this.context.getActiveAttrib(program, index));
      if (!info) continue;
      const location = this.safeCall(() => this.context.getAttribLocation(program, info.name));
      const type = this.enumNames.get(info.type) ?? String(info.type);
      record.details.set(
        `attribute ${location ?? index}`,
        `${info.name}: ${type}${info.size > 1 ? `[${info.size}]` : ''}`
      );
    }
    for (let index = 0; index < Math.min(uniformCount, 32); index += 1) {
      const info = this.safeCall(() => this.context.getActiveUniform(program, index));
      if (!info) continue;
      const type = this.enumNames.get(info.type) ?? String(info.type);
      record.details.set(`uniform ${index}`, `${info.name}: ${type}${info.size > 1 ? `[${info.size}]` : ''}`);
    }
  }

  private recordVertexArrayChanges(call: MutableCall): void {
    const relevant =
      call.name === 'vertexAttribPointer' ||
      call.name === 'vertexAttribIPointer' ||
      (call.name === 'bindBuffer' && this.enumNames.get(Number(call.arguments[0])) === 'ELEMENT_ARRAY_BUFFER');
    if (!relevant) return;
    const binding = this.readParameter('VERTEX_ARRAY_BINDING');
    if (!binding.found || !isObject(binding.value)) return;
    const vertexArray = this.ensureResource(binding.value, 'vertex-array');

    const relationKey = call.name === 'bindBuffer' ? 'element-array' : `attribute:${String(call.arguments[0])}`;
    const label = call.name === 'bindBuffer' ? 'element array' : `attribute ${String(call.arguments[0])}`;
    const arrayBufferBinding = this.readParameter('ARRAY_BUFFER_BINDING');
    const buffer =
      call.name === 'bindBuffer' ? call.arguments[1] : arrayBufferBinding.found ? arrayBufferBinding.value : undefined;
    if (isObject(buffer)) {
      const bufferResource = this.ensureResource(buffer, 'buffer');
      this.setRelation(vertexArray, relationKey, label, bufferResource.id, true);
      vertexArray.details.set(label, bufferResource.id);
    } else {
      vertexArray.relations.delete(relationKey);
      vertexArray.details.set(label, 'null');
    }
  }

  private recordSamplerChanges(call: MutableCall): void {
    if (call.name !== 'samplerParameteri' && call.name !== 'samplerParameterf') return;
    const sampler = call.arguments[0];
    const parameterName = call.arguments[1];
    if (!isObject(sampler) || typeof parameterName !== 'number') return;
    const record = this.ensureResource(sampler, 'sampler');
    const key = this.enumNames.get(parameterName) ?? String(parameterName);
    const value = call.arguments[2];
    record.details.set(key, this.formatValue(value, typeof value === 'number' ? 'enum' : 'plain'));
  }

  private recordIndexedBufferChanges(call: MutableCall): void {
    if (call.name !== 'bindBufferBase' && call.name !== 'bindBufferRange') return;
    const buffer = call.arguments[2];
    if (!isObject(buffer)) return;
    const resource = this.ensureResource(buffer, 'buffer');
    const target = typeof call.arguments[0] === 'number' ? this.enumNames.get(call.arguments[0]) : undefined;
    const index = call.arguments[1];
    resource.details.set('last indexed binding', `${target ?? 'buffer'} ${String(index)}`);
  }

  private recordDrawRelationships(call: MutableCall): void {
    if (!/^draw/.test(call.name)) return;
    const programBinding = this.readParameter('CURRENT_PROGRAM');
    if (!programBinding.found || !isObject(programBinding.value)) return;
    const program = this.ensureResource(programBinding.value, 'program');

    const vertexArrayBinding = this.readParameter('VERTEX_ARRAY_BINDING');
    if (vertexArrayBinding.found && isObject(vertexArrayBinding.value)) {
      const vertexArray = this.ensureResource(vertexArrayBinding.value, 'vertex-array');
      this.setRelation(program, 'draw:vertex-array', 'draw vertex input', vertexArray.id, false);
    } else {
      this.setRelation(program, 'draw:vertex-array', 'draw vertex input', 'vertex-array-default', false);
    }

    const framebufferBinding = this.readParameter('DRAW_FRAMEBUFFER_BINDING');
    const fallbackBinding = this.readParameter('FRAMEBUFFER_BINDING');
    const framebuffer = framebufferBinding.found
      ? framebufferBinding.value
      : fallbackBinding.found
        ? fallbackBinding.value
        : null;
    if (isObject(framebuffer)) {
      const resource = this.ensureResource(framebuffer, 'framebuffer');
      this.setRelation(program, 'draw:framebuffer', 'draw output', resource.id, false);
    } else {
      this.setRelation(program, 'draw:framebuffer', 'draw output', 'canvas', false);
    }
    this.recordProgramSamplerRelationships(program, programBinding.value as WebGLProgram);
  }

  private recordProgramSamplerRelationships(record: ResourceRecord, program: WebGLProgram): void {
    const uniformCount = this.safeCall(() => this.context.getProgramParameter(program, this.context.ACTIVE_UNIFORMS));
    if (typeof uniformCount !== 'number') return;
    const activeTexture = this.readNumberParameter('ACTIVE_TEXTURE');
    const texture0 = this.enumValue('TEXTURE0');
    if (activeTexture === undefined || texture0 === undefined) return;

    try {
      for (let index = 0; index < Math.min(uniformCount, 32); index += 1) {
        const info = this.safeCall(() => this.context.getActiveUniform(program, index));
        if (!info) continue;
        const typeName = this.enumNames.get(info.type) ?? '';
        if (!typeName.includes('SAMPLER')) continue;
        const location = this.safeCall(() => this.context.getUniformLocation(program, info.name));
        if (!location) continue;
        const value = this.safeCall(() => this.context.getUniform(program, location));
        const units = typeof value === 'number' ? [value] : isNumericArrayView(value) ? Array.from(value) : [];
        const bindingName = samplerBindingName(typeName);
        const bindingEnum = this.enumValue(bindingName);
        if (bindingEnum === undefined) continue;

        for (let element = 0; element < units.length; element += 1) {
          const unit = units[element];
          if (typeof unit !== 'number') continue;
          this.context.activeTexture(texture0 + unit);
          const texture = this.safeCall(() => this.context.getParameter(bindingEnum));
          const relationKey = `sampler:${info.name}:${element}`;
          if (isObject(texture)) {
            const textureResource = this.ensureResource(texture, 'texture');
            const name = info.size > 1 ? `${info.name}[${element}]` : info.name.replace(/\[0\]$/, '');
            this.setRelation(record, relationKey, `${name} · unit ${unit}`, textureResource.id, false);
          } else {
            record.relations.delete(relationKey);
          }
        }
      }
    } finally {
      this.context.activeTexture(activeTexture);
    }
  }

  private recordBufferChanges(call: MutableCall): void {
    if (call.name !== 'bufferData' && call.name !== 'bufferSubData') return;
    const target = call.arguments[0];
    if (typeof target !== 'number') return;
    const buffer = this.boundBuffer(target);
    if (!buffer) return;
    const record = this.ensureResource(buffer, 'buffer');
    const data = call.arguments[call.name === 'bufferData' ? 1 : 2];
    const byteLength = typeof data === 'number' ? data : isArrayBufferLike(data) ? data.byteLength : undefined;
    if (byteLength !== undefined)
      record.details.set(call.name === 'bufferData' ? 'size' : 'last update', `${byteLength} bytes`);
    if (call.name === 'bufferData' && typeof call.arguments[2] === 'number') {
      record.details.set('usage', this.enumNames.get(call.arguments[2]) ?? String(call.arguments[2]));
    }
  }

  private recordTextureChanges(call: MutableCall): void {
    if (!/^tex(?:Image|SubImage|Storage|Parameter)|^compressedTex|^generateMipmap$/.test(call.name)) return;
    const target = call.arguments[0];
    if (typeof target !== 'number') return;
    const texture = this.boundTexture(target);
    if (!texture) return;
    const record = this.ensureResource(texture, 'texture');
    record.details.set('target', this.enumNames.get(target) ?? String(target));
    if ((call.name === 'texParameteri' || call.name === 'texParameterf') && typeof call.arguments[1] === 'number') {
      const key = this.enumNames.get(call.arguments[1]) ?? String(call.arguments[1]);
      const parameter = call.arguments[2];
      record.details.set(
        key,
        typeof parameter === 'number'
          ? (this.enumNames.get(parameter) ?? String(parameter))
          : this.formatCallArgument(parameter)
      );
    }
    if (/Image|Storage/.test(call.name)) {
      const dimensions = textureDimensions(call);
      if (dimensions) record.details.set(dimensions.key, dimensions.value);
    }
    if (call.name === 'generateMipmap') record.details.set('mipmaps', 'generated');
  }

  private recordFramebufferChanges(call: MutableCall): void {
    if (!/^framebuffer(?:Texture|Renderbuffer)/.test(call.name)) return;
    const target = call.arguments[0];
    const attachment = call.arguments[1];
    if (typeof target !== 'number' || typeof attachment !== 'number') return;
    const framebuffer = this.boundFramebuffer(target);
    if (!framebuffer) return;
    const record = this.ensureResource(framebuffer, 'framebuffer');
    const attached = call.arguments[3];
    const key = this.enumNames.get(attachment) ?? String(attachment);
    if (isObject(attached)) {
      const linked = this.ensureResource(
        attached,
        call.name === 'framebufferRenderbuffer' ? 'renderbuffer' : 'texture'
      );
      record.details.set(key, linked.id);
      this.setRelation(record, `attachment:${key}`, key, linked.id, true);
    } else {
      record.details.set(key, 'null');
      record.relations.delete(`attachment:${key}`);
    }
  }

  private recordRenderbufferChanges(call: MutableCall): void {
    if (!/^renderbufferStorage/.test(call.name)) return;
    const result = this.readParameter('RENDERBUFFER_BINDING');
    if (!result.found || !isObject(result.value)) return;
    const record = this.ensureResource(result.value, 'renderbuffer');
    const multisampled = call.name === 'renderbufferStorageMultisample';
    const format = call.arguments[multisampled ? 2 : 1];
    const width = call.arguments[multisampled ? 3 : 2];
    const height = call.arguments[multisampled ? 4 : 3];
    if (typeof format === 'number') {
      record.details.set('format', this.enumNames.get(format) ?? String(format));
    }
    if (typeof width === 'number' && typeof height === 'number') {
      record.details.set('size', `${width} × ${height}`);
    }
    if (multisampled && typeof call.arguments[1] === 'number') record.details.set('samples', String(call.arguments[1]));
  }

  private boundBuffer(target: number): object | undefined {
    const bindingName = BUFFER_BINDINGS.get(this.enumNames.get(target) ?? '');
    if (!bindingName) return undefined;
    const result = this.readParameter(bindingName);
    return result.found && isObject(result.value) ? result.value : undefined;
  }

  private boundTexture(target: number): object | undefined {
    const targetName = this.enumNames.get(target) ?? '';
    const bindingName = targetName.includes('CUBE_MAP')
      ? 'TEXTURE_BINDING_CUBE_MAP'
      : targetName === 'TEXTURE_3D'
        ? 'TEXTURE_BINDING_3D'
        : targetName === 'TEXTURE_2D_ARRAY'
          ? 'TEXTURE_BINDING_2D_ARRAY'
          : 'TEXTURE_BINDING_2D';
    const result = this.readParameter(bindingName);
    return result.found && isObject(result.value) ? result.value : undefined;
  }

  private boundFramebuffer(target: number): object | undefined {
    const bindingName =
      this.enumNames.get(target) === 'READ_FRAMEBUFFER' ? 'READ_FRAMEBUFFER_BINDING' : 'DRAW_FRAMEBUFFER_BINDING';
    const preferred = this.readParameter(bindingName);
    const fallback = this.readParameter('FRAMEBUFFER_BINDING');
    const value = preferred.found ? preferred.value : fallback.found ? fallback.value : undefined;
    return isObject(value) ? value : undefined;
  }

  private ensureResource(object: GLObject, kind: WebGLResourceKind): ResourceRecord {
    const existing = this.resourceByObject.get(object);
    if (existing) return existing;
    const index = (this.resourceCounters.get(kind) ?? 0) + 1;
    this.resourceCounters.set(kind, index);
    const record: ResourceRecord = {
      object,
      id: `${RESOURCE_PREFIXES[kind]}${index}`,
      kind,
      deleted: false,
      details: new Map(),
      relations: new Map()
    };
    this.resourceByObject.set(object, record);
    this.resources.push(record);
    return record;
  }

  private snapshotResource(resource: ResourceRecord): WebGLResourceSnapshot {
    return {
      id: resource.id,
      kind: resource.kind,
      deleted: resource.deleted,
      details: [...resource.details].map(([key, value]) => ({ key, value })),
      relations: [...resource.relations.values()],
      links: [...new Set([...resource.relations.values()].map((relation) => relation.targetId))]
    };
  }

  private setRelation(resource: ResourceRecord, key: string, label: string, targetId: string, direct: boolean): void {
    resource.relations.set(key, { label, targetId, direct });
  }

  private enumValue(name: string): number | undefined {
    const value: unknown = Reflect.get(this.context, name);
    return typeof value === 'number' ? value : undefined;
  }

  private scanEnumNames(): void {
    let current: object | null = this.context;
    while (current) {
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== 'string' || !/^[A-Z][A-Z0-9_]+$/.test(key)) continue;
        const value = this.safeCall(() => Reflect.get(this.context, key));
        if (typeof value === 'number' && !this.enumNames.has(value)) this.enumNames.set(value, key);
      }
      current = Object.getPrototypeOf(current);
    }
  }

  private safeCall<T>(callback: () => T): T | undefined {
    try {
      return callback();
    } catch {
      return undefined;
    }
  }
}

function wrapExtension(result: unknown, inspector: WebGLInspector, cache: WeakMap<object, object>): unknown {
  if (!isObject(result)) return result;
  const existing = cache.get(result);
  if (existing) return existing;
  const proxy = createMethodProxy(result, {
    onCall: (call) => recordInterceptedCall(inspector, call, normalizeExtensionMethod(String(call.name)))
  });
  cache.set(result, proxy);
  return proxy;
}

function recordInterceptedCall(inspector: WebGLInspector, call: MethodCall, name = String(call.name)): void {
  if (call.status === 'returned') {
    inspector.record({ name, arguments: call.arguments, result: call.result });
    return;
  }
  inspector.record({ name, arguments: call.arguments, error: call.error });
}

function normalizeExtensionMethod(name: string): string {
  return name.replace(/OES$|ANGLE$|WEBGL$/, '');
}

function textureDimensions(call: MutableCall): { readonly key: string; readonly value: string } | undefined {
  const isStorage = call.name === 'texStorage2D' || call.name === 'texStorage3D';
  const isSubImage = call.name === 'texSubImage2D' || call.name === 'texSubImage3D';
  if (call.name === 'texImage2D' && call.arguments.length < 9) return undefined;
  if (call.name === 'texSubImage2D' && call.arguments.length < 9) return undefined;

  const widthIndex = isSubImage || call.name.startsWith('compressedTexSubImage') ? 4 : 3;
  const width = call.arguments[widthIndex];
  const height = call.arguments[widthIndex + 1];
  if (typeof width !== 'number' || typeof height !== 'number') return undefined;

  const is3D = call.name.endsWith('3D');
  const depth = is3D ? call.arguments[widthIndex + 2] : undefined;
  if (is3D && typeof depth !== 'number') return undefined;
  const level = call.arguments[1];
  const key = isStorage ? 'storage' : `level ${typeof level === 'number' ? level : 0}`;
  return { key, value: `${width} × ${height}${typeof depth === 'number' ? ` × ${depth}` : ''}` };
}

function samplerBindingName(typeName: string): string {
  if (typeName.includes('2D_ARRAY')) return 'TEXTURE_BINDING_2D_ARRAY';
  if (typeName.includes('CUBE')) return 'TEXTURE_BINDING_CUBE_MAP';
  if (typeName.includes('3D')) return 'TEXTURE_BINDING_3D';
  return 'TEXTURE_BINDING_2D';
}

function isWebGL2(context: WebGLContext): context is WebGL2RenderingContext {
  return typeof Reflect.get(context, 'texImage3D') === 'function';
}
function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isArrayBufferLike(value: unknown): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}
function isNumericArrayView(value: unknown): value is ArrayBufferView & ArrayLike<number> {
  return ArrayBuffer.isView(value) && 'length' in value;
}
function formatFloat(value: number): string {
  return Number(value.toFixed(5)).toString();
}

function inferResourceKind(value: object): WebGLResourceKind {
  const tag = Object.prototype.toString
    .call(value)
    .slice(8, -1)
    .replace(/^WebGL/, '')
    .toLowerCase();
  switch (tag) {
    case 'buffer':
      return 'buffer';
    case 'framebuffer':
      return 'framebuffer';
    case 'program':
      return 'program';
    case 'renderbuffer':
      return 'renderbuffer';
    case 'sampler':
      return 'sampler';
    case 'shader':
      return 'shader';
    case 'texture':
      return 'texture';
    case 'transformfeedback':
      return 'transform-feedback';
    case 'vertexarrayobject':
      return 'vertex-array';
    case 'query':
      return 'query';
    case 'sync':
      return 'sync';
    default:
      return 'unknown';
  }
}

function isMutation(name: string): boolean {
  return !/^(get|is|check)/.test(name);
}

const DRAW_METHOD_PATTERN = /^draw/;
const UNIFORM_METHOD_PATTERN = /^uniform(?:\d|Matrix)/;
const CREATION_METHODS: Readonly<Record<string, WebGLResourceKind>> = {
  createBuffer: 'buffer',
  createFramebuffer: 'framebuffer',
  createProgram: 'program',
  createQuery: 'query',
  createRenderbuffer: 'renderbuffer',
  createSampler: 'sampler',
  createShader: 'shader',
  createTexture: 'texture',
  createTransformFeedback: 'transform-feedback',
  createVertexArray: 'vertex-array'
};
const DELETION_METHODS: Readonly<Record<string, WebGLResourceKind>> = {
  deleteBuffer: 'buffer',
  deleteFramebuffer: 'framebuffer',
  deleteProgram: 'program',
  deleteQuery: 'query',
  deleteRenderbuffer: 'renderbuffer',
  deleteSampler: 'sampler',
  deleteShader: 'shader',
  deleteTexture: 'texture',
  deleteTransformFeedback: 'transform-feedback',
  deleteVertexArray: 'vertex-array'
};
const RESOURCE_PREFIXES: Readonly<Record<WebGLResourceKind, string>> = {
  buffer: 'buffer ',
  framebuffer: 'framebuffer ',
  program: 'program ',
  query: 'query ',
  renderbuffer: 'renderbuffer ',
  sampler: 'sampler ',
  shader: 'shader ',
  sync: 'sync ',
  texture: 'texture ',
  'transform-feedback': 'transform feedback ',
  'vertex-array': 'vertex array ',
  unknown: 'object '
};
const BUFFER_BINDINGS = new Map<string, string>([
  ['ARRAY_BUFFER', 'ARRAY_BUFFER_BINDING'],
  ['ELEMENT_ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER_BINDING'],
  ['COPY_READ_BUFFER', 'COPY_READ_BUFFER_BINDING'],
  ['COPY_WRITE_BUFFER', 'COPY_WRITE_BUFFER_BINDING'],
  ['PIXEL_PACK_BUFFER', 'PIXEL_PACK_BUFFER_BINDING'],
  ['PIXEL_UNPACK_BUFFER', 'PIXEL_UNPACK_BUFFER_BINDING'],
  ['TRANSFORM_FEEDBACK_BUFFER', 'TRANSFORM_FEEDBACK_BUFFER_BINDING'],
  ['UNIFORM_BUFFER', 'UNIFORM_BUFFER_BINDING']
]);

const STATE_GROUPS = [
  {
    id: 'common',
    title: 'common state',
    states: [
      { key: 'VIEWPORT' },
      { key: 'SCISSOR_BOX' },
      { key: 'ARRAY_BUFFER_BINDING' },
      { key: 'CURRENT_PROGRAM' },
      { key: 'VERTEX_ARRAY_BINDING' },
      { key: 'RENDERBUFFER_BINDING' },
      { key: 'DRAW_FRAMEBUFFER_BINDING' },
      { key: 'READ_FRAMEBUFFER_BINDING' },
      { key: 'FRAMEBUFFER_BINDING' },
      { key: 'ACTIVE_TEXTURE', format: 'enum' }
    ]
  },
  {
    id: 'clear',
    title: 'clear state',
    states: [
      { key: 'COLOR_CLEAR_VALUE' },
      { key: 'DEPTH_CLEAR_VALUE' },
      { key: 'STENCIL_CLEAR_VALUE', format: 'hex' },
      { key: 'COLOR_WRITEMASK' }
    ]
  },
  {
    id: 'depth',
    title: 'depth state',
    states: [
      { key: 'DEPTH_TEST' },
      { key: 'DEPTH_FUNC', format: 'enum' },
      { key: 'DEPTH_RANGE' },
      { key: 'DEPTH_WRITEMASK' }
    ]
  },
  {
    id: 'blend',
    title: 'blend state',
    states: [
      { key: 'BLEND' },
      { key: 'BLEND_COLOR' },
      { key: 'BLEND_EQUATION_RGB', format: 'enum' },
      { key: 'BLEND_EQUATION_ALPHA', format: 'enum' },
      { key: 'BLEND_SRC_RGB', format: 'enum' },
      { key: 'BLEND_DST_RGB', format: 'enum' },
      { key: 'BLEND_SRC_ALPHA', format: 'enum' },
      { key: 'BLEND_DST_ALPHA', format: 'enum' }
    ]
  },
  {
    id: 'stencil',
    title: 'stencil state',
    states: [
      { key: 'STENCIL_TEST' },
      { key: 'STENCIL_FUNC', format: 'enum' },
      { key: 'STENCIL_REF', format: 'hex' },
      { key: 'STENCIL_VALUE_MASK', format: 'hex' },
      { key: 'STENCIL_WRITEMASK', format: 'hex' },
      { key: 'STENCIL_FAIL', format: 'enum' },
      { key: 'STENCIL_PASS_DEPTH_FAIL', format: 'enum' },
      { key: 'STENCIL_PASS_DEPTH_PASS', format: 'enum' },
      { key: 'STENCIL_BACK_FUNC', format: 'enum' },
      { key: 'STENCIL_BACK_REF', format: 'hex' },
      { key: 'STENCIL_BACK_VALUE_MASK', format: 'hex' },
      { key: 'STENCIL_BACK_WRITEMASK', format: 'hex' }
    ]
  },
  {
    id: 'raster',
    title: 'raster state',
    states: [
      { key: 'CULL_FACE' },
      { key: 'CULL_FACE_MODE', format: 'enum' },
      { key: 'FRONT_FACE', format: 'enum' },
      { key: 'SCISSOR_TEST' },
      { key: 'DITHER' },
      { key: 'LINE_WIDTH' },
      { key: 'POLYGON_OFFSET_FILL' },
      { key: 'POLYGON_OFFSET_FACTOR' },
      { key: 'POLYGON_OFFSET_UNITS' },
      { key: 'RASTERIZER_DISCARD' }
    ]
  },
  {
    id: 'multisample',
    title: 'multisample state',
    states: [
      { key: 'SAMPLE_ALPHA_TO_COVERAGE' },
      { key: 'SAMPLE_COVERAGE' },
      { key: 'SAMPLE_COVERAGE_VALUE' },
      { key: 'SAMPLE_COVERAGE_INVERT' },
      { key: 'SAMPLES' },
      { key: 'SAMPLE_BUFFERS' }
    ]
  },
  {
    id: 'transform-feedback',
    title: 'transform feedback',
    states: [
      { key: 'TRANSFORM_FEEDBACK_BINDING' },
      { key: 'TRANSFORM_FEEDBACK_ACTIVE' },
      { key: 'TRANSFORM_FEEDBACK_PAUSED' },
      { key: 'RASTERIZER_DISCARD' }
    ]
  },
  {
    id: 'read-draw-buffers',
    title: 'read / draw buffers',
    states: [
      { key: 'READ_BUFFER', format: 'enum' },
      { key: 'DRAW_BUFFER0', format: 'enum' },
      { key: 'DRAW_BUFFER1', format: 'enum' },
      { key: 'DRAW_BUFFER2', format: 'enum' },
      { key: 'DRAW_BUFFER3', format: 'enum' }
    ]
  },
  {
    id: 'pixel-store',
    title: 'pixel storage',
    states: [
      { key: 'PACK_ALIGNMENT' },
      { key: 'UNPACK_ALIGNMENT' },
      { key: 'UNPACK_FLIP_Y_WEBGL' },
      { key: 'UNPACK_PREMULTIPLY_ALPHA_WEBGL' },
      { key: 'UNPACK_COLORSPACE_CONVERSION_WEBGL', format: 'enum' },
      { key: 'UNPACK_ROW_LENGTH' },
      { key: 'UNPACK_IMAGE_HEIGHT' },
      { key: 'UNPACK_SKIP_PIXELS' },
      { key: 'UNPACK_SKIP_ROWS' },
      { key: 'UNPACK_SKIP_IMAGES' }
    ]
  }
] as const satisfies readonly StateGroupDefinition[];
