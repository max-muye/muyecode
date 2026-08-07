const vscode = require("vscode");

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
    insertText: "class ${1:Name}\n\tmethod init(${2:args})\n\t\t$0\n\tend\nend",
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
  }
];

function activate(context) {
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

  const compileCommand = vscode.commands.registerCommand("muyecode.compile", () => {
    runCompiler(false);
  });
  const runCommand = vscode.commands.registerCommand("muyecode.run", () => {
    runCompiledOutput();
  });
  const compileRunCommand = vscode.commands.registerCommand("muyecode.compileRun", () => {
    runCompiler(true);
  });

  context.subscriptions.push(provider, compileCommand, runCommand, compileRunCommand);
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
  const outputPath = getDefaultOutputPath(filePath);
  const terminal = getTerminal();
  terminal.show();
  terminal.sendText(`cd ${quoteShell(getWorkspaceFolder(filePath))} && node ${quoteShell(outputPath)}`);
}

function getTerminal() {
  const existing = vscode.window.terminals.find((terminal) => terminal.name === "Muyecode");
  return existing || vscode.window.createTerminal("Muyecode");
}

function getWorkspaceFolder(filePath) {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  return folder ? folder.uri.fsPath : require("path").dirname(filePath);
}

function getDefaultOutputPath(filePath) {
  const path = require("path");
  const name = path.basename(filePath, path.extname(filePath));
  return path.join(getWorkspaceFolder(filePath), "muyecodecmps", `${name}.js`);
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

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
