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
expect "the distributable folder is up to date" 0 python3 tools/build-dist.py --check

# A file on disk listed in NO manifest must be reported as an orphan.
probe="src/app/js/9999-orphan-probe.js"
printf '/* probe */\n' > "$probe"
expect "a file in no manifest is an orphan" 1 python3 tools/build.py --check
rm -f "$probe"
expect "removing it restores a clean build" 0 python3 tools/build.py --check


# --- the module boundary ---------------------------------------------------
# Exit code alone cannot tell "failed because of the boundary" from "failed
# because the probe file is also an orphan", so these assert on the message.
expect_msg() { # expect_msg <desc> <substring> <cmd...>
  local desc="$1" want="$2"; shift 2
  local out; out=$("$@" 2>&1)
  if printf '%s' "$out" | grep -q -- "$want"; then
    echo "  ok: $desc"
  else
    echo "FAIL: $desc (no '$want' in output)"; fail=1
  fi
}

mkdir -p src/app/js src/doc/js
printf 'App.probeThing = {};\n' > src/app/js/9997-app-probe.js
printf '(function (App) { var x = App.probeThing; }(App));\n' > src/doc/js/9998-doc-probe.js
expect_msg "a src/doc file referencing a src/app name is a boundary violation" \
  "boundary:" python3 tools/build.py --check

# A DEPENDS: banner naming an app module is documentation, not a reference.
printf '/* DEPENDS: App.probeThing */\n(function (App) { var y = 1; }(App));\n' \
  > src/doc/js/9998-doc-probe.js
out=$(python3 tools/build.py --check 2>&1)
if printf '%s' "$out" | grep -q "boundary:"; then
  echo "FAIL: a mention inside a comment must not count as a reference"; fail=1
else
  echo "  ok: a mention inside a comment is not a reference"
fi

rm -f src/app/js/9997-app-probe.js src/doc/js/9998-doc-probe.js
rmdir src/app/js src/app src/doc/js src/doc 2>/dev/null
expect "removing the probes restores a clean build" 0 python3 tools/build.py --check

exit $fail
