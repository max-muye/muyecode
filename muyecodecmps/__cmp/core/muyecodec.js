#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.inputPath) {
    console.error("Usage: muyecodecmp <file.muyecode> -o output_name [-o exec] [-o run]");
    process.exit(1);
  }

  const source = fs.readFileSync(options.inputPath, "utf8");
  const outputPath = resolveOutputPath(options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (options.makeExecutable) {
    compileNativeExecutable(source, outputPath, options.inputPath);
  } else {
    const output = outputPath.endsWith(".html")
      ? compileHtml(source)
      : outputPath.endsWith(".py")
        ? compileTkinter(source)
        : compile(source);

    fs.writeFileSync(outputPath, output);
  }
  console.log(`Compiled ${options.inputPath} -> ${outputPath}`);

  if (options.shouldRun) {
    if (outputPath.endsWith(".html")) {
      openFile(outputPath);
    } else if (outputPath.endsWith(".py") || options.makeExecutable) {
      childProcess.spawnSync(getExecutableRunPath(outputPath), { stdio: "inherit", shell: true });
    } else {
      require(path.resolve(outputPath));
    }
  }
}

function getExecutableRunPath(outputPath) {
  if (path.isAbsolute(outputPath)) {
    return outputPath;
  }

  return process.platform === "win32" ? outputPath : `./${outputPath}`;
}

function resolveOutputPath(options) {
  if (options.outputPath && options.outputPath !== "exec") {
    return options.outputPath;
  }

  const sourceName = path.basename(options.inputPath, path.extname(options.inputPath));
  const outputDir = "muyecodecmps";

  if (options.makeExecutable && !options.outputPath) {
    return getDefaultExecutablePath(outputDir, sourceName);
  }

  if (options.outputPath === "exec") {
    options.makeExecutable = true;
    return getDefaultExecutablePath(outputDir, sourceName);
  }

  return path.join(outputDir, `${sourceName}.js`);
}

function getDefaultExecutablePath(outputDir, sourceName) {
  const preferredPath = path.join(outputDir, sourceName);

  if (!fs.existsSync(preferredPath) || !fs.statSync(preferredPath).isDirectory()) {
    return preferredPath;
  }

  return path.join(outputDir, `${sourceName}_exec`);
}

function parseArgs(args) {
  const options = {
    inputPath: null,
    outputPath: null,
    shouldRun: false,
    makeExecutable: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--run") {
      options.shouldRun = true;
      continue;
    }

    if (arg === "-o" || arg === "--output") {
      const value = args[index + 1];
      index += 1;

      if (!value) {
        throw new Error(`${arg} needs a value`);
      }

      if (value === "run") {
        options.shouldRun = true;
        continue;
      }

      if (value === "exec") {
        options.makeExecutable = true;
        continue;
      }

      options.outputPath = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option ${arg}`);
    }

    if (options.inputPath) {
      throw new Error(`Unexpected extra file ${arg}`);
    }

    options.inputPath = arg;
  }

  return options;
}

function compile(source) {
  const lines = source.split(/\r?\n/);
  const compiler = new Compiler();

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    compiler.compileLine(stripComment(lines[lineNumber]).trim(), lineNumber + 1);
  }

  return compiler.finish();
}

function check(source) {
  compile(source);
  return [];
}

function compileHtml(source) {
  const lines = source.split(/\r?\n/);
  const compiler = new HtmlCompiler();

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    compiler.compileLine(stripComment(lines[lineNumber]).trim(), lineNumber + 1);
  }

  return compiler.finish();
}

function compileTkinter(source) {
  const lines = source.split(/\r?\n/);
  const compiler = new TkinterCompiler();

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    compiler.compileLine(stripComment(lines[lineNumber]).trim(), lineNumber + 1);
  }

  return compiler.finish();
}

function compileNativeExecutable(source, outputPath, inputPath) {
  const objectiveCPath = getCompilerModulePath(inputPath, outputPath, ".m");
  fs.mkdirSync(path.dirname(objectiveCPath), { recursive: true });
  fs.writeFileSync(objectiveCPath, compileCocoa(source));

  const result = childProcess.spawnSync("clang", [
    "-x",
    "objective-c",
    objectiveCPath,
    "-framework",
    "Cocoa",
    "-o",
    outputPath
  ], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Native executable compile failed");
  }

  fs.chmodSync(outputPath, 0o755);
}

function getCompilerModulePath(inputPath, outputPath, extension) {
  const sourceName = path.basename(inputPath, path.extname(inputPath));
  const outputName = path.basename(outputPath);
  return path.join("muyecodecmps", "__cmp", sourceName, `${outputName}${extension}`);
}

function compileCocoa(source) {
  const lines = source.split(/\r?\n/);
  const compiler = new CocoaCompiler();

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    compiler.compileLine(stripComment(lines[lineNumber]).trim(), lineNumber + 1);
  }

  return compiler.finish();
}

function openFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

  try {
    childProcess.execFileSync(command, [absolutePath], { stdio: "ignore" });
  } catch {
    console.log(`Open ${absolutePath} in your browser.`);
  }
}

class Compiler {
  constructor() {
    this.output = [
      "\"use strict\";",
      "",
      "const input = (message = \"\") => {",
      "  const fs = require(\"fs\");",
      "  if (message) process.stdout.write(String(message));",
      "  return fs.readFileSync(0, \"utf8\").trim();",
      "};",
      "const len = (value) => value.length;",
      "const str = (value) => String(value);",
      "const num = (value) => Number(value);",
      "const openfile = (filePath) => require(\"fs\").readFileSync(filePath, \"utf8\");",
      "const writefile = (filePath, content) => require(\"fs\").writeFileSync(filePath, String(content));",
      "const appendfile = (filePath, content) => require(\"fs\").appendFileSync(filePath, String(content));",
      "const escapeSvg = (value) => String(value).replace(/[&<>\\\"]/g, (char) => ({ \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", \"\\\"\": \"&quot;\" }[char]));",
      "let __muyecodeDrawing = null;",
      "const canvas = (width, height, background = \"white\") => { __muyecodeDrawing = { width, height, background, color: \"black\", fill: \"none\", widthPx: 2, items: [] }; };",
      "const pen = (color = \"black\", width = 2) => { __muyecodeDrawing.color = color; __muyecodeDrawing.widthPx = width; };",
      "const fill = (color = \"none\") => { __muyecodeDrawing.fill = color; };",
      "const line = (x1, y1, x2, y2) => { __muyecodeDrawing.items.push(`<line x1=\"${x1}\" y1=\"${y1}\" x2=\"${x2}\" y2=\"${y2}\" stroke=\"${escapeSvg(__muyecodeDrawing.color)}\" stroke-width=\"${__muyecodeDrawing.widthPx}\" stroke-linecap=\"round\" />`); };",
      "const rect = (x, y, width, height) => { __muyecodeDrawing.items.push(`<rect x=\"${x}\" y=\"${y}\" width=\"${width}\" height=\"${height}\" fill=\"${escapeSvg(__muyecodeDrawing.fill)}\" stroke=\"${escapeSvg(__muyecodeDrawing.color)}\" stroke-width=\"${__muyecodeDrawing.widthPx}\" />`); };",
      "const circle = (x, y, radius) => { __muyecodeDrawing.items.push(`<circle cx=\"${x}\" cy=\"${y}\" r=\"${radius}\" fill=\"${escapeSvg(__muyecodeDrawing.fill)}\" stroke=\"${escapeSvg(__muyecodeDrawing.color)}\" stroke-width=\"${__muyecodeDrawing.widthPx}\" />`); };",
      "const __muyecodeText = (x, y, message, size = 24) => { __muyecodeDrawing.items.push(`<text x=\"${x}\" y=\"${y}\" fill=\"${escapeSvg(__muyecodeDrawing.color)}\" font-size=\"${size}\" font-family=\"Arial, sans-serif\">${escapeSvg(message)}</text>`); };",
      ""
    ];
    this.indent = 0;
    this.blockStack = [];
  }

  compileLine(rawLine, lineNumber) {
    this.currentLineNumber = lineNumber;

    if (!rawLine) {
      return;
    }

    if (rawLine === "else") {
      this.compileElse(lineNumber);
      return;
    }

    if (rawLine === "end") {
      this.compileEnd(lineNumber);
      return;
    }

    if (rawLine.startsWith("value ") || rawLine.startsWith("let ")) {
      this.pushLines(compileValue(rawLine, lineNumber, "let"));
      return;
    }

    if (rawLine.startsWith("set ") || rawLine.startsWith("change ")) {
      this.pushLine(compileSet(rawLine, lineNumber));
      return;
    }

    if (rawLine.startsWith("print ") || rawLine.startsWith("say ")) {
      this.pushLine(compilePrint(rawLine));
      return;
    }

    if (isFileCommand(rawLine)) {
      this.pushLine(compileFileCommand(rawLine, lineNumber));
      return;
    }

    if (isDrawingCommand(rawLine)) {
      this.pushLine(compileDrawingCommand(rawLine, lineNumber));
      return;
    }

    if (rawLine.startsWith("if ")) {
      this.compileIf(rawLine);
      return;
    }

    if (rawLine.startsWith("while ")) {
      this.compileWhile(rawLine);
      return;
    }

    if (rawLine.startsWith("function ")) {
      this.compileFunction(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("class ")) {
      this.compileClass(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("method ")) {
      this.compileMethod(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("return")) {
      this.pushLine(compileReturn(rawLine));
      return;
    }

    if (/^(?:this|[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)+\s*=/.test(rawLine)) {
      this.pushLine(`${rawLine};`);
      return;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*\s*\(.*\)$/.test(rawLine)) {
      this.pushLine(`${rawLine};`);
      return;
    }

    throw new Error(`Line ${lineNumber}: unknown command "${rawLine}"`);
  }

  compileIf(line) {
    const condition = line.slice("if ".length).trim();
    this.pushLine(`if (${condition}) {`);
    this.blockStack.push({ type: "if", lineNumber: this.currentLineNumber });
    this.indent += 1;
  }

  compileElse(lineNumber) {
    if (this.blockStack[this.blockStack.length - 1]?.type !== "if") {
      throw new Error(`Line ${lineNumber}: else must belong to an if block`);
    }

    this.indent -= 1;
    this.pushLine("} else {");
    this.indent += 1;
  }

  compileWhile(line) {
    const condition = line.slice("while ".length).trim();
    this.pushLine(`while (${condition}) {`);
    this.blockStack.push({ type: "while", lineNumber: this.currentLineNumber });
    this.indent += 1;
  }

  compileFunction(line, lineNumber) {
    const body = line.slice("function ".length).trim();
    const match = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);

    if (!match) {
      throw new Error(`Line ${lineNumber}: expected function name(arg1, arg2)`);
    }

    this.pushLine(`function ${match[1]}(${match[2]}) {`);
    this.blockStack.push({ type: "function", lineNumber });
    this.indent += 1;
  }

  compileClass(line, lineNumber) {
    const name = line.slice("class ".length).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Line ${lineNumber}: expected class Name`);
    }

    this.pushLine(`class ${name} {`);
    this.blockStack.push({ type: "class", lineNumber });
    this.indent += 1;
  }

  compileMethod(line, lineNumber) {
    const body = line.slice("method ".length).trim();
    const match = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);

    if (!match) {
      throw new Error(`Line ${lineNumber}: expected method name(arg1, arg2)`);
    }

    const name = match[1] === "init" ? "constructor" : match[1];
    this.pushLine(`${name}(${match[2]}) {`);
    this.blockStack.push({ type: "method", lineNumber });
    this.indent += 1;
  }

  compileEnd(lineNumber) {
    if (this.blockStack.length === 0) {
      throw new Error(`Line ${lineNumber}: end has no open block`);
    }

    this.blockStack.pop();
    this.indent -= 1;
    this.pushLine("}");
  }

  finish() {
    if (this.blockStack.length > 0) {
      const block = this.blockStack[this.blockStack.length - 1];
      throw new Error(`Line ${block.lineNumber}: missing end for ${block.type} block`);
    }

    this.output.push("");
    return this.output.join("\n");
  }

  pushLines(lines) {
    for (const line of lines.split("\n")) {
      this.pushLine(line);
    }
  }

  pushLine(line) {
    this.output.push(`${"  ".repeat(this.indent)}${line}`);
  }
}

class HtmlCompiler {
  constructor() {
    this.width = 640;
    this.height = 420;
    this.background = "\"white\"";
    this.output = [
      "let __muyecodeColor = \"black\";",
      "let __muyecodeFill = \"transparent\";",
      "let __muyecodeWidth = 2;"
    ];
    this.indent = 0;
    this.blockStack = [];
  }

  compileLine(rawLine, lineNumber) {
    if (!rawLine) {
      return;
    }

    if (rawLine === "else") {
      this.compileElse(lineNumber);
      return;
    }

    if (rawLine === "end") {
      this.compileEnd(lineNumber);
      return;
    }

    if (rawLine.startsWith("canvas ")) {
      this.compileCanvas(rawLine);
      return;
    }

    if (rawLine.startsWith("value ") || rawLine.startsWith("let ")) {
      this.pushLines(compileValue(rawLine, lineNumber, "let"));
      return;
    }

    if (rawLine.startsWith("set ") || rawLine.startsWith("change ")) {
      this.pushLine(compileSet(rawLine, lineNumber));
      return;
    }

    if (rawLine.startsWith("print ") || rawLine.startsWith("say ")) {
      this.pushLine(compilePrint(rawLine));
      return;
    }

    if (rawLine.startsWith("wait ") || rawLine.startsWith("sleep ")) {
      this.pushLine(compileWait(rawLine));
      return;
    }

    if (rawLine.startsWith("game ")) {
      this.compileGame(rawLine);
      return;
    }

    if (rawLine.startsWith("if ")) {
      this.compileIf(rawLine);
      return;
    }

    if (rawLine.startsWith("while ")) {
      this.compileWhile(rawLine);
      return;
    }

    if (rawLine.startsWith("function ")) {
      this.compileFunction(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("return")) {
      this.pushLine(compileReturn(rawLine));
      return;
    }

    if (/^(?:this|[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)+\s*=/.test(rawLine)) {
      this.pushLine(`${rawLine};`);
      return;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+\s*\(.*\)$/.test(rawLine)) {
      this.pushLine(`${rawLine};`);
      return;
    }

    if (isDrawingCommand(rawLine)) {
      this.pushLine(compileCanvasDrawingCommand(rawLine, lineNumber));
      return;
    }

    throw new Error(`Line ${lineNumber}: unknown command "${rawLine}"`);
  }

  compileCanvas(line) {
    const args = splitCommandArgs(line.slice("canvas ".length).trim());
    this.width = args[0] || this.width;
    this.height = args[1] || this.height;
    this.background = args[2] || this.background;
  }

  compileIf(line) {
    this.pushLine(`if (${line.slice("if ".length).trim()}) {`);
    this.blockStack.push("if");
    this.indent += 1;
  }

  compileElse(lineNumber) {
    if (this.blockStack[this.blockStack.length - 1] !== "if") {
      throw new Error(`Line ${lineNumber}: else must belong to an if block`);
    }

    this.indent -= 1;
    this.pushLine("} else {");
    this.indent += 1;
  }

  compileWhile(line) {
    this.pushLine(`while (${line.slice("while ".length).trim()}) {`);
    this.blockStack.push("while");
    this.indent += 1;
  }

  compileFunction(line, lineNumber) {
    const body = line.slice("function ".length).trim();
    const match = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);

    if (!match) {
      throw new Error(`Line ${lineNumber}: expected function name(arg1, arg2)`);
    }

    this.pushLine(`function ${match[1]}(${match[2]}) {`);
    this.blockStack.push("function");
    this.indent += 1;
  }

  compileGame(line) {
    const ms = line.slice("game ".length).trim();
    this.pushLine(`while (true) {`);
    this.blockStack.push("game");
    this.indent += 1;
    this.pushLine(`await sleep(${ms});`);
  }

  compileEnd(lineNumber) {
    if (this.blockStack.length === 0) {
      throw new Error(`Line ${lineNumber}: end has no open block`);
    }

    this.blockStack.pop();
    this.indent -= 1;
    this.pushLine("}");
  }

  finish() {
    if (this.blockStack.length > 0) {
      throw new Error(`Missing end for ${this.blockStack[this.blockStack.length - 1]} block`);
    }

    return [
      "<!doctype html>",
      "<html>",
      "<head>",
      "  <meta charset=\"utf-8\">",
      "  <title>Muyecode Draw Window</title>",
      "  <style>",
      "    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #202124; font-family: Arial, sans-serif; }",
      "    canvas { background: white; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35); }",
      "  </style>",
      "</head>",
      "<body>",
      `  <canvas id="screen" width="${stripQuotes(this.width)}" height="${stripQuotes(this.height)}"></canvas>`,
      "  <script>",
      "    const canvasEl = document.getElementById(\"screen\");",
      "    const ctx = canvasEl.getContext(\"2d\");",
      "    const len = (value) => value.length;",
      "    const str = (value) => String(value);",
      "    const num = (value) => Number(value);",
      "    const print = (...values) => console.log(values.map(str).join(\" \"));",
      "    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
      "    const random = (max) => Math.floor(Math.random() * max);",
      "    const push = (list, value) => list.push(value);",
      "    const removefirst = (list) => list.shift();",
      "    const keys = {};",
      "    const key = (name) => !!keys[name];",
      "    window.addEventListener(\"keydown\", (event) => { keys[event.key] = true; });",
      "    window.addEventListener(\"keyup\", (event) => { keys[event.key] = false; });",
      `    ctx.fillStyle = ${this.background};`,
      "    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);",
      "    async function main() {",
      ...this.output.map((line) => `    ${line}`),
      "    }",
      "    main();",
      "  </script>",
      "</body>",
      "</html>",
      ""
    ].join("\n");
  }

  pushLines(lines) {
    for (const line of lines.split("\n")) {
      this.pushLine(line);
    }
  }

  pushLine(line) {
    this.output.push(`${"  ".repeat(this.indent)}${line}`);
  }
}

class TkinterCompiler {
  constructor() {
    this.width = "640";
    this.height = "420";
    this.background = "\"white\"";
    this.output = [];
    this.penColor = "\"black\"";
    this.fillColor = "\"\"";
    this.penWidth = "2";
  }

  compileLine(rawLine, lineNumber) {
    if (!rawLine) {
      return;
    }

    if (rawLine.startsWith("canvas ")) {
      const args = splitCommandArgs(rawLine.slice("canvas ".length).trim());
      this.width = args[0] || this.width;
      this.height = args[1] || this.height;
      this.background = args[2] || this.background;
      return;
    }

    if (rawLine.startsWith("pen ")) {
      const args = splitCommandArgs(rawLine.slice("pen ".length).trim());
      this.penColor = args[0] || this.penColor;
      this.penWidth = args[1] || this.penWidth;
      return;
    }

    if (rawLine.startsWith("fill ")) {
      const args = splitCommandArgs(rawLine.slice("fill ".length).trim());
      this.fillColor = args[0] || "\"\"";
      return;
    }

    if (rawLine.startsWith("line ")) {
      const args = splitCommandArgs(rawLine.slice("line ".length).trim());
      this.output.push(`screen.create_line(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}, fill=${toPython(this.penColor)}, width=${this.penWidth})`);
      return;
    }

    if (rawLine.startsWith("rect ")) {
      const args = splitCommandArgs(rawLine.slice("rect ".length).trim());
      this.output.push(`screen.create_rectangle(${args[0]}, ${args[1]}, ${Number(args[0]) + Number(args[2])}, ${Number(args[1]) + Number(args[3])}, outline=${toPython(this.penColor)}, fill=${toPython(this.fillColor)}, width=${this.penWidth})`);
      return;
    }

    if (rawLine.startsWith("circle ")) {
      const args = splitCommandArgs(rawLine.slice("circle ".length).trim());
      this.output.push(`screen.create_oval(${args[0]} - ${args[2]}, ${args[1]} - ${args[2]}, ${args[0]} + ${args[2]}, ${args[1]} + ${args[2]}, outline=${toPython(this.penColor)}, fill=${toPython(this.fillColor)}, width=${this.penWidth})`);
      return;
    }

    if (rawLine.startsWith("text ")) {
      const args = splitCommandArgs(rawLine.slice("text ".length).trim());
      this.output.push(`screen.create_text(${args[0]}, ${args[1]}, text=${toPython(args[2])}, fill=${toPython(this.penColor)}, font=("Arial", ${args[3] || "24"}))`);
      return;
    }

    if (rawLine.startsWith("print ")) {
      this.output.push(`print(${splitPrintArgs(rawLine.slice("print ".length).trim()).map(toPythonExpression).join(", ")})`);
      return;
    }

    throw new Error(`Line ${lineNumber}: tkinter exec output supports drawing commands, got "${rawLine}"`);
  }

  finish() {
    return [
      "#!/usr/bin/env python3",
      "import tkinter as tk",
      "",
      "root = tk.Tk()",
      "root.title('Muyecode')",
      `screen = tk.Canvas(root, width=${this.width}, height=${this.height}, bg=${toPython(this.background)})`,
      "screen.pack()",
      ...this.output,
      "root.mainloop()",
      ""
    ].join("\n");
  }
}

class CocoaCompiler {
  constructor() {
    this.width = "640";
    this.height = "420";
    this.background = "\"white\"";
    this.penColor = "\"black\"";
    this.fillColor = "\"clear\"";
    this.penWidth = "2";
    this.drawLines = [];
  }

  compileLine(rawLine, lineNumber) {
    if (!rawLine) {
      return;
    }

    if (rawLine.startsWith("canvas ")) {
      const args = splitCommandArgs(rawLine.slice("canvas ".length).trim());
      this.width = args[0] || this.width;
      this.height = args[1] || this.height;
      this.background = args[2] || this.background;
      return;
    }

    if (rawLine.startsWith("pen ")) {
      const args = splitCommandArgs(rawLine.slice("pen ".length).trim());
      this.penColor = args[0] || this.penColor;
      this.penWidth = args[1] || this.penWidth;
      return;
    }

    if (rawLine.startsWith("fill ")) {
      const args = splitCommandArgs(rawLine.slice("fill ".length).trim());
      this.fillColor = args[0] || "\"clear\"";
      return;
    }

    if (rawLine.startsWith("line ")) {
      const args = splitCommandArgs(rawLine.slice("line ".length).trim());
      this.drawLines.push(`drawLine(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}, ${objcString(this.penColor)}, ${this.penWidth});`);
      return;
    }

    if (rawLine.startsWith("rect ")) {
      const args = splitCommandArgs(rawLine.slice("rect ".length).trim());
      this.drawLines.push(`drawRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}, ${objcString(this.penColor)}, ${objcString(this.fillColor)}, ${this.penWidth});`);
      return;
    }

    if (rawLine.startsWith("circle ")) {
      const args = splitCommandArgs(rawLine.slice("circle ".length).trim());
      this.drawLines.push(`drawCircle(${args[0]}, ${args[1]}, ${args[2]}, ${objcString(this.penColor)}, ${objcString(this.fillColor)}, ${this.penWidth});`);
      return;
    }

    if (rawLine.startsWith("text ")) {
      const args = splitCommandArgs(rawLine.slice("text ".length).trim());
      this.drawLines.push(`drawText(${args[0]}, ${args[1]}, ${objcString(args[2])}, ${args[3] || "24"}, ${objcString(this.penColor)});`);
      return;
    }

    throw new Error(`Line ${lineNumber}: native exec output supports drawing commands, got "${rawLine}"`);
  }

  finish() {
    const width = stripQuotes(this.width);
    const height = stripQuotes(this.height);
    return [
      "#import <Cocoa/Cocoa.h>",
      "",
      "static NSColor *colorFromString(NSString *value) {",
      "  if (!value || [value isEqualToString:@\"\"] || [value isEqualToString:@\"clear\"] || [value isEqualToString:@\"none\"] || [value isEqualToString:@\"transparent\"]) return [NSColor clearColor];",
      "  if ([value hasPrefix:@\"#\"] && [value length] == 7) {",
      "    unsigned int rgb = 0;",
      "    [[NSScanner scannerWithString:[value substringFromIndex:1]] scanHexInt:&rgb];",
      "    return [NSColor colorWithCalibratedRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1.0];",
      "  }",
      "  if ([value isEqualToString:@\"white\"]) return [NSColor whiteColor];",
      "  if ([value isEqualToString:@\"black\"]) return [NSColor blackColor];",
      "  if ([value isEqualToString:@\"red\"]) return [NSColor redColor];",
      "  if ([value isEqualToString:@\"green\"]) return [NSColor greenColor];",
      "  if ([value isEqualToString:@\"blue\"]) return [NSColor blueColor];",
      "  if ([value isEqualToString:@\"yellow\"]) return [NSColor yellowColor];",
      "  return [NSColor blackColor];",
      "}",
      "",
      "static void drawLine(CGFloat x1, CGFloat y1, CGFloat x2, CGFloat y2, NSString *stroke, CGFloat width) {",
      "  [colorFromString(stroke) setStroke];",
      "  NSBezierPath *path = [NSBezierPath bezierPath];",
      "  [path setLineWidth:width];",
      "  [path moveToPoint:NSMakePoint(x1, y1)];",
      "  [path lineToPoint:NSMakePoint(x2, y2)];",
      "  [path stroke];",
      "}",
      "",
      "static void drawRect(CGFloat x, CGFloat y, CGFloat width, CGFloat height, NSString *stroke, NSString *fill, CGFloat lineWidth) {",
      "  NSRect rect = NSMakeRect(x, y, width, height);",
      "  [colorFromString(fill) setFill];",
      "  NSRectFill(rect);",
      "  [colorFromString(stroke) setStroke];",
      "  NSBezierPath *path = [NSBezierPath bezierPathWithRect:rect];",
      "  [path setLineWidth:lineWidth];",
      "  [path stroke];",
      "}",
      "",
      "static void drawCircle(CGFloat x, CGFloat y, CGFloat radius, NSString *stroke, NSString *fill, CGFloat lineWidth) {",
      "  NSRect rect = NSMakeRect(x - radius, y - radius, radius * 2, radius * 2);",
      "  [colorFromString(fill) setFill];",
      "  [[NSBezierPath bezierPathWithOvalInRect:rect] fill];",
      "  [colorFromString(stroke) setStroke];",
      "  NSBezierPath *path = [NSBezierPath bezierPathWithOvalInRect:rect];",
      "  [path setLineWidth:lineWidth];",
      "  [path stroke];",
      "}",
      "",
      "static void drawText(CGFloat x, CGFloat y, NSString *text, CGFloat size, NSString *color) {",
      "  NSDictionary *attrs = @{ NSFontAttributeName: [NSFont systemFontOfSize:size], NSForegroundColorAttributeName: colorFromString(color) };",
      "  [text drawAtPoint:NSMakePoint(x, y) withAttributes:attrs];",
      "}",
      "",
      "@interface MuyecodeView : NSView @end",
      "@implementation MuyecodeView",
      "- (BOOL)isFlipped { return YES; }",
      "- (void)drawRect:(NSRect)dirtyRect {",
      `  [colorFromString(${objcString(this.background)}) setFill];`,
      "  NSRectFill(self.bounds);",
      ...this.drawLines.map((line) => `  ${line}`),
      "}",
      "@end",
      "",
      "@interface MuyecodeAppDelegate : NSObject <NSApplicationDelegate> @end",
      "@implementation MuyecodeAppDelegate",
      "- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }",
      "@end",
      "",
      "int main(int argc, const char *argv[]) {",
      "  @autoreleasepool {",
      "    NSApplication *app = [NSApplication sharedApplication];",
      "    MuyecodeAppDelegate *delegate = [MuyecodeAppDelegate new];",
      "    [app setDelegate:delegate];",
      "    [app setActivationPolicy:NSApplicationActivationPolicyRegular];",
      `    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, ${width}, ${height}) styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable) backing:NSBackingStoreBuffered defer:NO];`,
      "    [window setTitle:@\"Muyecode\"];",
      "    [window setContentView:[[MuyecodeView alloc] initWithFrame:NSMakeRect(0, 0, window.contentView.bounds.size.width, window.contentView.bounds.size.height)]];",
      "    [window makeKeyAndOrderFront:nil];",
      "    [app activateIgnoringOtherApps:YES];",
      "    [app run];",
      "  }",
      "  return 0;",
      "}",
      ""
    ].join("\n");
  }
}


function compileValue(line, lineNumber, keyword) {
  const body = line.replace(/^(value|let)\s+/, "").trim();
  const declarations = splitTopLevel(body, ",").map((part) => part.trim()).filter(Boolean);

  if (declarations.length === 0) {
    throw new Error(`Line ${lineNumber}: expected a value declaration`);
  }

  return declarations.map((declaration) => {
    const match = declaration.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);

    if (!match) {
      throw new Error(`Line ${lineNumber}: invalid value declaration "${declaration}"`);
    }

    return `${keyword} ${match[1]} = ${match[2]};`;
  }).join("\n");
}

function compileSet(line, lineNumber) {
  const body = line.replace(/^(set|change)\s+/, "").trim();
  const match = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);

  if (!match) {
    throw new Error(`Line ${lineNumber}: expected set name = value`);
  }

  return `${match[1]} = ${match[2]};`;
}

function compilePrint(line) {
  const body = line.replace(/^(print|say)\s+/, "").trim();
  const args = splitPrintArgs(body);
  return `console.log([${args.join(", ")}].map(str).join(" "));`;
}

function compileReturn(line) {
  const body = line.slice("return".length).trim();
  return body ? `return ${body};` : "return;";
}

function compileWait(line) {
  const body = line.replace(/^(wait|sleep)\s+/, "").trim();
  return `await sleep(${body});`;
}

function isDrawingCommand(line) {
  return /^(canvas|pen|fill|line|rect|box|circle|text|clear)\b/.test(line);
}

function isFileCommand(line) {
  return /^(writefile|appendfile)\b/.test(line);
}

function compileFileCommand(line, lineNumber) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);

  if (!match) {
    throw new Error(`Line ${lineNumber}: invalid file command`);
  }

  const command = match[1];
  const args = splitCommandArgs(match[2].trim());

  if (args.length < 2) {
    throw new Error(`Line ${lineNumber}: ${command} needs a file and content`);
  }

  return `${command}(${args[0]}, [${args.slice(1).join(", ")}].map(str).join(" "));`;
}

function compileDrawingCommand(line, lineNumber) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);

  if (!match) {
    throw new Error(`Line ${lineNumber}: invalid drawing command`);
  }

  const command = match[1];
  const body = match[2].trim();
  const args = body ? splitCommandArgs(body).join(", ") : "";

  return `${command === "text" ? "__muyecodeText" : command}(${args});`;
}

function compileCanvasDrawingCommand(line, lineNumber) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);

  if (!match) {
    throw new Error(`Line ${lineNumber}: invalid drawing command`);
  }

  const command = match[1];
  const args = splitCommandArgs(match[2].trim());

  if (command === "pen") {
    return `__muyecodeColor = ${args[0] || "\"black\""}; __muyecodeWidth = ${args[1] || "2"};`;
  }

  if (command === "fill") {
    return `__muyecodeFill = ${args[0] || "\"transparent\""};`;
  }

  if (command === "line") {
    return `ctx.strokeStyle = __muyecodeColor; ctx.lineWidth = __muyecodeWidth; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(${args[0]}, ${args[1]}); ctx.lineTo(${args[2]}, ${args[3]}); ctx.stroke();`;
  }

  if (command === "rect") {
    return `ctx.fillStyle = __muyecodeFill; ctx.strokeStyle = __muyecodeColor; ctx.lineWidth = __muyecodeWidth; ctx.fillRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}); ctx.strokeRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]});`;
  }

  if (command === "box") {
    return `ctx.fillStyle = __muyecodeFill; ctx.fillRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[2]});`;
  }

  if (command === "circle") {
    return `ctx.fillStyle = __muyecodeFill; ctx.strokeStyle = __muyecodeColor; ctx.lineWidth = __muyecodeWidth; ctx.beginPath(); ctx.arc(${args[0]}, ${args[1]}, ${args[2]}, 0, Math.PI * 2); ctx.fill(); ctx.stroke();`;
  }

  if (command === "text") {
    return `ctx.fillStyle = __muyecodeColor; ctx.font = ${args[3] || "24"} + "px Arial"; ctx.fillText(${args[2]}, ${args[0]}, ${args[1]});`;
  }

  if (command === "clear") {
    return `ctx.fillStyle = ${args[0] || "\"white\""}; ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);`;
  }

  throw new Error(`Line ${lineNumber}: unknown drawing command "${command}"`);
}

function stripComment(line) {
  let quote = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

    if ((char === "\"" || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }

    if (char === "#" && !quote) {
      return line.slice(0, index);
    }
  }

  return line;
}

function splitTopLevel(text, separator) {
  const parts = [];
  let current = "";
  let quote = null;
  let depth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];

    if ((char === "\"" || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
    }

    if (!quote && (char === "(" || char === "[" || char === "{")) {
      depth += 1;
    }

    if (!quote && (char === ")" || char === "]" || char === "}")) {
      depth -= 1;
    }

    if (char === separator && !quote && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function splitPrintArgs(text) {
  if (text.includes(",")) {
    return splitTopLevel(text, ",").map((part) => part.trim()).filter(Boolean);
  }

  return text.split(/\s+/).filter(Boolean);
}

function splitCommandArgs(text) {
  const args = [];
  let current = "";
  let quote = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];

    if ((char === "\"" || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
    }

    if (/\s/.test(char) && !quote) {
      if (current) {
        args.push(current);
        current = "";
      }

      continue;
    }

    current += char;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

function stripQuotes(value) {
  return String(value).replace(/^["']|["']$/g, "");
}

function toPython(value) {
  if (!value || value === "\"\"" || value === "''" || value === "\"none\"" || value === "'none'" || value === "\"transparent\"") {
    return "\"\"";
  }

  return value;
}

function toPythonExpression(value) {
  return value === "true" ? "True" : value === "false" ? "False" : value === "null" ? "None" : value;
}

function objcString(value) {
  const text = stripQuotes(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  return `@"${text}"`;
}


if (require.main === module) {
  main();
}

module.exports = {
  compile,
  check,
  main
};
