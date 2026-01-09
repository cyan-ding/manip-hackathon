#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCED[0]}")" && pwd)"
cd "$PROJECT_DIR"

if ! command -v uv >/dev/null 2>&1; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
fi

export PATH="$HOME/.local/bin:$PATH"

if [ ! -d ".venv" ]; then
    uv venv 
fi

uv sync