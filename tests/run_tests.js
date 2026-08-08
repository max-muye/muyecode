const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const compiler = path.join(root, "muyecodecmp");

function run(command, args) {
  const result = childProcess.spawnSync(command, args, {
    cwd: root,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }

  return result.stdout.trim();
}

function compile(example) {
  return run(compiler, [path.join("examples", example)]);
}

function assertFile(filePath, pattern, message) {
  const content = fs.readFileSync(path.join(root, filePath), "utf8");
  assert.match(content, pattern, message);
}

run("node", ["--check", "muyecodecmps/__cmp/core/muyecodec.js"]);
run("node", ["--check", "muyecodecmps/__cmp/core/extension.js"]);

compile("poker.muyecode");
compile("gui_snake.muyecode");
compile("gui_inputs.muyecode");
compile("snake.muyecode");

assert.strictEqual(fs.existsSync(path.join(root, "muyecodecmps", "poker")), true, "poker native executable should exist");
assert.strictEqual(fs.existsSync(path.join(root, "muyecodecmps", "gui_snake")), true, "gui snake native executable should exist");
assert.strictEqual(fs.existsSync(path.join(root, "muyecodecmps", "snake.html")), true, "plain snake html should exist");

assertFile("examples/poker.muyecode", /Royal Flush/, "poker should include Royal Flush scoring");
assertFile("examples/poker.muyecode", /Straight Flush/, "poker should include Straight Flush scoring");
assertFile("examples/poker.muyecode", /Four of a Kind/, "poker should include Four of a Kind scoring");
assertFile("examples/poker.muyecode", /Full House/, "poker should include Full House scoring");
assertFile("examples/poker.muyecode", /pressed\("q"\)/, "poker should support Q quit");

console.log("All Muyecode tests passed.");
