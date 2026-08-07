# Muyecode

Muyecode is a small VS Code language extension and compiler for `.muyecode` files.

It includes:

- syntax highlighting and autocomplete
- file icon support
- editor buttons for compile, run, and compile+run
- a compiler command: `./muyecodecmp`
- JavaScript output
- native macOS drawing executable output

## Get It

Clone the repository:

```sh
git clone <your-repo-url>
cd <your-repo-folder>
```

Open the folder in VS Code:

```sh
code .
```

Press `F5` to start an Extension Development Host window. Open a `.muyecode` file in that new window.

## Install Locally In VS Code

For normal VS Code use, copy this project folder into your VS Code extensions folder:

```sh
mkdir -p ~/.vscode/extensions/muyecode-language-local
cp -R . ~/.vscode/extensions/muyecode-language-local
```

Then run:

```text
Developer: Reload Window
```

After reload, `.muyecode` files should use the Muyecode language mode.

## Create A Program

Create a file like `hello.muyecode`:

```muyecode
value name = "Muyecode"
print "Hello" name
```

Compile it:

```sh
./muyecodecmp hello.muyecode
```

That creates:

```text
muyecodecmps/hello.js
```

Compile and run:

```sh
./muyecodecmp hello.muyecode -o run
```

Choose an output name:

```sh
./muyecodecmp hello.muyecode -o hello.js
```

## Native Drawing Executable

Create `drawing.muyecode`:

```muyecode
canvas 500 320 "white"
fill "#dff7ff"
pen "#2563eb" 4
rect 40 40 420 220
pen "#111827" 2
text 165 155 "Muyecode Draw" 28
```

Build a real macOS executable:

```sh
./muyecodecmp drawing.muyecode -o drawing_muyecode_exec -o exec
./drawing_muyecode_exec
```

## Notes

Compiler outputs are ignored by git. The compiler internals live in:

```text
muyecodecmps/__cmp/core/
```

See [MUYECODE.md](MUYECODE.md) for the language guide.
