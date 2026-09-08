"""A just-enough JavaScript scanner: bracket depth per line, string/comment aware.

The splitter needs to know one thing about every line of a <script> block: is the
START of this line a place where a new top-level statement could begin? That is true
only when the line begins outside every string, template literal, comment and regex
literal, at the bracket depth of the enclosing IIFE body.

This is NOT a parser. It tracks exactly enough state to answer that one question, and
it self-checks: a block whose depth does not return to zero at the end is reported so
the caller can refuse to split it rather than cutting somewhere unsafe.
"""

NORMAL, LINE_COMMENT, BLOCK_COMMENT, SQUOTE, DQUOTE, TEMPLATE, REGEX = range(7)

# A '/' opens a regex literal (not a division) when the previous meaningful token
# cannot end an expression. Anything else and it is division.
_ENDS_EXPRESSION = set(')]}')

# ...except after these keywords, which look like identifiers but cannot end an
# expression, so the '/' following one is always a regex. `return /re/.test(x)` is
# the case that actually occurs in this file, and getting it wrong desynchronises
# the depth count for the rest of the block.
_REGEX_AFTER = {
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'throw', 'case', 'do', 'else', 'yield', 'await',
}


def scan(lines):
    """Return (depths, clean) — parallel lists, one entry per line.

    depths[i] is the bracket nesting depth at the START of line i, counting (), [] and
    {} together. clean[i] is True when line i starts in NORMAL state, i.e. outside any
    string, comment or regex.
    """
    depths = []
    clean = []
    state = NORMAL
    depth = 0
    tmpl_stack = []          # brace depth at each nested `${` we are inside
    prev_token_char = ''     # last non-space character seen in NORMAL state
    prev_word = ''           # last identifier/keyword token, for the regex decision
    word = ''                # identifier being accumulated

    for line in lines:
        depths.append(depth)
        clean.append(state == NORMAL)
        i = 0
        n = len(line)
        while i < n:
            c = line[i]
            nxt = line[i + 1] if i + 1 < n else ''

            if state == NORMAL:
                if c.isalnum() or c in '_$':
                    word += c
                    prev_token_char = c
                    i += 1
                    continue
                if word:
                    prev_word = word
                    word = ''

                if c == '/' and nxt == '/':
                    state = LINE_COMMENT
                    i += 2
                    continue
                if c == '/' and nxt == '*':
                    state = BLOCK_COMMENT
                    i += 2
                    continue
                if c == '/':
                    ends_expr = prev_token_char != '' and (
                        prev_token_char in _ENDS_EXPRESSION
                        or (
                            (prev_token_char.isalnum() or prev_token_char in '_$')
                            and prev_word not in _REGEX_AFTER
                        )
                    )
                    if not ends_expr:
                        state = REGEX
                        i += 1
                        continue
                    prev_token_char = c
                    i += 1
                    continue
                if c == "'":
                    state = SQUOTE
                elif c == '"':
                    state = DQUOTE
                elif c == '`':
                    state = TEMPLATE
                elif c in '([{':
                    depth += 1
                elif c in ')]}':
                    depth -= 1
                if not c.isspace():
                    prev_token_char = c
                i += 1
                continue

            if state == LINE_COMMENT:
                i = n
                continue

            if state == BLOCK_COMMENT:
                if c == '*' and nxt == '/':
                    state = NORMAL
                    i += 2
                    continue
                i += 1
                continue

            if state in (SQUOTE, DQUOTE):
                if c == '\\':
                    i += 2
                    continue
                if (state == SQUOTE and c == "'") or (state == DQUOTE and c == '"'):
                    state = NORMAL
                    prev_token_char = c
                i += 1
                continue

            if state == TEMPLATE:
                if c == '\\':
                    i += 2
                    continue
                if c == '`':
                    state = NORMAL
                    prev_token_char = c
                    i += 1
                    continue
                if c == '$' and nxt == '{':
                    tmpl_stack.append(depth)
                    depth += 1
                    state = NORMAL
                    i += 2
                    continue
                i += 1
                continue

            if state == REGEX:
                if c == '\\':
                    i += 2
                    continue
                if c == '[':
                    # character class: ']' inside it does not close the regex
                    j = i + 1
                    while j < n:
                        if line[j] == '\\':
                            j += 2
                            continue
                        if line[j] == ']':
                            break
                        j += 1
                    i = j + 1
                    continue
                if c == '/':
                    state = NORMAL
                    prev_token_char = c
                i += 1
                continue

        if word:
            prev_word = word
            word = ''

        # A `${` interpolation that closed puts us back inside the template literal.
        if state == NORMAL and tmpl_stack and depth == tmpl_stack[-1]:
            tmpl_stack.pop()
            state = TEMPLATE

        if state in (LINE_COMMENT, REGEX):
            # Neither survives a newline (an unterminated regex would be a syntax error).
            state = NORMAL

    return depths, clean


def final_depth(lines):
    """Bracket depth after the last line — 0 for a well-formed block."""
    depths, _ = scan(lines + [''])
    return depths[-1]
