#!/usr/bin/env python3
"""
Thida 1.2 — CLI runner.

Usage:
    python thida_run.py <script.thida>     # run a script
    python thida_run.py                    # interactive REPL
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from thida import Interpreter


BANNER = """\
╔══════════════════════════════════════════════════╗
║       Thida 1.2 — Myanmar Data Language          ║
║       Type your code. Empty line to run.         ║
║       Type 'exit' or 'ထွက်ပါ' to quit.           ║
╚══════════════════════════════════════════════════╝
"""


def run_file(path: str):
    try:
        with open(path, encoding="utf-8") as f:
            source = f.read()
    except FileNotFoundError:
        print(f"Error: File '{path}' not found.")
        sys.exit(1)

    interp = Interpreter()
    try:
        interp.run(source)
    except Exception as e:
        print(e)
        sys.exit(1)


def repl():
    print(BANNER)
    interp = Interpreter()
    buf = []

    while True:
        try:
            prompt = "... " if buf else ">>> "
            line = input(prompt)
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye / နှုတ်ဆက်ပါ")
            break

        if line.strip() in ("exit", "ထွက်ပါ", "quit"):
            print("Goodbye / နှုတ်ဆက်ပါ")
            break

        if line == "" and buf:
            source = "\n".join(buf)
            buf.clear()
            try:
                interp.run(source)
            except Exception as e:
                print(e)
        elif line != "":
            buf.append(line)


if __name__ == "__main__":
    if len(sys.argv) == 2:
        run_file(sys.argv[1])
    else:
        repl()
