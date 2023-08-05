import renderMathInElement from "katex/contrib/auto-render";

import monaco from "./live_editor/monaco";
import EditorClient from "./live_editor/editor_client";
import MonacoEditorAdapter from "./live_editor/monaco_editor_adapter";
import HookServerAdapter from "./live_editor/hook_server_adapter";
import RemoteUser from "./live_editor/remote_user";
import { replacedSuffixLength } from "../../lib/text_utils";
import { settingsStore } from "../../lib/settings";
import Doctest from "./live_editor/doctest";

/**
 * Mounts cell source editor with real-time collaboration mechanism.
 */
class LiveEditor {
  constructor(
    hook,
    container,
    cellId,
    tag,
    source,
    revision,
    language,
    intellisense,
    readOnly,
    codeMarkers,
    doctestReports
  ) {
    this.hook = hook;
    this.container = container;
    this.cellId = cellId;
    this.source = source;
    this.language = language;
    this.intellisense = intellisense;
    this.readOnly = readOnly;
    this._onMount = [];
    this._onChange = [];
    this._onBlur = [];
    this._onCursorSelectionChange = [];
    this._remoteUserByClientId = {};
    this._doctestByLine = {};

    this._initializeWidgets = () => {
      this.setCodeMarkers(codeMarkers);

      doctestReports.forEach((doctestReport) => {
        this.updateDoctest(doctestReport);
      });
    };

    const serverAdapter = new HookServerAdapter(hook, cellId, tag);
    this.editorClient = new EditorClient(serverAdapter, revision);

    this.editorClient.onDelta((delta) => {
      this.source = delta.applyToString(this.source);
      this._onChange.forEach((callback) => callback(this.source));
    });
  }

  /**
   * Checks if an editor instance has been mounted in the DOM.
   */
  isMounted() {
    return !!this.editor;
  }

  /**
   * Mounts and configures an editor instance in the DOM.
   */
  mount() {
    if (this.isMounted()) {
      throw new Error("The editor is already mounted");
    }

    this._mountEditor();

    if (this.intellisense) {
      this._setupIntellisense();
    }

    this.editorClient.setEditorAdapter(new MonacoEditorAdapter(this.editor));

    this.editor.onDidFocusEditorWidget(() => {
      this.editor.updateOptions({ matchBrackets: "always" });
    });

    this.editor.onDidBlurEditorWidget(() => {
      this.editor.updateOptions({ matchBrackets: "never" });
      this._onBlur.forEach((callback) => callback());
    });

    this.editor.onDidChangeCursorSelection((event) => {
      this._onCursorSelectionChange.forEach((callback) =>
        callback(event.selection)
      );
    });

    this._onMount.forEach((callback) => callback());
  }

  _ensureMounted() {
    if (!this.isMounted()) {
      this.mount();
    }
  }

  /**
   * Returns current editor content.
   */
  getSource() {
    return this.source;
  }

  /**
   * Registers a callback called with the editor is mounted in DOM.
   */
  onMount(callback) {
    this._onMount.push(callback);
  }

  /**
   * Registers a callback called with a new cell content whenever it changes.
   */
  onChange(callback) {
    this._onChange.push(callback);
  }

  /**
   * Registers a callback called with a new cursor selection whenever it changes.
   */
  onCursorSelectionChange(callback) {
    this._onCursorSelectionChange.push(callback);
  }

  /**
   * Registers a callback called whenever the editor loses focus.
   */
  onBlur(callback) {
    this._onBlur.push(callback);
  }

  focus() {
    this._ensureMounted();

    this.editor.focus();
  }

  blur() {
    this._ensureMounted();

    if (this.editor.hasTextFocus()) {
      document.activeElement.blur();
    }
  }

  insert(text) {
    this._ensureMounted();

    const range = this.editor.getSelection();
    this.editor
      .getModel()
      .pushEditOperations([], [{ forceMoveMarkers: true, range, text }]);
  }

  /**
   * Performs necessary cleanup actions.
   */
  dispose() {
    if (this.isMounted()) {
      // Explicitly destroy the editor instance and its text model.
      this.editor.dispose();

      const model = this.editor.getModel();

      if (model) {
        model.dispose();
      }
    }
  }

  /**
   * Either adds or moves remote user cursor to the new position.
   */
  updateUserSelection(client, selection) {
    this._ensureMounted();

    if (this._remoteUserByClientId[client.id]) {
      this._remoteUserByClientId[client.id].update(selection);
    } else {
      this._remoteUserByClientId[client.id] = new RemoteUser(
        this.editor,
        selection,
        client.hex_color,
        client.name
      );
    }
  }

  /**
   * Removes remote user cursor.
   */
  removeUserSelection(client) {
    this._ensureMounted();

    if (this._remoteUserByClientId[client.id]) {
      this._remoteUserByClientId[client.id].dispose();
      delete this._remoteUserByClientId[client.id];
    }
  }

  /**
   * Either adds or updates doctest indicators.
   */
  updateDoctest(doctestReport) {
    this._ensureMounted();

    if (this._doctestByLine[doctestReport.line]) {
      this._doctestByLine[doctestReport.line].update(doctestReport);
    } else {
      this._doctestByLine[doctestReport.line] = new Doctest(
        this.editor,
        doctestReport
      );
    }
  }

  /**
   * Removes doctest indicators.
   */
  clearDoctests() {
    this._ensureMounted();

    Object.values(this._doctestByLine).forEach((doctest) => doctest.dispose());

    this._doctestByLine = {};
  }

  /**
   * Sets underline markers for warnings and errors.
   *
   * Passing an empty list clears all markers.
   */
  setCodeMarkers(codeMarkers) {
    this._ensureMounted();

    const owner = "livebook.code-marker";

    const editorMarkers = codeMarkers.map((codeMarker) => {
      const line = this.editor.getModel().getLineContent(codeMarker.line);
      const [, leadingWhitespace, trailingWhitespace] =
        line.match(/^(\s*).*?(\s*)$/);

      return {
        startLineNumber: codeMarker.line,
        startColumn: leadingWhitespace.length + 1,
        endLineNumber: codeMarker.line,
        endColumn: line.length + 1 - trailingWhitespace.length,
        message: codeMarker.description,
        severity: {
          error: monaco.MarkerSeverity.Error,
          warning: monaco.MarkerSeverity.Warning,
        }[codeMarker.severity],
      };
    });

    monaco.editor.setModelMarkers(this.editor.getModel(), owner, editorMarkers);
  }

  _mountEditor() {
    const settings = settingsStore.get();

    this.editor = monaco.editor.create(this.container, {
      language: this.language,
      value: this.source,
      readOnly: this.readOnly,
      scrollbar: {
        vertical: "hidden",
        alwaysConsumeMouseWheel: false,
      },
      minimap: {
        enabled: false,
      },
      overviewRulerLanes: 0,
      scrollBeyondLastLine: false,
      guides: {
        indentation: false,
      },
      occurrencesHighlight: false,
      renderLineHighlight: "none",
      theme: settings.editor_theme,
      fontFamily: "JetBrains Mono, Droid Sans Mono, monospace",
      fontSize: settings.editor_font_size,
      tabIndex: -1,
      tabSize: 2,
      autoIndent: true,
      formatOnType: true,
      formatOnPaste: true,
      quickSuggestions: this.intellisense && settings.editor_auto_completion,
      tabCompletion: "on",
      suggestSelection: "first",
      // For Elixir word suggestions are confusing at times.
      // For example given `defmodule<CURSOR> Foo do`, if the
      // user opens completion list and then jumps to the end
      // of the line we would get "defmodule" as a word completion.
      wordBasedSuggestions: !this.intellisense,
      parameterHints: this.intellisense && settings.editor_auto_signature,
      wordWrap:
        this.language === "markdown" && settings.editor_markdown_word_wrap
          ? "on"
          : "off",
    });

    this._setScreenDependantEditorOptions();

    this.editor.addAction({
      contextMenuGroupId: "word-wrapping",
      id: "enable-word-wrapping",
      label: "Enable word wrapping",
      precondition: "config.editor.wordWrap == off",
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
      run: (editor) => editor.updateOptions({ wordWrap: "on" }),
    });

    this.editor.addAction({
      contextMenuGroupId: "word-wrapping",
      id: "disable-word-wrapping",
      label: "Disable word wrapping",
      precondition: "config.editor.wordWrap == on",
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
      run: (editor) => editor.updateOptions({ wordWrap: "off" }),
    });

    // Automatically adjust the editor size to fit the container.
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        // Ignore hidden container.
        if (this.container.offsetHeight > 0) {
          this._setScreenDependantEditorOptions();
          this.editor.layout();
        }
      });
    });

    resizeObserver.observe(this.container);

    // Whenever editor content size changes (new line is added/removed)
    // update the container height. Thanks to the above observer
    // the editor is resized to fill the container.
    // Related: https://github.com/microsoft/monaco-editor/issues/794#issuecomment-688959283
    this.editor.onDidContentSizeChange(() => {
      const contentHeight = this.editor.getContentHeight();
      this.container.style.height = `${contentHeight}px`;
    });

    /* Overrides */

    // Move the command palette widget to overflowing widgets container,
    // so that it's visible on small editors.
    // See: https://github.com/microsoft/monaco-editor/issues/70
    const commandPaletteNode = this.editor.getContribution(
      "editor.controller.quickInput"
    ).widget.domNode;
    commandPaletteNode.remove();
    this.editor._modelData.view._contentWidgets.overflowingContentWidgetsDomNode.domNode.appendChild(
      commandPaletteNode
    );

    // Add the widgets that the editor was initialized with
    this._initializeWidgets();
  }

  /**
   * Sets Monaco editor options that depend on the current screen's size.
   */
  _setScreenDependantEditorOptions() {
    if (window.screen.width < 768) {
      this.editor.updateOptions({
        folding: false,
        lineDecorationsWidth: 16,
        lineNumbersMinChars:
          Math.floor(Math.log10(this.editor.getModel().getLineCount())) + 3,
      });
    } else {
      this.editor.updateOptions({
        folding: true,
        lineDecorationsWidth: 10,
        lineNumbersMinChars: 5,
      });
    }
  }

  /**
   * Defines cell-specific providers for various editor features.
   */
  _setupIntellisense() {
    const settings = settingsStore.get();

    this.handlerByRef = {};

    /**
     * Intellisense requests such as completion or formatting are
     * handled asynchronously by the runtime.
     *
     * As an example, let's go through the steps for completion:
     *
     *   * the user opens the completion list, which triggers the global
     *     completion provider registered in `live_editor/monaco.js`
     *
     *   * the global provider delegates to the cell-specific `__getCompletionItems__`
     *     defined below. That's a little bit hacky, but this way we make
     *     completion cell-specific
     *
     *   * then `__getCompletionItems__` sends a completion request to the LV process
     *     and gets a unique reference, under which it keeps completion callback
     *
     *   * finally the hook receives the "intellisense_response" event with completion
     *     response, it looks up completion callback for the received reference and calls
     *     it with the response, which finally returns the completion items to the editor
     */

    this.editor.getModel().__getCompletionItems__ = (model, position) => {
      const line = model.getLineContent(position.lineNumber);
      const lineUntilCursor = line.slice(0, position.column - 1);

      return this._asyncIntellisenseRequest("completion", {
        hint: lineUntilCursor,
        editor_auto_completion: settings.editor_auto_completion,
      })
        .then((response) => {
          const suggestions = completionItemsToSuggestions(
            response.items,
            settings
          ).map((suggestion) => {
            const replaceLength = replacedSuffixLength(
              lineUntilCursor,
              suggestion.insertText
            );

            const range = new monaco.Range(
              position.lineNumber,
              position.column - replaceLength,
              position.lineNumber,
              position.column
            );

            return { ...suggestion, range };
          });

          return { suggestions };
        })
        .catch(() => null);
    };

    this.editor.getModel().__getHover__ = (model, position) => {
      // On the first hover, we setup a listener to postprocess hover
      // content with KaTeX. Prior to that, the hover element is not
      // in the DOM

      this.hoverContentProcessed = false;

      if (!this.hoverContentEl) {
        this.hoverContentEl = this.container.querySelector(
          ".monaco-hover-content"
        );

        if (this.hoverContentEl) {
          new MutationObserver((event) => {
            // We mutate the DOM, so we use a flag to ignore events
            // that we triggered ourselves
            if (!this.hoverContentProcessed) {
              renderMathInElement(this.hoverContentEl, {
                delimiters: [
                  { left: "$$", right: "$$", display: true },
                  { left: "$", right: "$", display: false },
                ],
                throwOnError: false,
              });
              this.hoverContentProcessed = true;
            }
          }).observe(this.hoverContentEl, { childList: true });
        } else {
          console.warn(
            "Could not find an element matching .monaco-hover-content"
          );
        }
      }

      const line = model.getLineContent(position.lineNumber);
      const column = position.column;

      return this._asyncIntellisenseRequest("details", { line, column })
        .then((response) => {
          const contents = response.contents.map((content) => ({
            value: content,
            isTrusted: true,
          }));

          const range = new monaco.Range(
            position.lineNumber,
            response.range.from,
            position.lineNumber,
            response.range.to
          );

          return { contents, range };
        })
        .catch(() => null);
    };

    const signatureCache = {
      codeUntilLastStop: null,
      response: null,
    };

    this.editor.getModel().__getSignatureHelp__ = (model, position) => {
      const lines = model.getLinesContent();
      const lineIdx = position.lineNumber - 1;
      const prevLines = lines.slice(0, lineIdx);
      const lineUntilCursor = lines[lineIdx].slice(0, position.column - 1);
      const codeUntilCursor = [...prevLines, lineUntilCursor].join("\n");

      const codeUntilLastStop = codeUntilCursor
        // Remove trailing characters that don't affect the signature
        .replace(/[^(),\s]*?$/, "")
        // Remove whitespace before delimiter
        .replace(/([(),])\s*$/, "$1");

      // Cache subsequent requests for the same prefix, so that we don't
      // make unnecessary requests
      if (codeUntilLastStop === signatureCache.codeUntilLastStop) {
        return {
          value: signatureResponseToSignatureHelp(signatureCache.response),
          dispose: () => {},
        };
      }

      return this._asyncIntellisenseRequest("signature", {
        hint: codeUntilCursor,
      })
        .then((response) => {
          signatureCache.response = response;
          signatureCache.codeUntilLastStop = codeUntilLastStop;

          return {
            value: signatureResponseToSignatureHelp(response),
            dispose: () => {},
          };
        })
        .catch(() => null);
    };

    this.editor.getModel().__getDocumentFormattingEdits__ = (model) => {
      const content = model.getValue();

      return this._asyncIntellisenseRequest("format", { code: content })
        .then((response) => {
          this.setCodeMarkers(response.code_markers);

          if (response.code) {
            /**
             * We use a single edit replacing the whole editor content,
             * but the editor itself optimises this into a list of edits
             * that produce minimal diff using the Myers string difference.
             *
             * References:
             *   * https://github.com/microsoft/vscode/blob/628b4d46357f2420f1dbfcea499f8ff59ee2c251/src/vs/editor/contrib/format/format.ts#L324
             *   * https://github.com/microsoft/vscode/blob/628b4d46357f2420f1dbfcea499f8ff59ee2c251/src/vs/editor/common/services/editorSimpleWorker.ts#L489
             *   * https://github.com/microsoft/vscode/blob/628b4d46357f2420f1dbfcea499f8ff59ee2c251/src/vs/base/common/diff/diff.ts#L227-L231
             *
             * Eventually the editor will received the optimised list of edits,
             * which we then convert to Delta and send to the server.
             * Consequently, the Delta carries only the minimal formatting diff.
             *
             * Also, if edits are applied to the editor, either by typing
             * or receiving remote changes, the formatting is cancelled.
             * In other words the formatting changes are actually applied
             * only if the editor stays intact.
             *
             * References:
             *   * https://github.com/microsoft/vscode/blob/628b4d46357f2420f1dbfcea499f8ff59ee2c251/src/vs/editor/contrib/format/format.ts#L313
             *   * https://github.com/microsoft/vscode/blob/628b4d46357f2420f1dbfcea499f8ff59ee2c251/src/vs/editor/browser/core/editorState.ts#L137
             *   * https://github.com/microsoft/vscode/blob/628b4d46357f2420f1dbfcea499f8ff59ee2c251/src/vs/editor/contrib/format/format.ts#L326
             */

            const replaceEdit = {
              range: model.getFullModelRange(),
              text: response.code,
            };

            return [replaceEdit];
          } else {
            return [];
          }
        })
        .catch(() => null);
    };

    this.hook.handleEvent("intellisense_response", ({ ref, response }) => {
      const handler = this.handlerByRef[ref];

      if (handler) {
        handler(response);
        delete this.handlerByRef[ref];
      }
    });
  }

  /**
   * Pushes an intellisense request.
   *
   * The returned promise is either resolved with a valid
   * response or rejected with null.
   */
  _asyncIntellisenseRequest(type, props) {
    return new Promise((resolve, reject) => {
      this.hook.pushEvent(
        "intellisense_request",
        { cell_id: this.cellId, type, ...props },
        ({ ref }) => {
          if (ref) {
            this.handlerByRef[ref] = (response) => {
              if (response) {
                resolve(response);
              } else {
                reject(null);
              }
            };
          } else {
            reject(null);
          }
        }
      );
    });
  }
}

function completionItemsToSuggestions(items, settings) {
  return items
    .map((item) => parseItem(item, settings))
    .map((suggestion, index) => ({
      ...suggestion,
      sortText: numberToSortableString(index, items.length),
    }));
}

// See `Livebook.Runtime` for completion item definition
function parseItem(item, settings) {
  return {
    label: item.label,
    kind: parseItemKind(item.kind),
    detail: item.detail,
    documentation: item.documentation && {
      value: item.documentation,
      isTrusted: true,
    },
    insertText: item.insert_text,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    command: settings.editor_auto_signature
      ? {
          title: "Trigger Parameter Hint",
          id: "editor.action.triggerParameterHints",
        }
      : null,
  };
}

function parseItemKind(kind) {
  switch (kind) {
    case "function":
      return monaco.languages.CompletionItemKind.Function;
    case "module":
      return monaco.languages.CompletionItemKind.Module;
    case "struct":
      return monaco.languages.CompletionItemKind.Struct;
    case "interface":
      return monaco.languages.CompletionItemKind.Interface;
    case "type":
      return monaco.languages.CompletionItemKind.Class;
    case "variable":
      return monaco.languages.CompletionItemKind.Variable;
    case "field":
      return monaco.languages.CompletionItemKind.Field;
    case "keyword":
      return monaco.languages.CompletionItemKind.Keyword;
    default:
      return null;
  }
}

function numberToSortableString(number, maxNumber) {
  return String(number).padStart(maxNumber, "0");
}

function signatureResponseToSignatureHelp(response) {
  return {
    activeSignature: 0,
    activeParameter: response.active_argument,
    signatures: response.signature_items.map((signature_item) => ({
      label: signature_item.signature,
      parameters: signature_item.arguments.map((argument) => ({
        label: argument,
      })),
      documentation: null,
    })),
  };
}

export default LiveEditor;
