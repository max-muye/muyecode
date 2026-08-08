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
  const compileOptions = { baseDir: path.dirname(path.resolve(options.inputPath)) };
  const outputPath = resolveOutputPath(options, source);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (options.makeExecutable) {
    compileNativeExecutable(source, outputPath, options.inputPath);
  } else {
    const output = outputPath.endsWith(".html")
      ? compileHtml(source, compileOptions)
      : outputPath.endsWith(".py")
        ? compileTkinter(source, compileOptions)
        : compile(source, compileOptions);

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

function resolveOutputPath(options, source = "") {
  if (options.outputPath && options.outputPath !== "exec") {
    return options.outputPath;
  }

  const sourceName = path.basename(options.inputPath, path.extname(options.inputPath));
  const outputDir = "muyecodecmps";
  const baseDir = path.dirname(path.resolve(options.inputPath));

  if (options.makeExecutable && !options.outputPath) {
    return getDefaultExecutablePath(outputDir, sourceName);
  }

  if (options.outputPath === "exec") {
    options.makeExecutable = true;
    return getDefaultExecutablePath(outputDir, sourceName);
  }

  if (needsNativeOutput(source) || sourceImportsCompiler(source, "gui", baseDir)) {
    options.makeExecutable = true;
    return getDefaultExecutablePath(outputDir, sourceName);
  }

  return path.join(outputDir, `${sourceName}${needsHtmlOutput(source) ? ".html" : ".js"}`);
}

function needsHtmlOutput(source) {
  return /(^|\n)\s*(?:canvas|wait)\b/.test(source) || /\b(?:key|pressed)\s*\(/.test(source);
}

function needsNativeOutput(source) {
  return /(^|\n)\s*window\b/.test(source);
}

function usesGuiRuntime(source) {
  return /\b(?:quit|guivalue)\s*\(/.test(source);
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

function compile(source, options = {}) {
  const lines = source.split(/\r?\n/);
  const compiler = new Compiler(options);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    compiler.compileLine(stripComment(lines[lineNumber]).trim(), lineNumber + 1);
  }

  return compiler.finish();
}

function check(source, options = {}) {
  if (needsNativeOutput(source)) {
    compileCocoa(source, options);
  } else if (needsHtmlOutput(source)) {
    compileHtml(source, options);
  } else {
    compile(source, options);
  }

  return [];
}

function compileHtml(source, options = {}) {
  const lines = source.split(/\r?\n/);
  const compiler = new HtmlCompiler(options);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    compiler.compileLine(stripComment(lines[lineNumber]).trim(), lineNumber + 1);
  }

  return compiler.finish();
}

function compileTkinter(source, options = {}) {
  const lines = source.split(/\r?\n/);
  const compiler = new TkinterCompiler(options);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    compiler.compileLine(stripComment(lines[lineNumber]).trim(), lineNumber + 1);
  }

  return compiler.finish();
}

function compileNativeExecutable(source, outputPath, inputPath) {
  const objectiveCPath = getCompilerModulePath(inputPath, outputPath, ".m");
  const compileOptions = { baseDir: path.dirname(path.resolve(inputPath)) };
  const isGuiCanvasApp = sourceImportsCompiler(source, "gui", compileOptions.baseDir) && (needsHtmlOutput(source) || usesGuiRuntime(source));
  const objectiveCSource = isGuiCanvasApp ? compileWebViewApp(source, compileOptions) : compileCocoa(source, compileOptions);
  const frameworks = isGuiCanvasApp ? ["Cocoa", "WebKit"] : ["Cocoa"];
  fs.mkdirSync(path.dirname(objectiveCPath), { recursive: true });
  fs.writeFileSync(objectiveCPath, objectiveCSource);

  const clangArgs = [
    "-x",
    "objective-c",
    objectiveCPath
  ];

  for (const framework of frameworks) {
    clangArgs.push("-framework", framework);
  }

  clangArgs.push("-o", outputPath);

  const result = childProcess.spawnSync("clang", clangArgs, {
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

function compileCocoa(source, options = {}) {
  const lines = source.split(/\r?\n/);
  const compiler = new CocoaCompiler(options);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    compiler.compileLine(stripComment(lines[lineNumber]).trim(), lineNumber + 1);
  }

  return compiler.finish();
}

function compileWebViewApp(source, options = {}) {
  const html = compileHtml(source, options);
  const size = getCanvasSize(source, options);

  return [
    "#import <Cocoa/Cocoa.h>",
    "#import <WebKit/WebKit.h>",
    "",
    "@interface MuyecodeAppDelegate : NSObject <NSApplicationDelegate, WKScriptMessageHandler> @end",
    "@implementation MuyecodeAppDelegate",
    "- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }",
    "- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {",
    "  if ([message.name isEqualToString:@\"muyecodeQuit\"]) [NSApp terminate:nil];",
    "}",
    "@end",
    "",
    "int main(int argc, const char *argv[]) {",
    "  @autoreleasepool {",
    "    NSApplication *app = [NSApplication sharedApplication];",
    "    MuyecodeAppDelegate *delegate = [MuyecodeAppDelegate new];",
    "    [app setDelegate:delegate];",
    "    [app setActivationPolicy:NSApplicationActivationPolicyRegular];",
    `    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, ${size.width}, ${size.height}) styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable) backing:NSBackingStoreBuffered defer:NO];`,
    "    [window setTitle:@\"Muyecode GUI\"];",
    "    WKWebViewConfiguration *config = [WKWebViewConfiguration new];",
    "    [config.userContentController addScriptMessageHandler:delegate name:@\"muyecodeQuit\"];",
    "    WKWebView *view = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, window.contentView.bounds.size.width, window.contentView.bounds.size.height) configuration:config];",
    "    [view setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];",
    "    [window setContentView:view];",
    `    [view loadHTMLString:${objcRawString(html)} baseURL:nil];`,
    "    [window makeKeyAndOrderFront:nil];",
    "    [app activateIgnoringOtherApps:YES];",
    "    [app run];",
    "  }",
    "  return 0;",
    "}",
    ""
  ].join("\n");
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
  constructor(options = {}) {
    this.options = options;
    this.imports = new Set();
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
      "const rand = () => Math.floor(Math.random() * 1000000000);",
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

    if (rawLine.startsWith("get ")) {
      this.importHeader(compileGet(rawLine, lineNumber, this.options));
      return;
    }

    if (rawLine.startsWith("declare ")) {
      compileDeclare(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("cmp ")) {
      this.imports.add(compileCmp(rawLine, lineNumber));
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

    assertImports(rawLine, lineNumber, this.imports);

    if (rawLine.startsWith("value ") || rawLine.startsWith("let ")) {
      this.pushLines(this.isDirectlyInClass() ? compileClassValue(rawLine, lineNumber) : compileValue(rawLine, lineNumber, "let"));
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
      if (isMethodAlias(rawLine)) {
        this.pushLine(compileMethodAlias(rawLine, lineNumber));
        return;
      }

      this.compileMethod(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("return")) {
      this.pushLine(compileReturn(rawLine));
      return;
    }

    if (/^(?:this|[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)+\s*=/.test(rawLine)) {
      this.pushLine(this.isDirectlyInClass() ? compileDirectClassField(rawLine, lineNumber) : `${rawLine};`);
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

    if (!this.isDirectlyInClass()) {
      this.pushLine(`function ${match[1]}(${match[2]}) {`);
      this.blockStack.push({ type: "function", lineNumber });
      this.indent += 1;
      return;
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

  isDirectlyInClass() {
    return this.blockStack[this.blockStack.length - 1]?.type === "class";
  }

  importHeader(header) {
    this.imports.add(header.name);

    for (const line of header.lines) {
      this.compileLine(line.text, line.lineNumber);
    }
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
  constructor(options = {}) {
    this.options = options;
    this.imports = new Set();
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

    if (rawLine.startsWith("get ")) {
      this.importHeader(compileGet(rawLine, lineNumber, this.options));
      return;
    }

    if (rawLine.startsWith("declare ")) {
      compileDeclare(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("cmp ")) {
      this.imports.add(compileCmp(rawLine, lineNumber));
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

    assertImports(rawLine, lineNumber, this.imports);

    if (rawLine.startsWith("canvas ")) {
      this.compileCanvas(rawLine);
      return;
    }

    if (rawLine.startsWith("value ") || rawLine.startsWith("let ")) {
      this.pushLines(this.isDirectlyInClass() ? compileClassValue(rawLine, lineNumber) : compileValue(rawLine, lineNumber, "let"));
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

    if (rawLine.startsWith("wait ")) {
      this.pushLine(compileWait(rawLine));
      return;
    }

    if (rawLine.startsWith("window ")) {
      this.compileWindow(rawLine);
      return;
    }

    if (rawLine.startsWith("background ")) {
      this.background = rawLine.slice("background ".length).trim() || this.background;
      return;
    }

    if (isGuiCommand(rawLine)) {
      this.pushLine(compileHtmlGuiCommand(rawLine, lineNumber));
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
      if (isMethodAlias(rawLine)) {
        this.pushLine(compileMethodAlias(rawLine, lineNumber));
        return;
      }

      this.compileMethod(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("return")) {
      this.pushLine(compileReturn(rawLine));
      return;
    }

    if (/^(?:this|[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)+\s*=/.test(rawLine)) {
      this.pushLine(this.isDirectlyInClass() ? compileDirectClassField(rawLine, lineNumber) : `${rawLine};`);
      return;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\s*\(.*\)$/.test(rawLine)) {
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

  compileWindow(line) {
    const args = splitCommandArgs(line.slice("window ".length).trim());
    this.width = args[0] || this.width;
    this.height = args[1] || this.height;
    this.background = args[3] || this.background;
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

  compileClass(line, lineNumber) {
    const name = line.slice("class ".length).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Line ${lineNumber}: expected class Name`);
    }

    this.pushLine(`class ${name} {`);
    this.blockStack.push("class");
    this.indent += 1;
  }

  compileMethod(line, lineNumber) {
    const body = line.slice("method ".length).trim();
    const match = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);

    if (!match) {
      throw new Error(`Line ${lineNumber}: expected method name(arg1, arg2)`);
    }

    if (!this.isDirectlyInClass()) {
      this.pushLine(`async function ${match[1]}(${match[2]}) {`);
      this.blockStack.push("function");
      this.indent += 1;
      return;
    }

    const name = match[1] === "init" ? "constructor" : match[1] === "run" ? "async run" : match[1];
    this.pushLine(`${name}(${match[2]}) {`);
    this.blockStack.push("method");
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

  isDirectlyInClass() {
    return this.blockStack[this.blockStack.length - 1] === "class";
  }

  importHeader(header) {
    this.imports.add(header.name);

    for (const line of header.lines) {
      this.compileLine(line.text, line.lineNumber);
    }
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
      "    #app { position: relative; }",
      "    .gui-control { position: absolute; box-sizing: border-box; font-family: Arial, sans-serif; }",
      "  </style>",
      "</head>",
      "<body>",
      "  <div id=\"app\">",
      `    <canvas id="screen" width="${stripQuotes(this.width)}" height="${stripQuotes(this.height)}"></canvas>`,
      "  </div>",
      "  <script>",
      "    const appEl = document.getElementById(\"app\");",
      "    const canvasEl = document.getElementById(\"screen\");",
      "    const ctx = canvasEl.getContext(\"2d\");",
      "    const len = (value) => value.length;",
      "    const str = (value) => String(value);",
      "    const num = (value) => Number(value);",
      "    const print = (...values) => console.log(values.map(str).join(\" \"));",
      "    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
      "    const rand = () => Math.floor(Math.random() * 1000000000);",
      "    const quit = () => { if (window.webkit?.messageHandlers?.muyecodeQuit) window.webkit.messageHandlers.muyecodeQuit.postMessage(\"quit\"); else window.close(); };",
      "    const guivalue = (id) => {",
      "      const item = document.getElementById(String(id));",
      "      if (!item) return null;",
      "      if (item.type === \"checkbox\" || item.type === \"radio\") return item.checked;",
      "      if (item.tagName === \"SELECT\") return item.value;",
      "      return item.value ?? item.textContent;",
      "    };",
      "    const guiPlace = (item, id, x, y, width, height) => { item.id = String(id); item.className = \"gui-control\"; item.style.left = x + \"px\"; item.style.top = y + \"px\"; item.style.width = width + \"px\"; item.style.height = height + \"px\"; appEl.appendChild(item); return item; };",
      "    const guiTextBox = (id, x, y, width, height, value = \"\") => { const item = guiPlace(document.createElement(\"input\"), id, x, y, width, height); item.value = value; return item; };",
      "    const guiPassword = (id, x, y, width, height, value = \"\") => { const item = guiTextBox(id, x, y, width, height, value); item.type = \"password\"; return item; };",
      "    const guiTextArea = (id, x, y, width, height, value = \"\") => { const item = guiPlace(document.createElement(\"textarea\"), id, x, y, width, height); item.value = value; return item; };",
      "    const guiCheckBox = (id, x, y, width, height, text = \"\", checked = false) => { const label = guiPlace(document.createElement(\"label\"), id + \"_label\", x, y, width, height); const item = document.createElement(\"input\"); item.id = String(id); item.type = \"checkbox\"; item.checked = !!checked; label.appendChild(item); label.appendChild(document.createTextNode(\" \" + text)); return item; };",
      "    const guiButton = (id, x, y, width, height, text = \"Button\") => { const item = guiPlace(document.createElement(\"button\"), id, x, y, width, height); item.textContent = text; return item; };",
      "    const guiLabel = (id, x, y, width, height, text = \"\", size = 16, bold = false) => { if (typeof size === \"boolean\") { bold = size; size = 16; } const item = guiPlace(document.createElement(\"div\"), id, x, y, width, height); item.textContent = text; item.style.fontSize = size + \"px\"; if (bold) item.style.fontWeight = \"700\"; return item; };",
      "    const guiSlider = (id, x, y, width, height, min = 0, max = 100, value = 0) => { const item = guiPlace(document.createElement(\"input\"), id, x, y, width, height); item.type = \"range\"; item.min = min; item.max = max; item.value = value; return item; };",
      "    const guiDropdown = (id, x, y, width, height, ...items) => { const item = guiPlace(document.createElement(\"select\"), id, x, y, width, height); for (const text of items) { const option = document.createElement(\"option\"); option.value = text; option.textContent = text; item.appendChild(option); } return item; };",
      "    const push = (list, value) => list.push(value);",
      "    const removefirst = (list) => list.shift();",
      "    const keys = {};",
      "    const keyPresses = {};",
      "    const key = (name) => !!keys[name];",
      "    const pressed = (name) => { const count = keyPresses[name] || 0; if (count > 0) keyPresses[name] = count - 1; return count > 0; };",
      "    window.addEventListener(\"keydown\", (event) => { if (!keys[event.key]) keyPresses[event.key] = (keyPresses[event.key] || 0) + 1; keys[event.key] = true; event.preventDefault(); });",
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
  constructor(options = {}) {
    this.options = options;
    this.imports = new Set();
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

    if (rawLine.startsWith("get ")) {
      this.importHeader(compileGet(rawLine, lineNumber, this.options));
      return;
    }

    if (rawLine.startsWith("declare ")) {
      compileDeclare(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("cmp ")) {
      this.imports.add(compileCmp(rawLine, lineNumber));
      return;
    }

    if (rawLine.startsWith("canvas ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("canvas ".length).trim());
      this.width = args[0] || this.width;
      this.height = args[1] || this.height;
      this.background = args[2] || this.background;
      return;
    }

    if (rawLine.startsWith("pen ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("pen ".length).trim());
      this.penColor = args[0] || this.penColor;
      this.penWidth = args[1] || this.penWidth;
      return;
    }

    if (rawLine.startsWith("fill ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("fill ".length).trim());
      this.fillColor = args[0] || "\"\"";
      return;
    }

    if (rawLine.startsWith("line ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("line ".length).trim());
      this.output.push(`screen.create_line(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}, fill=${toPython(this.penColor)}, width=${this.penWidth})`);
      return;
    }

    if (rawLine.startsWith("rect ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("rect ".length).trim());
      this.output.push(`screen.create_rectangle(${args[0]}, ${args[1]}, ${Number(args[0]) + Number(args[2])}, ${Number(args[1]) + Number(args[3])}, outline=${toPython(this.penColor)}, fill=${toPython(this.fillColor)}, width=${this.penWidth})`);
      return;
    }

    if (rawLine.startsWith("circle ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("circle ".length).trim());
      this.output.push(`screen.create_oval(${args[0]} - ${args[2]}, ${args[1]} - ${args[2]}, ${args[0]} + ${args[2]}, ${args[1]} + ${args[2]}, outline=${toPython(this.penColor)}, fill=${toPython(this.fillColor)}, width=${this.penWidth})`);
      return;
    }

    if (rawLine.startsWith("text ")) {
      assertImports(rawLine, lineNumber, this.imports);
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
  constructor(options = {}) {
    this.options = options;
    this.imports = new Set();
    this.width = "640";
    this.height = "420";
    this.title = "\"Muyecode\"";
    this.background = "\"white\"";
    this.penColor = "\"black\"";
    this.fillColor = "\"clear\"";
    this.penWidth = "2";
    this.drawLines = [];
    this.controlLines = [];
  }

  compileLine(rawLine, lineNumber) {
    if (!rawLine) {
      return;
    }

    if (rawLine.startsWith("get ")) {
      this.imports.add(compileGet(rawLine, lineNumber, this.options).name);
      return;
    }

    if (rawLine.startsWith("declare ")) {
      compileDeclare(rawLine, lineNumber);
      return;
    }

    if (rawLine.startsWith("cmp ")) {
      this.imports.add(compileCmp(rawLine, lineNumber));
      return;
    }

    if (rawLine.startsWith("canvas ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("canvas ".length).trim());
      this.width = args[0] || this.width;
      this.height = args[1] || this.height;
      this.background = args[2] || this.background;
      return;
    }

    if (rawLine.startsWith("window ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("window ".length).trim());
      this.width = args[0] || this.width;
      this.height = args[1] || this.height;
      this.title = args[2] || this.title;
      this.background = args[3] || this.background;
      return;
    }

    if (rawLine.startsWith("title ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.title = rawLine.slice("title ".length).trim() || this.title;
      return;
    }

    if (rawLine.startsWith("background ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.background = rawLine.slice("background ".length).trim() || this.background;
      return;
    }

    if (rawLine.startsWith("label ") || rawLine.startsWith("heading ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaLabel(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("button ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaButton(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("textbox ") || rawLine.startsWith("inputbox ") || rawLine.startsWith("password ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaTextBox(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("textarea ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaTextArea(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("checkbox ") || rawLine.startsWith("switch ") || rawLine.startsWith("radio ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaChoice(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("slider ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaSlider(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("progress ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaProgress(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("dropdown ") || rawLine.startsWith("select ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaDropdown(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("date ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaDate(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("separator ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaSeparator(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("image ")) {
      assertImports(rawLine, lineNumber, this.imports);
      this.controlLines.push(compileCocoaImage(rawLine, lineNumber, this.controlLines.length));
      return;
    }

    if (rawLine.startsWith("pen ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("pen ".length).trim());
      this.penColor = args[0] || this.penColor;
      this.penWidth = args[1] || this.penWidth;
      return;
    }

    if (rawLine.startsWith("fill ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("fill ".length).trim());
      this.fillColor = args[0] || "\"clear\"";
      return;
    }

    if (rawLine.startsWith("line ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("line ".length).trim());
      this.drawLines.push(`drawLine(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}, ${objcString(this.penColor)}, ${this.penWidth});`);
      return;
    }

    if (rawLine.startsWith("rect ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("rect ".length).trim());
      this.drawLines.push(`drawRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}, ${objcString(this.penColor)}, ${objcString(this.fillColor)}, ${this.penWidth});`);
      return;
    }

    if (rawLine.startsWith("circle ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("circle ".length).trim());
      this.drawLines.push(`drawCircle(${args[0]}, ${args[1]}, ${args[2]}, ${objcString(this.penColor)}, ${objcString(this.fillColor)}, ${this.penWidth});`);
      return;
    }

    if (rawLine.startsWith("text ")) {
      assertImports(rawLine, lineNumber, this.imports);
      const args = splitCommandArgs(rawLine.slice("text ".length).trim());
      this.drawLines.push(`drawText(${args[0]}, ${args[1]}, ${objcString(args[2])}, ${args[3] || "24"}, ${objcString(this.penColor)});`);
      return;
    }

    throw new Error(`Line ${lineNumber}: native exec output supports drawing commands, got "${rawLine}"`);
  }

  importHeader(header) {
    this.imports.add(header.name);

    for (const line of header.lines) {
      this.compileLine(line.text, line.lineNumber);
    }
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
      `    [window setTitle:${objcString(this.title)}];`,
      "    MuyecodeView *contentView = [[MuyecodeView alloc] initWithFrame:NSMakeRect(0, 0, window.contentView.bounds.size.width, window.contentView.bounds.size.height)];",
      "    [window setContentView:contentView];",
      ...this.controlLines.flatMap((line) => line.split("\n").map((part) => `    ${part}`)),
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

function compileCocoaLabel(line, lineNumber, index) {
  const command = line.startsWith("heading ") ? "heading" : "label";
  const args = splitCommandArgs(line.slice(`${command} `.length).trim());
  requireArgCount("label", args, 5, lineNumber);
  const size = args[5] || (command === "heading" ? "26" : "18");
  const weightLine = command === "heading"
    ? `[label${index} setFont:[NSFont boldSystemFontOfSize:${size}]];`
    : `[label${index} setFont:[NSFont systemFontOfSize:${size}]];`;
  return [
    `NSTextField *label${index} = [NSTextField labelWithString:${objcString(args[4])}];`,
    `[label${index} setFrame:NSMakeRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]})];`,
    weightLine,
    `[contentView addSubview:label${index}];`
  ].join("\n");
}

function compileCocoaButton(line, lineNumber, index) {
  const args = splitCommandArgs(line.slice("button ".length).trim());
  const guiArgs = parseGuiIdArgs("button", args, 5, lineNumber);
  const realArgs = guiArgs.args;
  return [
    `NSButton *button${index} = [NSButton buttonWithTitle:${objcString(realArgs[4])} target:nil action:nil];`,
    `[button${index} setIdentifier:${objcString(guiArgs.id)}];`,
    `[button${index} setFrame:NSMakeRect(${realArgs[0]}, ${realArgs[1]}, ${realArgs[2]}, ${realArgs[3]})];`,
    `[button${index} setBezelStyle:NSBezelStyleRounded];`,
    `[contentView addSubview:button${index}];`
  ].join("\n");
}

function compileCocoaTextBox(line, lineNumber, index) {
  const command = line.startsWith("inputbox ") ? "inputbox" : line.startsWith("password ") ? "password" : "textbox";
  const args = splitCommandArgs(line.slice(`${command} `.length).trim());
  const guiArgs = parseGuiIdArgs(command, args, 5, lineNumber);
  const type = command === "password" ? "NSSecureTextField" : "NSTextField";
  const realArgs = guiArgs.args;
  return [
    `${type} *textbox${index} = [[${type} alloc] initWithFrame:NSMakeRect(${realArgs[0]}, ${realArgs[1]}, ${realArgs[2]}, ${realArgs[3]})];`,
    `[textbox${index} setIdentifier:${objcString(guiArgs.id)}];`,
    `[textbox${index} setStringValue:${objcString(realArgs[4])}];`,
    `[contentView addSubview:textbox${index}];`
  ].join("\n");
}

function compileCocoaTextArea(line, lineNumber, index) {
  const args = splitCommandArgs(line.slice("textarea ".length).trim());
  const guiArgs = parseGuiIdArgs("textarea", args, 5, lineNumber);
  const realArgs = guiArgs.args;
  return [
    `NSScrollView *scroll${index} = [[NSScrollView alloc] initWithFrame:NSMakeRect(${realArgs[0]}, ${realArgs[1]}, ${realArgs[2]}, ${realArgs[3]})];`,
    `[scroll${index} setIdentifier:${objcString(`${stripQuotes(guiArgs.id)}_scroll`)}];`,
    `[scroll${index} setBorderType:NSBezelBorder];`,
    `[scroll${index} setHasVerticalScroller:YES];`,
    `NSTextView *textarea${index} = [[NSTextView alloc] initWithFrame:NSMakeRect(0, 0, ${realArgs[2]}, ${realArgs[3]})];`,
    `[textarea${index} setIdentifier:${objcString(guiArgs.id)}];`,
    `[textarea${index} setString:${objcString(realArgs[4])}];`,
    `[scroll${index} setDocumentView:textarea${index}];`,
    `[contentView addSubview:scroll${index}];`
  ].join("\n");
}

function compileCocoaChoice(line, lineNumber, index) {
  const command = line.match(/^([A-Za-z_][A-Za-z0-9_]*)/)[1];
  const args = splitCommandArgs(line.slice(`${command} `.length).trim());
  const guiArgs = parseGuiIdArgs(command, args, 6, lineNumber);
  const realArgs = guiArgs.args;
  const buttonType = command === "radio" ? "NSButtonTypeRadio" : command === "switch" ? "NSButtonTypeSwitch" : "NSButtonTypeSwitch";
  return [
    `NSButton *choice${index} = [NSButton checkboxWithTitle:${objcString(realArgs[4])} target:nil action:nil];`,
    `[choice${index} setIdentifier:${objcString(guiArgs.id)}];`,
    `[choice${index} setFrame:NSMakeRect(${realArgs[0]}, ${realArgs[1]}, ${realArgs[2]}, ${realArgs[3]})];`,
    `[choice${index} setButtonType:${buttonType}];`,
    `[choice${index} setState:${truthy(realArgs[5]) ? "NSControlStateValueOn" : "NSControlStateValueOff"}];`,
    `[contentView addSubview:choice${index}];`
  ].join("\n");
}

function compileCocoaSlider(line, lineNumber, index) {
  const args = splitCommandArgs(line.slice("slider ".length).trim());
  const guiArgs = parseGuiIdArgs("slider", args, 7, lineNumber);
  const realArgs = guiArgs.args;
  return [
    `NSSlider *slider${index} = [[NSSlider alloc] initWithFrame:NSMakeRect(${realArgs[0]}, ${realArgs[1]}, ${realArgs[2]}, ${realArgs[3]})];`,
    `[slider${index} setIdentifier:${objcString(guiArgs.id)}];`,
    `[slider${index} setMinValue:${realArgs[4]}];`,
    `[slider${index} setMaxValue:${realArgs[5]}];`,
    `[slider${index} setDoubleValue:${realArgs[6]}];`,
    `[contentView addSubview:slider${index}];`
  ].join("\n");
}

function compileCocoaProgress(line, lineNumber, index) {
  const args = splitCommandArgs(line.slice("progress ".length).trim());
  requireArgCount("progress", args, 7, lineNumber);
  return [
    `NSProgressIndicator *progress${index} = [[NSProgressIndicator alloc] initWithFrame:NSMakeRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]})];`,
    `[progress${index} setIndeterminate:NO];`,
    `[progress${index} setMinValue:${args[4]}];`,
    `[progress${index} setMaxValue:${args[5]}];`,
    `[progress${index} setDoubleValue:${args[6]}];`,
    `[contentView addSubview:progress${index}];`
  ].join("\n");
}

function compileCocoaDropdown(line, lineNumber, index) {
  const command = line.startsWith("select ") ? "select" : "dropdown";
  const args = splitCommandArgs(line.slice(`${command} `.length).trim());
  const guiArgs = parseGuiIdArgs(command, args, 5, lineNumber);
  const realArgs = guiArgs.args;
  const items = realArgs.slice(4).map((item) => objcString(item)).join(", ");
  return [
    `NSPopUpButton *dropdown${index} = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(${realArgs[0]}, ${realArgs[1]}, ${realArgs[2]}, ${realArgs[3]}) pullsDown:NO];`,
    `[dropdown${index} setIdentifier:${objcString(guiArgs.id)}];`,
    `[dropdown${index} addItemsWithTitles:@[${items}]];`,
    `[contentView addSubview:dropdown${index}];`
  ].join("\n");
}

function compileCocoaDate(line, lineNumber, index) {
  const args = splitCommandArgs(line.slice("date ".length).trim());
  requireArgCount("date", args, 4, lineNumber);
  return [
    `NSDatePicker *date${index} = [[NSDatePicker alloc] initWithFrame:NSMakeRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]})];`,
    `[date${index} setDatePickerStyle:NSDatePickerStyleTextFieldAndStepper];`,
    `[contentView addSubview:date${index}];`
  ].join("\n");
}

function compileCocoaSeparator(line, lineNumber, index) {
  const args = splitCommandArgs(line.slice("separator ".length).trim());
  requireArgCount("separator", args, 4, lineNumber);
  return [
    `NSBox *separator${index} = [[NSBox alloc] initWithFrame:NSMakeRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]})];`,
    `[separator${index} setBoxType:NSBoxSeparator];`,
    `[contentView addSubview:separator${index}];`
  ].join("\n");
}

function compileCocoaImage(line, lineNumber, index) {
  const args = splitCommandArgs(line.slice("image ".length).trim());
  requireArgCount("image", args, 5, lineNumber);
  return [
    `NSImageView *image${index} = [[NSImageView alloc] initWithFrame:NSMakeRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]})];`,
    `[image${index} setImage:[[NSImage alloc] initWithContentsOfFile:${objcString(args[4])}]];`,
    `[image${index} setImageScaling:NSImageScaleProportionallyUpOrDown];`,
    `[contentView addSubview:image${index}];`
  ].join("\n");
}

function requireArgCount(command, args, count, lineNumber) {
  if (args.length < count) {
    throw new Error(`Line ${lineNumber}: ${command} needs ${count} values`);
  }
}

function truthy(value) {
  return value === "true" || value === "1" || value === "\"true\"" || value === "'true'";
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

function compileGet(line, lineNumber, options = {}) {
  const match = line.match(/^get\s+(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_/]*))$/);

  if (!match) {
    throw new Error(`Line ${lineNumber}: expected get "name"`);
  }

  const libraryPath = match[1] || match[2] || match[3];
  let compilerName = getLibraryCompilerName(libraryPath, lineNumber);
  const headerPath = findHeaderPath(libraryPath, options.baseDir);
  const headerSource = fs.readFileSync(headerPath, "utf8");
  const headerLines = headerSource.split(/\r?\n/);
  const importedLines = [];

  for (let index = 0; index < headerLines.length; index += 1) {
    const headerLine = stripComment(headerLines[index]).trim();

    if (!headerLine) {
      continue;
    }

    if (headerLine.startsWith("cmp ")) {
      compilerName = compileCmp(headerLine, index + 1);
      continue;
    }

    if (headerLine.startsWith("declare ")) {
      compileDeclare(headerLine, index + 1);
      continue;
    }

    importedLines.push({ text: headerLine, lineNumber: index + 1 });
  }

  return { name: compilerName, lines: importedLines };
}

function sourceImportsCompiler(source, compilerName, baseDir = process.cwd(), seen = new Set()) {
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripComment(lines[index]).trim();

    if (!line.startsWith("get ")) {
      continue;
    }

    try {
      const header = compileGet(line, index + 1, { baseDir });

      if (header.name === compilerName) {
        return true;
      }

      const key = `${baseDir}:${line}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      if (sourceImportsCompiler(header.lines.map((headerLine) => headerLine.text).join("\n"), compilerName, baseDir, seen)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

function getLibraryCompilerName(libraryPath, lineNumber) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*$/.test(libraryPath)) {
    throw new Error(`Line ${lineNumber}: invalid header name "${libraryPath}"`);
  }

  const parts = libraryPath.split("/");
  return parts[parts.length - 1];
}

function assertImports(line, lineNumber, imports) {
  if (usesGuiLibrary(line) && !imports.has("gui")) {
    throw new Error(`Line ${lineNumber}: import a module with cmp "gui" before GUI helpers`);
  }

  if (usesCanvasLibrary(line) && !imports.has("canvas")) {
    throw new Error(`Line ${lineNumber}: import a module with cmp "canvas" before canvas helpers`);
  }

  if (usesTimeLibrary(line) && !imports.has("time")) {
    throw new Error(`Line ${lineNumber}: import a module with cmp "time" before wait`);
  }

  if (usesRandomLibrary(line) && !imports.has("random")) {
    throw new Error(`Line ${lineNumber}: import a module with cmp "random" before random helpers`);
  }
}

function usesGuiLibrary(line) {
  return isGuiCommand(line) || /\b(?:quit|guivalue)\s*\(/.test(line);
}

function isGuiCommand(line) {
  return /^(window|title|background|heading|label|button|textbox|inputbox|password|textarea|checkbox|switch|radio|slider|progress|dropdown|select|date|separator|image)\b/.test(line);
}

function usesCanvasLibrary(line) {
  return /^(canvas|pen|fill|line|rect|box|circle|text|clear)\b/.test(line) || /\b(?:key|pressed)\s*\(/.test(line);
}

function usesTimeLibrary(line) {
  return /^wait\b/.test(line);
}

function usesRandomLibrary(line) {
  return /\b(?:rand|rand_int|rand_double)\s*\(/.test(line);
}

function findHeaderPath(libraryName, baseDir = process.cwd()) {
  const fileName = `${libraryName}.muyecode`;
  const candidates = [
    path.join(baseDir, "lib", fileName),
    path.join(baseDir, "..", "lib", fileName),
    path.join(process.cwd(), "lib", fileName),
    path.join(__dirname, "..", "..", "..", "lib", fileName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`unknown library "${libraryName}"`);
}

function compileDeclare(line, lineNumber) {
  const body = line.slice("declare ".length).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*\s*(?:\([^)]*\))?$/.test(body)) {
    throw new Error(`Line ${lineNumber}: expected declare name or declare name(args)`);
  }

  return "";
}

function isMethodAlias(line) {
  return /^method\s+[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line);
}

function compileMethodAlias(line, lineNumber) {
  const match = line.match(/^method\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/);

  if (!match) {
    throw new Error(`Line ${lineNumber}: expected method name = otherName`);
  }

  return `const ${match[1]} = ${match[2]};`;
}

function compileCmp(line, lineNumber) {
  const match = line.match(/^cmp\s+["']([A-Za-z_][A-Za-z0-9_]*)["']$/);

  if (!match) {
    throw new Error(`Line ${lineNumber}: expected cmp "name"`);
  }

  return match[1];
}

function compileClassValue(line, lineNumber) {
  const body = line.replace(/^(value|let)\s+/, "").trim();
  const declarations = splitTopLevel(body, ",").map((part) => part.trim()).filter(Boolean);

  if (declarations.length === 0) {
    throw new Error(`Line ${lineNumber}: expected a class value declaration`);
  }

  return declarations.map((declaration) => {
    const match = declaration.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);

    if (!match) {
      throw new Error(`Line ${lineNumber}: invalid class value declaration "${declaration}"`);
    }

    return `${match[1]} = ${match[2]};`;
  }).join("\n");
}

function compileDirectClassField(line, lineNumber) {
  const match = line.match(/^this\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);

  if (!match) {
    throw new Error(`Line ${lineNumber}: use value name = value inside a class`);
  }

  return `${match[1]} = ${match[2]};`;
}

function compileSet(line, lineNumber) {
  const body = line.replace(/^(set|change)\s+/, "").trim();
  const match = body.match(/^((?:this|[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*=\s*(.+)$/);

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
  const body = line.replace(/^wait\s+/, "").trim();
  return `await wait(${body});`;
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

function compileHtmlGuiCommand(line, lineNumber) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);

  if (!match) {
    throw new Error(`Line ${lineNumber}: invalid GUI command`);
  }

  const command = match[1];
  const args = splitCommandArgs(match[2].trim());

  if (command === "title" || command === "background" || command === "window") {
    return "";
  }

  if (command === "label" || command === "heading") {
    const guiArgs = parseGuiIdArgs(command, args, 5, lineNumber);
    return `guiLabel(${guiArgs.id}, ${guiArgs.args.join(", ")}, ${command === "heading"});`;
  }

  if (command === "textbox" || command === "inputbox") {
    const guiArgs = parseGuiIdArgs(command, args, 5, lineNumber);
    return `guiTextBox(${guiArgs.id}, ${guiArgs.args.join(", ")});`;
  }

  if (command === "password") {
    const guiArgs = parseGuiIdArgs(command, args, 5, lineNumber);
    return `guiPassword(${guiArgs.id}, ${guiArgs.args.join(", ")});`;
  }

  if (command === "textarea") {
    const guiArgs = parseGuiIdArgs(command, args, 5, lineNumber);
    return `guiTextArea(${guiArgs.id}, ${guiArgs.args.join(", ")});`;
  }

  if (command === "checkbox" || command === "switch" || command === "radio") {
    const guiArgs = parseGuiIdArgs(command, args, 6, lineNumber);
    return `guiCheckBox(${guiArgs.id}, ${guiArgs.args.join(", ")});`;
  }

  if (command === "button") {
    const guiArgs = parseGuiIdArgs(command, args, 5, lineNumber);
    return `guiButton(${guiArgs.id}, ${guiArgs.args.join(", ")});`;
  }

  if (command === "slider") {
    const guiArgs = parseGuiIdArgs(command, args, 7, lineNumber);
    return `guiSlider(${guiArgs.id}, ${guiArgs.args.join(", ")});`;
  }

  if (command === "dropdown" || command === "select") {
    const guiArgs = parseGuiIdArgs(command, args, 5, lineNumber);
    return `guiDropdown(${guiArgs.id}, ${guiArgs.args.join(", ")});`;
  }

  return "";
}

function parseGuiIdArgs(command, args, count, lineNumber) {
  requireArgCount(command, args, count, lineNumber);
  const firstArgIsId = isQuoted(args[0]) && args.length >= count + 1;
  const id = firstArgIsId ? args[0] : `"${command}${lineNumber}"`;
  const realArgs = firstArgIsId ? args.slice(1) : args;
  requireArgCount(command, realArgs, count, lineNumber);
  return { id, args: realArgs };
}

function isQuoted(value) {
  return /^["'].*["']$/.test(String(value));
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

function getCanvasSize(source, options = {}) {
  const lines = source.split(/\r?\n/);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = stripComment(lines[lineNumber]).trim();

    if (line.startsWith("get ")) {
      try {
        const header = compileGet(line, lineNumber + 1, options);
        const size = getCanvasSize(header.lines.map((headerLine) => headerLine.text).join("\n"), options);

        if (size.found) {
          return size;
        }
      } catch {
        continue;
      }
    }

    if (line.startsWith("canvas ")) {
      const args = splitCommandArgs(line.slice("canvas ".length).trim());
      return {
        found: true,
        width: Number(stripQuotes(args[0])) || 640,
        height: Number(stripQuotes(args[1])) || 420
      };
    }
  }

  return { found: false, width: 640, height: 420 };
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

function objcRawString(value) {
  const text = String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n");
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
