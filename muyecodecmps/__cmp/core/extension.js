const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const compiler = require("./muyecodec.js");

const builtinCompletions = [
  {
    label: "value",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "value ${1:name} = ${2:value}",
    detail: "Create a value"
  },
  {
    label: "let",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "let ${1:name} = ${2:value}",
    detail: "Create a value"
  },
  {
    label: "set",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "set ${1:name} = ${2:value}",
    detail: "Change a value"
  },
  {
    label: "change",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "change ${1:name} = ${2:value}",
    detail: "Change a value"
  },
  {
    label: "function",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "function ${1:name}(${2:args})\n\t$0\nend",
    detail: "Create a function"
  },
  {
    label: "class",
    kind: vscode.CompletionItemKind.Class,
    insertText: "class ${1:Name}\n\t$0\nend",
    detail: "Create a class"
  },
  {
    label: "method",
    kind: vscode.CompletionItemKind.Method,
    insertText: "method ${1:name}(${2:args})\n\t$0\nend",
    detail: "Create a class method"
  },
  {
    label: "new",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "new ${1:Name}(${2:args})",
    detail: "Create an object"
  },
  {
    label: "get canvas",
    kind: vscode.CompletionItemKind.Module,
    insertText: "get \"canvas\"",
    detail: "Use the canvas library"
  },
  {
    label: "get random",
    kind: vscode.CompletionItemKind.Module,
    insertText: "get \"random\"",
    detail: "Use the random library"
  },
  {
    label: "get time",
    kind: vscode.CompletionItemKind.Module,
    insertText: "get \"time\"",
    detail: "Use the time library"
  },
  {
    label: "get gui",
    kind: vscode.CompletionItemKind.Module,
    insertText: "get \"gui\"",
    detail: "Use the native GUI library"
  },
  {
    label: "cmp",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "cmp \"${1:name}\"",
    detail: "Set the compiler helper for a header"
  },
  {
    label: "declare",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "declare ${1:name}(${2:args})",
    detail: "Declare a header helper"
  },
  {
    label: "if",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "if ${1:condition}\n\t$0\nend",
    detail: "Create an if block"
  },
  {
    label: "if else",
    kind: vscode.CompletionItemKind.Snippet,
    insertText: "if ${1:condition}\n\t$2\nelse\n\t$0\nend",
    detail: "Create an if/else block"
  },
  {
    label: "while",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "while ${1:condition}\n\t$0\nend",
    detail: "Create a while loop"
  },
  {
    label: "while true",
    kind: vscode.CompletionItemKind.Snippet,
    insertText: "while true\n\t$0\nend",
    detail: "Create a repeating loop"
  },
  {
    label: "return",
    kind: vscode.CompletionItemKind.Keyword,
    insertText: "return ${1:value}",
    detail: "Return from a function"
  },
  {
    label: "print",
    kind: vscode.CompletionItemKind.Function,
    insertText: "print ",
    detail: "Print values"
  },
  {
    label: "say",
    kind: vscode.CompletionItemKind.Function,
    insertText: "say ",
    detail: "Print values"
  },
  {
    label: "true",
    kind: vscode.CompletionItemKind.Value
  },
  {
    label: "false",
    kind: vscode.CompletionItemKind.Value
  },
  {
    label: "null",
    kind: vscode.CompletionItemKind.Value
  },
  {
    label: "input",
    kind: vscode.CompletionItemKind.Function,
    insertText: "input(${1:message})",
    detail: "Read text from stdin"
  },
  {
    label: "len",
    kind: vscode.CompletionItemKind.Function,
    insertText: "len(${1:value})",
    detail: "Get length"
  },
  {
    label: "str",
    kind: vscode.CompletionItemKind.Function,
    insertText: "str(${1:value})",
    detail: "Convert to string"
  },
  {
    label: "num",
    kind: vscode.CompletionItemKind.Function,
    insertText: "num(${1:value})",
    detail: "Convert to number"
  },
  {
    label: "openfile",
    kind: vscode.CompletionItemKind.Function,
    insertText: "openfile(${1:\"file.txt\"})",
    detail: "Read a file"
  },
  {
    label: "writefile",
    kind: vscode.CompletionItemKind.Function,
    insertText: "writefile ${1:\"file.txt\"} ${2:\"text\"}",
    detail: "Write text to a file"
  },
  {
    label: "appendfile",
    kind: vscode.CompletionItemKind.Function,
    insertText: "appendfile ${1:\"file.txt\"} ${2:\"text\"}",
    detail: "Add text to a file"
  },
  {
    label: "canvas",
    kind: vscode.CompletionItemKind.Function,
    insertText: "canvas ${1:width} ${2:height} ${3:\"white\"}",
    detail: "Start an SVG drawing"
  },
  {
    label: "pen",
    kind: vscode.CompletionItemKind.Function,
    insertText: "pen ${1:\"black\"} ${2:2}",
    detail: "Set stroke color and width"
  },
  {
    label: "fill",
    kind: vscode.CompletionItemKind.Function,
    insertText: "fill ${1:\"none\"}",
    detail: "Set fill color"
  },
  {
    label: "line",
    kind: vscode.CompletionItemKind.Function,
    insertText: "line ${1:x1} ${2:y1} ${3:x2} ${4:y2}",
    detail: "Draw a line"
  },
  {
    label: "rect",
    kind: vscode.CompletionItemKind.Function,
    insertText: "rect ${1:x} ${2:y} ${3:width} ${4:height}",
    detail: "Draw a rectangle"
  },
  {
    label: "box",
    kind: vscode.CompletionItemKind.Function,
    insertText: "box ${1:x} ${2:y} ${3:size}",
    detail: "Draw a filled square"
  },
  {
    label: "circle",
    kind: vscode.CompletionItemKind.Function,
    insertText: "circle ${1:x} ${2:y} ${3:radius}",
    detail: "Draw a circle"
  },
  {
    label: "text",
    kind: vscode.CompletionItemKind.Function,
    insertText: "text ${1:x} ${2:y} ${3:\"message\"} ${4:24}",
    detail: "Draw text"
  },
  {
    label: "clear",
    kind: vscode.CompletionItemKind.Function,
    insertText: "clear ${1:\"white\"}",
    detail: "Clear the canvas"
  },
  {
    label: "wait",
    kind: vscode.CompletionItemKind.Function,
    insertText: "wait ${1:100}",
    detail: "Pause in canvas mode"
  },
  {
    label: "key",
    kind: vscode.CompletionItemKind.Function,
    insertText: "key(${1:\"ArrowUp\"})",
    detail: "Check if a key is held in canvas mode"
  },
  {
    label: "pressed",
    kind: vscode.CompletionItemKind.Function,
    insertText: "pressed(${1:\"ArrowUp\"})",
    detail: "Check if a key was pressed in canvas mode"
  },
  {
    label: "rand",
    kind: vscode.CompletionItemKind.Function,
    insertText: "rand()",
    detail: "Random compiler value"
  },
  {
    label: "rand_int",
    kind: vscode.CompletionItemKind.Function,
    insertText: "rand_int(${1:min}, ${2:max})",
    detail: "Random integer from min to max"
  },
  {
    label: "rand_double",
    kind: vscode.CompletionItemKind.Function,
    insertText: "rand_double(${1:min}, ${2:max})",
    detail: "Random decimal from min to max"
  },
  {
    label: "window",
    kind: vscode.CompletionItemKind.Function,
    insertText: "window ${1:400} ${2:260} ${3:\"My App\"}",
    detail: "Create a native GUI window"
  },
  {
    label: "label",
    kind: vscode.CompletionItemKind.Function,
    insertText: "label ${1:30} ${2:30} ${3:240} ${4:30} ${5:\"Hello\"} ${6:18}",
    detail: "Add GUI text"
  },
  {
    label: "button",
    kind: vscode.CompletionItemKind.Function,
    insertText: "button ${1:30} ${2:80} ${3:140} ${4:32} ${5:\"Click\"}",
    detail: "Add a GUI button"
  },
  {
    label: "textbox",
    kind: vscode.CompletionItemKind.Function,
    insertText: "textbox ${1:30} ${2:130} ${3:220} ${4:28} ${5:\"text\"}",
    detail: "Add a GUI text box"
  }
];

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("muyecode");
  const provider = vscode.languages.registerCompletionItemProvider("muyecode", {
    provideCompletionItems(document) {
      const completions = builtinCompletions.map((entry) => {
        const item = new vscode.CompletionItem(entry.label, entry.kind);
        item.detail = entry.detail;

        if (entry.insertText) {
          item.insertText = new vscode.SnippetString(entry.insertText);
        }

        return item;
      });

      for (const name of findDeclaredValues(document.getText())) {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
        item.detail = "Declared value";
        completions.push(item);
      }

      return completions;
    }
  });
  const definitionProvider = vscode.languages.registerDefinitionProvider("muyecode", {
    provideDefinition(document, position) {
      return findDefinition(document, position);
    }
  });

  const compileCommand = vscode.commands.registerCommand("muyecode.compile", () => {
    runCompiler(false);
  });
  const runCommand = vscode.commands.registerCommand("muyecode.run", () => {
    runCompiledOutput();
  });
  const compileRunCommand = vscode.commands.registerCommand("muyecode.compileRun", () => {
    runCompiler(true);
  });
  let insertingEnd = false;

  const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId === "muyecode") {
      if (!insertingEnd) {
        maybeInsertEnd(event).then((changed) => {
          insertingEnd = changed;
          if (changed) {
            setTimeout(() => {
              insertingEnd = false;
            }, 0);
          }
        });
      }
      updateDiagnostics(event.document, diagnostics);
    }
  });
  const openSubscription = vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.languageId === "muyecode") {
      updateDiagnostics(document, diagnostics);
    }
  });
  const closeSubscription = vscode.workspace.onDidCloseTextDocument((document) => {
    diagnostics.delete(document.uri);
  });

  if (vscode.window.activeTextEditor?.document.languageId === "muyecode") {
    updateDiagnostics(vscode.window.activeTextEditor.document, diagnostics);
  }

  context.subscriptions.push(provider, definitionProvider, diagnostics, compileCommand, runCommand, compileRunCommand, changeSubscription, openSubscription, closeSubscription);
}

async function maybeInsertEnd(event) {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document !== event.document || event.contentChanges.length !== 1) {
    return false;
  }

  const change = event.contentChanges[0];

  if (!change.text.includes("\n")) {
    return false;
  }

  const previousLineNumber = change.range.start.line;
  const previousLine = event.document.lineAt(previousLineNumber).text;

  if (!isBlockStarter(previousLine)) {
    return false;
  }

  const nextLineNumber = previousLineNumber + 1;

  if (nextLineNumber >= event.document.lineCount) {
    return false;
  }

  const baseIndent = previousLine.match(/^\s*/)[0];
  const indentUnit = getIndentUnit(editor);
  const nextLine = event.document.lineAt(nextLineNumber).text;
  const wantedIndent = `${baseIndent}${indentUnit}`;
  const followingLineNumber = nextLineNumber + 1;
  const followingLine = followingLineNumber < event.document.lineCount ? event.document.lineAt(followingLineNumber).text : "";
  const changed = await editor.edit((edit) => {
    if (nextLine.trim() === "" && followingLine.trim() === "end") {
      const range = new vscode.Range(nextLineNumber, 0, nextLineNumber, nextLine.length);
      edit.replace(range, wantedIndent);
    } else if (nextLine.trim() === "") {
      const range = new vscode.Range(nextLineNumber, 0, nextLineNumber, nextLine.length);
      edit.replace(range, `${wantedIndent}\n${baseIndent}end`);
    } else {
      const insertPosition = new vscode.Position(nextLineNumber, nextLine.length);
      edit.insert(insertPosition, `\n${baseIndent}end`);
    }
  });

  if (changed) {
    const cursor = new vscode.Position(nextLineNumber, wantedIndent.length);
    editor.selection = new vscode.Selection(cursor, cursor);
  }

  return changed;
}

function isBlockStarter(text) {
  return /^\s*(?:class\s+[A-Za-z_][A-Za-z0-9_]*|method\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)|function\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)|if\s+.+|while\s+.+)\s*$/.test(text);
}

function getIndentUnit(editor) {
  const options = editor.options;

  if (options.insertSpaces) {
    return " ".repeat(Number(options.tabSize) || 4);
  }

  return "\t";
}

function updateDiagnostics(document, diagnostics) {
  try {
    compiler.check(document.getText(), { baseDir: require("path").dirname(document.fileName) });
    diagnostics.set(document.uri, []);
  } catch (error) {
    diagnostics.set(document.uri, [createDiagnostic(document, error)]);
  }
}

function createDiagnostic(document, error) {
  const message = error && error.message ? error.message : String(error);
  const match = message.match(/^Line\s+(\d+):\s*(.*)$/);
  const line = match ? Math.max(Number(match[1]) - 1, 0) : 0;
  const lineText = document.lineAt(Math.min(line, document.lineCount - 1)).text;
  const range = new vscode.Range(line, 0, line, Math.max(lineText.length, 1));
  const diagnostic = new vscode.Diagnostic(range, match ? match[2] : message, vscode.DiagnosticSeverity.Error);
  diagnostic.source = "Muyecode";
  return diagnostic;
}

function runCompiler(shouldRun) {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.languageId !== "muyecode") {
    vscode.window.showWarningMessage("Open a Muyecode file first.");
    return;
  }

  editor.document.save();

  const filePath = editor.document.fileName;
  const terminal = getTerminal();
  const runPart = shouldRun ? " -o run" : "";
  terminal.show();
  terminal.sendText(`cd ${quoteShell(getWorkspaceFolder(filePath))} && ./muyecodecmp ${quoteShell(filePath)}${runPart}`);
}

function runCompiledOutput() {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.languageId !== "muyecode") {
    vscode.window.showWarningMessage("Open a Muyecode file first.");
    return;
  }

  const filePath = editor.document.fileName;
  const terminal = getTerminal();
  terminal.show();
  terminal.sendText(`cd ${quoteShell(getWorkspaceFolder(filePath))} && ./muyecodecmp ${quoteShell(filePath)} -o run`);
}

function getTerminal() {
  const existing = vscode.window.terminals.find((terminal) => terminal.name === "Muyecode");
  return existing || vscode.window.createTerminal("Muyecode");
}

function getWorkspaceFolder(filePath) {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  return folder ? folder.uri.fsPath : path.dirname(filePath);
}

function quoteShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function findDeclaredValues(source) {
  const names = new Set();
  const declarationPattern = /\bvalue\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;

  while ((match = declarationPattern.exec(source)) !== null) {
    names.add(match[1]);
  }

  return names;
}

function findDefinition(document, position) {
  const line = document.lineAt(position.line).text;
  const importMatch = line.match(/\bget\s+["']([A-Za-z_][A-Za-z0-9_]*)["']/);

  if (importMatch && isPositionInsideMatch(line, position.character, importMatch)) {
    return locationForFile(findHeaderPath(document, importMatch[1]), 0, 0);
  }

  const cmpMatch = line.match(/\bcmp\s+["']([A-Za-z_][A-Za-z0-9_]*)["']/);

  if (cmpMatch && isPositionInsideMatch(line, position.character, cmpMatch)) {
    return locationForCompiler(cmpMatch[1]);
  }

  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);

  if (!wordRange) {
    return null;
  }

  const word = document.getText(wordRange);
  const localDefinition = findNameInDocument(document, word);

  if (localDefinition) {
    return localDefinition;
  }

  for (const headerPath of findImportedHeaders(document)) {
    const headerDefinition = findNameInFile(headerPath, word);

    if (headerDefinition) {
      return headerDefinition;
    }
  }

  return locationForCompilerBuiltin(word);
}

function isPositionInsideMatch(line, character, match) {
  return character >= match.index && character <= match.index + match[0].length;
}

function findImportedHeaders(document) {
  const headers = [];
  const source = document.getText();
  const pattern = /^\s*get\s+["']([A-Za-z_][A-Za-z0-9_]*)["']/gm;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const headerPath = findHeaderPath(document, match[1]);

    if (headerPath) {
      headers.push(headerPath);
    }
  }

  return headers;
}

function findHeaderPath(document, name) {
  const fileName = `${name}.muyecode`;
  const baseDir = path.dirname(document.fileName);
  const workspaceDir = getWorkspaceFolder(document.fileName);
  const candidates = [
    path.join(baseDir, "lib", fileName),
    path.join(baseDir, "..", "lib", fileName),
    path.join(workspaceDir, "lib", fileName),
    path.join(__dirname, "..", "..", "..", "lib", fileName)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function findNameInDocument(document, name) {
  return findNameInText(document.getText(), name, document.uri);
}

function findNameInFile(filePath, name) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return findNameInText(fs.readFileSync(filePath, "utf8"), name, vscode.Uri.file(filePath));
}

function findNameInText(source, name, uri) {
  const escaped = escapeRegExp(name);
  const patterns = [
    new RegExp(`^\\s*(?:value|let)\\s+${escaped}\\b`, "m"),
    new RegExp(`^\\s*class\\s+${escaped}\\b`, "m"),
    new RegExp(`^\\s*function\\s+${escaped}\\s*\\(`, "m"),
    new RegExp(`^\\s*method\\s+${escaped}\\s*(?:\\(|=)`, "m"),
    new RegExp(`^\\s*declare\\s+${escaped}\\s*(?:\\(|$)`, "m")
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(source);

    if (match) {
      return locationForOffset(source, uri, match.index + match[0].indexOf(name));
    }
  }

  return null;
}

function locationForCompiler(name) {
  const targets = {
    canvas: "function usesCanvasLibrary",
    random: "const rand =",
    time: "const wait =",
    gui: "function usesGuiLibrary"
  };

  return locationForCompilerPattern(targets[name] || "function compileCmp");
}

function locationForCompilerBuiltin(name) {
  const targets = {
    rand: "const rand =",
    wait: "const wait =",
    canvas: "function compileCanvasDrawingCommand",
    pen: "function compileCanvasDrawingCommand",
    fill: "function compileCanvasDrawingCommand",
    line: "function compileCanvasDrawingCommand",
    rect: "function compileCanvasDrawingCommand",
    box: "function compileCanvasDrawingCommand",
    circle: "function compileCanvasDrawingCommand",
    text: "function compileCanvasDrawingCommand",
    clear: "function compileCanvasDrawingCommand",
    key: "const key =",
    pressed: "const pressed =",
    window: "rawLine.startsWith(\"window \")",
    label: "function compileCocoaLabel",
    button: "function compileCocoaButton",
    textbox: "function compileCocoaTextBox",
    inputbox: "function compileCocoaTextBox"
  };

  return targets[name] ? locationForCompilerPattern(targets[name]) : null;
}

function locationForCompilerPattern(pattern) {
  const compilerPath = path.join(__dirname, "muyecodec.js");
  const source = fs.readFileSync(compilerPath, "utf8");
  const index = source.indexOf(pattern);

  return locationForOffset(source, vscode.Uri.file(compilerPath), Math.max(index, 0));
}

function locationForFile(filePath, line, character) {
  if (!filePath) {
    return null;
  }

  return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(line, character));
}

function locationForOffset(source, uri, offset) {
  const before = source.slice(0, offset);
  const lines = before.split(/\r?\n/);
  return new vscode.Location(uri, new vscode.Position(lines.length - 1, lines[lines.length - 1].length));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
