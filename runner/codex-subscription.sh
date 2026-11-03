#!/bin/bash
set -eu
# Keep Codex authentication in the user's own credential store. Do not load
# project/user agent hooks, custom providers or rules into portfolio research.
if [ "${1:-}" = exec ]; then
  shift
  exec /home/snemmani/.local/bin/codex exec --ignore-user-config --ignore-rules --ephemeral "$@"
fi
exec /home/snemmani/.local/bin/codex "$@"
