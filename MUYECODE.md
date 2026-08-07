# Muyecode Language

Muyecode is a tiny beginner-friendly language that compiles to JavaScript.

Files use the `.muyecode` extension.

## Compile And Run

Compile:

```sh
./muyecodecmp test.muyecode -o test.js
```

Compile to the automatic output folder:

```sh
./muyecodecmp test.muyecode
```

This creates:

```text
muyecodecmps/test.js
```

Compiler helper files go under:

```text
muyecodecmps/__cmp/<file-name>/
```

Compiler/editor internals go under:

```text
muyecodecmps/__cmp/core/
```

Compile and run:

```sh
./muyecodecmp test.muyecode -o test.js -o run
```

In VS Code, Muyecode files also show buttons in the editor title:

- Compile
- Run
- Compile and Run

VS Code also auto-indents after block lines like `class`, `method`, `function`, `if`, and `while`.
When you press Enter after a block line, VS Code inserts `end` automatically.
Compiler errors appear in the Problems panel while editing.

Compile any Muyecode file:

```sh
./muyecodecmp path/to/file.muyecode -o output.js
```

## Comments

Use `#` for comments.

```muyecode
# This is a comment
value name = "Muye"
```

## Values

Create values with `value`.

```muyecode
value a = 3
value b = "abc"
value ok = true
value empty = null
```

You can create more than one value on a line.

```muyecode
value x = 1, y = 2, z = 3
```

## Change Values

Use `set` to change an existing value.

```muyecode
value score = 0
set score = score + 10
print score
```

## Print

Use `print` to write output.

```muyecode
value name = "Muyecode"
print "Hello" name
```

You can also separate print items with commas.

```muyecode
print "Answer:", 42
```

## Math

Muyecode uses JavaScript-style expressions.

```muyecode
value total = 3 + 4 * 2
value average = total / 2
print total average
```

## Comparisons

Use comparison expressions inside `if` and `while`.

```muyecode
value age = 18

if age >= 18
    print "adult"
else
    print "not adult"
end
```

Common operators:

- `==` equal
- `!=` not equal
- `<` less than
- `<=` less than or equal
- `>` greater than
- `>=` greater than or equal

## If Blocks

Use `if`, optional `else`, and `end`.

```muyecode
value temperature = 30

if temperature > 25
    print "warm"
else
    print "cool"
end
```

## While Loops

Use `while` and `end`.

```muyecode
value count = 1

while count <= 3
    print count
    set count = count + 1
end
```

## Functions

Define functions with `function`, use `return` to send a value back, and close the function with `end`.

```muyecode
function add(a, b)
    return a + b
end

value answer = add(2, 3)
print answer
```

## Classes

Create classes with `class`. Use `method init(...)` for the constructor. Use `this.name` for object fields.

```muyecode
class Counter
    method init(start)
        this.n = start
    end

    method next()
        this.n = this.n + 1
        return this.n
    end
end

let counter = new Counter(10)
say counter.next()
say counter.next()
```

`method init(...)` compiles to a JavaScript constructor.

## Easier Words

These pairs mean the same thing:

- `value` and `let`
- `set` and `change`
- `print` and `say`

## Built In Functions

Muyecode has a few built-in helper functions.

```muyecode
value word = "hello"
print len(word)
print str(123)
print num("456") + 1
```

Built-ins:

- `input(message)` reads text from the terminal
- `len(value)` gets length
- `str(value)` converts to text
- `num(value)` converts to a number
- `openfile(file)` reads a file as text

## Files

Read a file:

```muyecode
value text = openfile("notes.txt")
print text
```

Write a file:

```muyecode
writefile "notes.txt" "hello from Muyecode"
```

Append to a file:

```muyecode
appendfile "notes.txt" "\nmore text"
```

## Drawing

Muyecode can make simple SVG drawings.

Start with `canvas`, then draw shapes.

```muyecode
canvas 500 320 "white"

fill "#dff7ff"
pen "#2563eb" 4
rect 40 40 420 220

fill "#ffd166"
pen "#111827" 3
circle 250 150 70

pen "#ef4444" 8
line 175 245 325 245

pen "#111827" 2
text 165 155 "Muyecode Draw" 28
```

Compile and run the drawing example:

```sh
./muyecodecmp drawing.muyecode -o drawing.js -o run
```

Open the same drawing in a real browser canvas window:

```sh
./muyecodecmp drawing.muyecode -o drawing.html -o run
```

Create a real macOS executable window:

```sh
./muyecodecmp drawing.muyecode -o drawing_muyecode_exec -o exec
./drawing_muyecode_exec
```

Or compile and run it immediately:

```sh
./muyecodecmp drawing.muyecode -o drawing_muyecode_exec -o exec -o run
```

This produces a native Mach-O executable on macOS.

Drawing commands:

- `canvas width height background`
- `pen color width`
- `fill color`
- `line x1 y1 x2 y2`
- `rect x y width height`
- `box x y size`
- `circle x y radius`
- `text x y message size`

## Canvas Loops

For animation, make your own class and write the loop yourself with `while true`.

Useful commands:

- `wait ms` pauses inside canvas mode
- `key("ArrowUp")` checks if a key is pressed
- `random(max)` returns a random integer from `0` to `max - 1`
- `clear color` clears the whole canvas
- `box x y size` draws a filled square

Example:

```muyecode
canvas 400 400 "black"
class SnakeGame
    method init()
        this.x = 200
        this.y = 200
    end

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

Run the snake example:

```sh
./muyecodecmp snake.muyecode -o run
```

Files that use `canvas`, `wait`, `sleep`, or `key(...)` automatically compile to a canvas window when no output filename is provided.

## Complete Example

```muyecode
value name = "Muyecode"
value count = 1

function shout(text)
    return str(text) + "!"
end

while count <= 3
    print shout(name), count
    set count = count + 1
end
```
