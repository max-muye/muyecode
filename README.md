# Muyecode

Muyecode is a small VS Code language extension and compiler for `.muyecode` files.

It includes:

- syntax highlighting and autocomplete
- file icon support
- editor buttons for compile, run, and compile+run
- auto indentation for blocks
- automatic `end` insertion after block lines
- error checking in VS Code Problems
- small headers in `lib`, used with lines like `get "canvas"`
- a compiler command: `./muyecodecmp`
- classes and simpler aliases like `let`, `say`, and `change`
- JavaScript output
- canvas window output for programs that use `canvas`, `key(...)`, `pressed(...)`, and time helpers
- native macOS drawing executable output
- native macOS GUI window output

## Get It

Clone the repository:

```sh
git clone https://github.com/max-muye/muyecode.git
cd muyecode
```

Open the folder in VS Code:

```sh
code .
```

Press `F5` to start an Extension Development Host window. Open a `.muyecode` file in that new window.

## Install Locally In VS Code

For normal VS Code use, install it directly into your VS Code extensions folder:

```sh
git clone https://github.com/max-muye/muyecode.git ~/.vscode/extensions/muyecode-language-local
chmod +x ~/.vscode/extensions/muyecode-language-local/muyecodecmp
```

Then run:

```text
Developer: Reload Window
```

After reload, `.muyecode` files should use the Muyecode language mode.

To update later:

```sh
cd ~/.vscode/extensions/muyecode-language-local
git pull
```

## Create A Program

Create a file like `hello.muyecode`:

```muyecode
let name = "Muyecode"
say "Hello" name
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
get "canvas"

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

## Canvas Loop

For movement or animation, make your own class and use `while true` with `wait`.

```muyecode
get "canvas"
get "random"
get "time"

canvas 400 400 "black"

class SnakeGame
    value x = 200
    value y = 200

    method run()
        while true
            if key("ArrowRight")
                change this.x = this.x + 20
            end

            clear "black"
            fill "#22c55e"
            box this.x this.y 20
            wait 100
        end
    end
end

let game = new SnakeGame()
game.run()
```

```sh
./muyecodecmp snake.muyecode -o run
```

Files that use `canvas`, `wait`, `sleep`, `key(...)`, or `pressed(...)` automatically open as a canvas window when no output filename is provided.

The full snake example is in:

```text
examples/snake.muyecode
```

## Native GUI Window

Create a simple GUI app with `get "canvas/gui"`:

```muyecode
get "canvas/gui"

window 420 260 "Muyecode GUI" "white"
label 30 30 330 34 "Hello from a real GUI window" 22
textbox 30 82 240 28 "type here"
button 30 130 130 34 "OK"
```

Build and run it:

```sh
./muyecodecmp examples/gui.muyecode -o run
```

That creates a real macOS executable in `muyecodecmps/`.

## Notes

Compiler outputs are ignored by git. The compiler internals live in:

```text
muyecodecmps/__cmp/core/
```

See [MUYECODE.md](MUYECODE.md) for the language guide.
