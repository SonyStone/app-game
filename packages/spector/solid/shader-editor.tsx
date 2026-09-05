import type { JSX } from '@solidjs/web';
import { edit, type Ace } from 'ace-builds';
import { Show, createSignal, createTrackedEffect, onCleanup, onSettled, untrack } from 'solid-js';
import type { SpectorShaderProgram } from './capture-model';
import type { SpectorProgramSource } from './spector-session';

/** Selects the source initially shown by the editor. */
export type ShaderStage = 'vertex' | 'fragment';

/** Edits one captured program; the host owns compilation and the optional details pane. */
export function ShaderEditor(props: {
  readonly program: SpectorShaderProgram;
  readonly initialStage: ShaderStage;
  readonly details?: JSX.Element;
  readonly onCompile?: (source: SpectorProgramSource) => Promise<void>;
  readonly onClose: () => void;
}): JSX.Element {
  const initialProgram = untrack(() => props.program);
  const [stage, setStage] = createSignal<ShaderStage>(untrack(() => props.initialStage));
  const [translated, setTranslated] = createSignal(false);
  const [vertexSource, setVertexSource] = createSignal(formatShaderSource(initialProgram.vertex.source));
  const [fragmentSource, setFragmentSource] = createSignal(formatShaderSource(initialProgram.fragment.source));
  let editorElement!: HTMLDivElement;
  let editor: Ace.Editor | undefined;
  let updatingEditor = false;
  let compileTimer: ReturnType<typeof setTimeout> | undefined;

  createTrackedEffect(() => {
    syncEditor(source(), !props.program.editable && !translated());
  });

  onSettled(() => {
    editor = edit(editorElement);
    editor.setShowPrintMargin(false);
    editor.session.on('change', onEditorChange);
    untrack(() => syncEditor(source(), !props.program.editable && !translated()));
  });

  onCleanup(() => {
    if (compileTimer !== undefined) clearTimeout(compileTimer);
    editor?.destroy();
  });

  function source(): string {
    if (translated()) {
      return stage() === 'vertex' ? props.program.vertex.translatedSource : props.program.fragment.translatedSource;
    }
    return stage() === 'vertex' ? vertexSource() : fragmentSource();
  }

  function onEditorChange(): void {
    if (!editor || updatingEditor || translated()) return;
    if (stage() === 'vertex') setVertexSource(editor.getValue());
    else setFragmentSource(editor.getValue());
    scheduleCompile();
  }

  function syncEditor(nextSource: string, readonly: boolean): void {
    if (!editor) return;
    editor.setReadOnly(readonly);
    if (editor.getValue() === nextSource) return;
    updatingEditor = true;
    editor.setValue(nextSource, -1);
    updatingEditor = false;
  }

  function scheduleCompile(): void {
    if (!props.onCompile || !props.program.editable || translated()) return;
    if (compileTimer !== undefined) clearTimeout(compileTimer);
    compileTimer = setTimeout(() => void compile(), 700);
  }

  async function compile(): Promise<void> {
    if (!props.onCompile) return;
    try {
      await props.onCompile({
        programId: props.program.programId,
        vertex: vertexSource(),
        fragment: fragmentSource()
      });
      editor?.session.clearAnnotations();
    } catch (error: unknown) {
      showShaderErrors(editor, error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div class="absolute inset-0 bg-[#222]">
      <header class="absolute top-0 right-[40%] left-0 h-[42px] border-b-2 border-[#222] bg-[#2c2c2c]">
        <nav class="m-0 flex h-[42px] list-none flex-row flex-wrap justify-end p-0 font-['Montserrat',sans-serif] text-[13px] leading-10 font-light">
          <Show when={props.program.vertex.translatedSource}>
            <button
              class={shaderTabClass(stage() === 'vertex' && translated())}
              type="button"
              onClick={() => {
                setStage('vertex');
                setTranslated(true);
              }}
            >
              Translated Vertex
            </button>
          </Show>
          <Show when={props.program.fragment.translatedSource}>
            <button
              class={shaderTabClass(stage() === 'fragment' && translated())}
              type="button"
              onClick={() => {
                setStage('fragment');
                setTranslated(true);
              }}
            >
              Translated Fragment
            </button>
          </Show>
          <button
            class={shaderTabClass(stage() === 'vertex' && !translated())}
            type="button"
            onClick={() => {
              setStage('vertex');
              setTranslated(false);
            }}
          >
            Vertex
          </button>
          <button
            class={shaderTabClass(stage() === 'fragment' && !translated())}
            type="button"
            onClick={() => {
              setStage('fragment');
              setTranslated(false);
            }}
          >
            Fragment
          </button>
          <button class={shaderTabClass(false)} type="button" onClick={props.onClose}>
            Close
          </button>
        </nav>
      </header>
      <div
        ref={editorElement}
        class="absolute top-[42px] right-[40%] bottom-0 left-0 z-[9000] overflow-auto bg-[#222]"
        aria-label={`${stage()} shader source`}
      />
      <div class="absolute top-0 right-0 bottom-0 w-[40%]">{props.details}</div>
    </div>
  );
}

function showShaderErrors(editor: Ace.Editor | undefined, message: string): void {
  if (!editor) return;
  const annotations: Ace.Annotation[] = [];
  const errorPattern = /^.*ERROR:\W([0-9]+):([0-9]+):(.*)$/gm;
  let match = errorPattern.exec(message);
  while (match) {
    annotations.push({
      row: Number(match[2]) - 1,
      column: Number(match[1]),
      text: match[3] || 'Error',
      type: 'error'
    });
    match = errorPattern.exec(message);
  }
  if (annotations.length === 0) annotations.push({ row: 0, column: 0, text: message, type: 'error' });
  editor.session.setAnnotations(annotations);
}

const SHADER_SEMICOLON = '[[[semicolonReplacementKey]]]';
const SHADER_OPEN_CURLY = '[[[openCurlyReplacementKey]]]';
const SHADER_CLOSE_CURLY = '[[[closeCurlyReplacementKey]]]';

function formatShaderSource(source: string): string {
  return indentShaderDirectives(beautifyShader(source));
}

function beautifyShader(source: string, level = 0): string {
  const glsl = protectShaderComments(source.trim());
  const { first, last } = findShaderBracket(glsl);
  const indentation = '    '.repeat(level);
  let result: string;

  if (first === -1) {
    result = indentation + glsl;
    result = result.replace(/;(?![^\(]*\))\s*(\/\/.*)?/g, (value) => `${value.trim()}\n`);
    result = result.replace(/\s*([*+\-/=><\s]*=)\s*/g, (value) => ` ${value.trim()} `);
    result = result.replace(/\s*(,)\s*/g, (value) => `${value.trim()} `);
    result = result.replace(/\n[ \t]+/g, '\n');
    result = result.replace(/\n/g, `\n${indentation}`);
    result = result.replace(/\s+$/g, '').replace(/\n+$/g, '');
  } else {
    const left = glsl.slice(0, first);
    const right = glsl.slice(last + 1);
    const inside = glsl.slice(first + 1, last).trim();
    result = `${beautifyShader(left, level)} {\n${beautifyShader(inside, level + 1)}\n${indentation}}\n${beautifyShader(right, level)}`;
    result = result.replace(/\s*\n+\s*;/g, ';').replace(/#endif[\t \f\v]*{/g, '\n {');
  }

  return result
    .replaceAll(SHADER_SEMICOLON, ';')
    .replaceAll(SHADER_OPEN_CURLY, '{')
    .replaceAll(SHADER_CLOSE_CURLY, '}');
}

function protectShaderComments(source: string): string {
  let result = source;
  let singleLineComment = false;
  let multiLineComment = false;

  for (let index = 0; index < result.length; index++) {
    const character = result[index];
    if (character === '/') {
      if (result[index - 1] === '*') multiLineComment = false;
      else if (result[index + 1] === '*' && !singleLineComment) {
        multiLineComment = true;
        index++;
      } else if (result[index + 1] === '/' && !multiLineComment) {
        singleLineComment = true;
        index++;
      }
    } else if (character === '\n') singleLineComment = false;
    else if (singleLineComment || multiLineComment) {
      const replacement =
        character === ';'
          ? SHADER_SEMICOLON
          : character === '{'
            ? SHADER_OPEN_CURLY
            : character === '}'
              ? SHADER_CLOSE_CURLY
              : undefined;
      if (replacement) result = result.slice(0, index) + replacement + result.slice(index + 1);
    }
  }

  return result;
}

function findShaderBracket(source: string, searchFrom = -1): { readonly first: number; readonly last: number } {
  const first = source.indexOf('{', searchFrom);
  let depth = 1;
  let last = 0;

  for (let index = first + 1; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') depth--;
    if (depth === 0) {
      last = index;
      break;
    }
  }

  return first > -1 && last === 0 ? findShaderBracket(source, first + 1) : { first, last };
}

function indentShaderDirectives(source: string): string {
  let level = 0;
  return source
    .split('\n')
    .map((line) => {
      if (line.includes('#endif') || line.includes('#else')) level--;
      const indentedLine = `${'    '.repeat(level)}${line}`;
      if (line.includes('#if') || line.includes('#else')) level++;
      return indentedLine;
    })
    .join('\n');
}

function shaderTabClass(active: boolean): string {
  return `block h-10 shrink-0 border-b-2 px-2 font-['Montserrat',sans-serif] text-[13px] font-light outline-none ${
    active
      ? 'border-[#f0640d] bg-[#222] font-normal text-white hover:text-[#f0640d]'
      : 'border-transparent bg-[#2c2c2c] text-[#ccc] hover:bg-[#222] hover:text-[#c9c9c9]'
  }`;
}
