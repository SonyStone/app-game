import { edit } from 'ace-builds';
import { BaseComponent, IStateEvent } from '../../mvx/baseComponent';
import { ISourceCodeChangeEvent } from '../resultView';

export interface ISourceCodeState extends ISourceCodeChangeEvent {
  nameVertex: string;
  nameFragment: string;
  fragment: boolean;
  translated: boolean;
  editable: boolean;
}

type Timeout = ReturnType<typeof setTimeout>;
const DEFOULT_TIMEOUT = -1 as any as Timeout;

// Declare Ace types here.
interface IAceEditorSession {
  setMode(mode: string): void;
  on(eventName: string, callback: (e: any) => void): void;
  setAnnotations(annotations: any[]): void;
}
interface IAceEditor {
  getValue(): string;
  setTheme(theme: string): void;
  getSession(): IAceEditorSession;
  setReadOnly(readonly: boolean): void;
  setShowPrintMargin(show: boolean): void;
}
type ace = {
  edit(sourceCodeComponent: Element): IAceEditor;
};

export class SourceCodeComponent extends BaseComponent<ISourceCodeState> {
  private static readonly semicolonReplacementKey = '[[[semicolonReplacementKey]]]';
  private static readonly semicolonReplacementKeyRegex = new RegExp('\\[\\[\\[semicolonReplacementKey\\]\\]\\]', 'g');
  private static readonly openCurlyReplacementKey = '[[[openCurlyReplacementKey]]]';
  private static readonly openCurlyReplacementKeyRegex = new RegExp('\\[\\[\\[openCurlyReplacementKey\\]\\]\\]', 'g');
  private static readonly closeCurlyReplacementKey = '[[[closeCurlyReplacementKey]]]';
  private static readonly closeCurlyReplacementKeyRegex = new RegExp('\\[\\[\\[closeCurlyReplacementKey\\]\\]\\]', 'g');

  onTranslatedVertexSourceClicked: IStateEvent<ISourceCodeState>;
  onTranslatedFragmentSourceClicked: IStateEvent<ISourceCodeState>;
  onVertexSourceClicked: IStateEvent<ISourceCodeState>;
  onFragmentSourceClicked: IStateEvent<ISourceCodeState>;
  onSourceCodeCloseClicked: IStateEvent<ISourceCodeState>;
  onSourceCodeChanged: IStateEvent<ISourceCodeState>;

  private editor?: IAceEditor;

  constructor() {
    super();
    this.onTranslatedVertexSourceClicked = this.createEvent('onTranslatedVertexSourceClicked');
    this.onTranslatedFragmentSourceClicked = this.createEvent('onTranslatedFragmentSourceClicked');
    this.onVertexSourceClicked = this.createEvent('onVertexSourceClicked');
    this.onFragmentSourceClicked = this.createEvent('onFragmentSourceClicked');
    this.onSourceCodeCloseClicked = this.createEvent('onSourceCodeCloseClicked');
    this.onSourceCodeChanged = this.createEvent('onSourceCodeChanged');
  }

  showError(errorMessage?: string) {
    if (!this.editor) {
      return;
    }

    errorMessage = errorMessage || '';

    const annotations = [];

    if (errorMessage) {
      const errorChecker = /^.*ERROR:\W([0-9]+):([0-9]+):(.*)$/gm;
      let errors = errorChecker.exec(errorMessage);
      while (errors != null) {
        annotations.push({
          row: +errors[2] - 1,
          column: errors[1],
          text: errors[3] || 'Error',
          type: 'error' // also warning and information
        });
        errors = errorChecker.exec(errorMessage);
      }
    }

    this.editor.getSession().setAnnotations(annotations);
  }

  public render(state: ISourceCodeState, stateId: number): Element {
    const source = state.fragment ? state.sourceFragment : state.sourceVertex;
    let formattedShader: string;
    // tslint:disable-next-line:prefer-conditional-expression
    if (state.translated) {
      formattedShader = state.fragment ? state.translatedSourceFragment : state.translatedSourceVertex;
    } else {
      formattedShader = source ? this._indentIfdef(this._beautify(source)) : '';
    }

    const htmlString = this.htmlTemplate`
        <div class="sourceCodeComponentContainer">
            <div class="sourceCodeMenuComponentContainer">
                <ul class="sourceCodeMenuComponent">
                    $${
                      state.translatedSourceVertex
                        ? this.htmlTemplate`<li><a class="${
                            !state.fragment && state.translated ? 'active' : ''
                          }" href="#" role="button" commandName="onTranslatedVertexSourceClicked">Translated Vertex</a></li>`
                        : ''
                    }
                    $${
                      state.translatedSourceFragment
                        ? this.htmlTemplate`<li><a class="${
                            state.fragment && state.translated ? 'active' : ''
                          }" href="#" role="button" commandName="onTranslatedFragmentSourceClicked">Translated Fragment</a></li>`
                        : ''
                    }
                    <li><a class="${
                      !state.fragment && !state.translated ? 'active' : ''
                    }" href="#" role="button" commandName="onVertexSourceClicked">Vertex</a></li>
                    <li><a class="${
                      state.fragment && !state.translated ? 'active' : ''
                    }" href="#" role="button" commandName="onFragmentSourceClicked">Fragment</a></li>
                    <li><a href="#" role="button" commandName="onSourceCodeCloseClicked">Close</a></li>
                </ul>
            </div>
            $${this.htmlTemplate`<div class="sourceCodeComponent">${formattedShader}</div>`}
        </div>`;

    const element = this.renderElementFromTemplate(htmlString.replace(/<br>/g, '\n'), state, stateId);

    this.editor = edit(element.querySelector('.sourceCodeComponent')!);
    this.editor.setTheme('ace/theme/monokai');
    this.editor.getSession().setMode('ace/mode/glsl');
    this.editor.setShowPrintMargin(false);
    let timeoutId = DEFOULT_TIMEOUT;
    this.editor.setReadOnly(!state.editable && !state.translated);
    this.editor.getSession().on('change', (e) => {
      if (timeoutId !== DEFOULT_TIMEOUT) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        this._triggerCompilation(this.editor!, state, element, stateId);
      }, 1500);
    });

    return element;
  }

  private _triggerCompilation(editor: IAceEditor, state: ISourceCodeState, element: Element, stateId: number) {
    if (state.fragment) {
      state.sourceFragment = editor.getValue();
    } else {
      state.sourceVertex = editor.getValue();
    }
    this.triggerEvent('onSourceCodeChanged', element, state, stateId);
  }

  /**
   * Beautify the given string : correct indentation according to brackets
   */
  private _beautify(glsl: string, level: number = 0): string {
    // return condition : no brackets at all
    glsl = glsl.trim();
    glsl = this._adaptComments(glsl);
    const brackets = this._getBracket(glsl);
    const firstBracket = brackets.firstIteration;
    const lastBracket = brackets.lastIteration;

    let spaces = '';
    for (let i = 0; i < level; i++) {
      spaces += '    '; // 4 spaces
    }

    let result: string;
    // If no brackets, return the indented string
    if (firstBracket === -1) {
      glsl = spaces + glsl; // indent first line
      glsl = glsl.replace(/;(?![^\(]*\))\s*(\/\/.*)?/g, (x) => x.trim() + '\n');
      glsl = glsl.replace(/\s*([*+-/=><\s]*=)\s*/g, (x) => ' ' + x.trim() + ' '); // space around =, *=, +=, -=, /=, ==, >=, <=
      glsl = glsl.replace(/\s*(,)\s*/g, (x) => x.trim() + ' '); // space after ,
      glsl = glsl.replace(/\n[ \t]+/g, '\n'); // trim Start
      glsl = glsl.replace(/\n/g, '\n' + spaces); // indentation
      glsl = glsl.replace(/\s+$/g, '');
      glsl = glsl.replace(/\n+$/g, '');
      result = glsl;
    } else {
      // if brackets, beautify the inside
      // let insideWithBrackets = glsl.substr(firstBracket, lastBracket-firstBracket+1);
      const left = glsl.substr(0, firstBracket);
      const right = glsl.substr(lastBracket + 1, glsl.length);
      const inside = glsl.substr(firstBracket + 1, lastBracket - firstBracket - 1).trim();
      const prettyInside = this._beautify(inside, level + 1);
      result =
        this._beautify(left, level) + ' {\n' + prettyInside + '\n' + spaces + '}\n' + this._beautify(right, level);
      result = result.replace(/\s*\n+\s*;/g, ';'); // Orphan ;
      result = result.replace(/#endif[\t \f\v]*{/g, '\n {'); // Curly after #Endig
    }

    result = result.replace(SourceCodeComponent.semicolonReplacementKeyRegex, ';');
    result = result.replace(SourceCodeComponent.openCurlyReplacementKeyRegex, '{');
    result = result.replace(SourceCodeComponent.closeCurlyReplacementKeyRegex, '}');

    return result;
  }

  private _adaptComments(str: string): string {
    let singleLineComment = false;
    let multiLineComment = false;

    for (let index = 0; index < str.length; index++) {
      const char = str[index];
      if (char === '/') {
        if (str[index - 1] === '*') {
          multiLineComment = false;
        } else if (str[index + 1] === '*') {
          if (!singleLineComment) {
            multiLineComment = true;
            index++;
          }
        } else if (str[index + 1] === '/') {
          if (!multiLineComment) {
            singleLineComment = true;
            index++;
          }
        }
      } else if (char === '\n') {
        singleLineComment = false;
      } else if (char === ';') {
        if (singleLineComment || multiLineComment) {
          str = str.substr(0, index) + SourceCodeComponent.semicolonReplacementKey + str.substr(index + 1);
        }
      } else if (char === '{') {
        if (singleLineComment || multiLineComment) {
          str = str.substr(0, index) + SourceCodeComponent.openCurlyReplacementKey + str.substr(index + 1);
        }
      } else if (char === '}') {
        if (singleLineComment || multiLineComment) {
          str = str.substr(0, index) + SourceCodeComponent.closeCurlyReplacementKey + str.substr(index + 1);
        }
      }
    }

    return str;
  }

  /**
   * Returns the position of the first "{" and the corresponding "}"
   * @param str the Shader source code as a string
   * @param searchFrom Search open brackets from this position
   */
  private _getBracket(str: string, searchFrom = -1): { firstIteration: number; lastIteration: number } {
    const fb = str.indexOf('{', searchFrom);
    const arr = str.substr(fb + 1).split('');
    let counter = 1;
    let currentPosInString = fb;
    let lastBracketIndex = 0;
    for (const char of arr) {
      currentPosInString++;

      if (char === '{') {
        counter++;
      }
      if (char === '}') {
        counter--;
      }
      if (counter === 0) {
        lastBracketIndex = currentPosInString;
        break;
      }
    }

    // More open than close.
    if (fb > -1 && lastBracketIndex === 0) {
      return this._getBracket(str, fb + 1);
    }

    return { firstIteration: fb, lastIteration: lastBracketIndex };
  }

  private _indentIfdef(str: string): string {
    let level = 0;

    const arr2 = str.split('\n');

    for (let index = 0; index < arr2.length; index++) {
      const line = arr2[index];
      if (line.indexOf('#endif') !== -1) {
        level--;
      }
      if (line.indexOf('#else') !== -1) {
        level--;
      }
      let spaces = '';
      for (let i = 0; i < level; i++) {
        spaces += '    '; // 4 spaces
      }
      arr2[index] = spaces + line;
      if (line.indexOf('#if') !== -1 || line.indexOf('#else') !== -1) {
        level++;
      }
    }
    return arr2.join('\n');
  }
}
