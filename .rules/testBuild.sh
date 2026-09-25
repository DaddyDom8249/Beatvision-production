#!/bin/bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VITE_TEMP="node_modules/.vite-temp"
if [ -L "$VITE_TEMP" ]; then
    rm "$VITE_TEMP"
    mkdir -p "$VITE_TEMP"
elif [ ! -e "$VITE_TEMP" ]; then
    mkdir -p "$VITE_TEMP"
fi

OUTPUT=$(npx --no-install vite build --minify false --logLevel error --outDir "$ROOT_DIR/.dist" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "$OUTPUT"
fi

exit $EXIT_CODE
