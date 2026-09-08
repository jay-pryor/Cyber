#!/usr/bin/env bash
# Exercises tools/build.py's rule checks. Each case asserts an exit code, because the
# rules ARE the contract: a violation must fail the build, not warn and carry on.
#
# There is no Python test framework in this repo and adding one is out of scope, so
# these are executable assertions on observable behaviour.
set -u
cd "$(dirname "$0")/.."
fail=0

expect() { # expect <desc> <expected-exit> <cmd...>
  local desc="$1" want="$2"; shift 2
  "$@" >/dev/null 2>&1; local got=$?
  if [ "$got" != "$want" ]; then
    echo "FAIL: $desc (want exit $want, got $got)"; fail=1
  else
    echo "  ok: $desc"
  fi
}

expect "the default manifest is up to date" 0 python3 tools/build.py --check
# --stdout assembles and validates without writing, so the module target can be
# checked before anything consumes its output.
expect "the module manifest assembles" 0 python3 tools/build.py --stdout --manifest src/build-doc.json

# A file on disk listed in NO manifest must be reported as an orphan.
probe="src/js/9999-orphan-probe.js"
printf '/* probe */\n' > "$probe"
expect "a file in no manifest is an orphan" 1 python3 tools/build.py --check
rm -f "$probe"
expect "removing it restores a clean build" 0 python3 tools/build.py --check

exit $fail
