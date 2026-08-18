-- grid-tables.lua
-- Render tables as LaTeX longtables with full grid lines
-- (vertical rules between columns, \hline between every row).

-- The width a column's TEXT may occupy, which is not \columnwidth.
--
-- A column costs the page more than the text it holds: array puts \tabcolsep on
-- both sides of every cell (2n of them across the table), and every | is
-- \arrayrulewidth wide (n+1 of them, counting the two outer borders). Pandoc's
-- column fractions are shares of the text, so that furniture has to come off the
-- top BEFORE they are applied -- pandoc's own writer emits
-- `p{(\columnwidth - N\tabcolsep) * \real{f}}` for exactly this reason.
--
-- Spending the fractions against a bare \columnwidth is what pushes a table past
-- the right margin, and by a lot: at the default 6pt \tabcolsep a six-column
-- table overruns by 2*6*6pt + 7*0.4pt, i.e. about 26mm.
--
-- \dimexpr rather than calc's `* \real{f}`: the scaling is an e-TeX primitive, so
-- it does not depend on the template having loaded calc, and TeX evaluates the
-- a*b/c idiom in a 64-bit intermediate, so the rounding error is a fraction of a
-- scaled point.
local function textwidth(ncols)
  return string.format('\\dimexpr(\\columnwidth-%d\\tabcolsep-%d\\arrayrulewidth)',
                       2 * ncols, ncols + 1)
end

local function colspec(cs, ncols, scale)
  local align, width = cs[1], cs[2]
  local pre = ''
  if align == 'AlignRight' then
    pre = '\\raggedleft\\arraybackslash'
  elseif align == 'AlignCenter' then
    pre = '\\centering\\arraybackslash'
  else
    pre = '\\raggedright\\arraybackslash'
  end
  if width and width > 0 then
    local share = math.floor(width * scale * 10000 + 0.5)
    if share < 1 then share = 1 end
    return '>{' .. pre .. '}p{' .. textwidth(ncols) .. '*' .. share .. '/10000\\relax}'
  end
  if align == 'AlignRight' then return 'r'
  elseif align == 'AlignCenter' then return 'c'
  else return 'l' end
end

-- Fractions that add up to more than the page are an overflow whoever wrote them,
-- so they are shared out rather than honoured. A grid table's widths always come
-- out at or just under 1, so this is a backstop, not a resize.
local function fitscale(colspecs)
  local sum = 0
  for _, cs in ipairs(colspecs) do
    local w = cs[2]
    if w and w > 0 then sum = sum + w end
  end
  if sum > 1 then return 1 / sum end
  return 1
end

-- A grid-table cell is a run of PARAGRAPHS, and the document generator uses that
-- deliberately -- one firewall rule, one whitelist entry, per line. Writing the
-- cell as one document and then flattening every newline runs them all back
-- together, so paragraphs are joined with \newline (which a p{} cell takes) and
-- only the lines WITHIN a paragraph are collapsed. Anything that is not a
-- paragraph -- a list, a code block -- keeps its own line, because a \newline in
-- front of \begin{itemize} is an error rather than a break.
local FLAT = { Para = true, Plain = true }

-- D-061: a line break INSIDE a paragraph, which is a different problem from the
-- one above and had the same cause.
--
-- Pandoc's own writer wraps a multi-line cell in a minipage, where its `\\` is a
-- legitimate line break. This filter writes the cell inline instead -- which is
-- what lets a merged cell and a row colour work at all -- and in a longtable row
-- a bare `\\` ENDS THE ROW. Measured on a built page: a cell reading `one\ two`
-- put "one" in the cell, "two" in the first column of a new row, and shunted the
-- rest of the table one column to the left.
--
-- `\newline` is the p{} cell's own line break, which is what the paragraph join
-- above already uses. The `\strut` gives the line it starts something to be tall
-- with, so two breaks in a row -- a deliberately blank line, which is exactly what
-- a spacer at the foot of a cell is -- cannot become LaTeX's "there's no line here
-- to end".
local function unbreak(blk)
  return pandoc.walk_block(blk, { LineBreak = function ()
    return pandoc.RawInline('latex', '\\newline\\strut ')
  end })
end

local function cell_latex(cell)
  local out, prev = {}, nil
  for _, blk in ipairs(cell.contents) do
    local s = pandoc.write(pandoc.Pandoc({ FLAT[blk.t] and unbreak(blk) or blk }), 'latex')
    if FLAT[blk.t] then s = s:gsub('%s*\n%s*', ' ') end
    s = s:gsub('^%s+', ''):gsub('%s+$', '')
    if s ~= '' then
      if prev then
        table.insert(out, (FLAT[blk.t] and FLAT[prev]) and ' \\newline ' or '\n')
      end
      table.insert(out, s)
      prev = blk.t
    end
  end
  return table.concat(out)
end

-- A cell that spans columns has to be emitted as ONE cell.
--
-- Padding the columns it covers with empty ones puts the right number of & in the
-- row, and leaves every vertical rule between them drawn straight through what is
-- supposed to be a merged cell -- so a table's title row came out crammed into the
-- first column with the grid still showing across it. \multicolumn is the only
-- construct that removes those rules, and it counts as the columns it covers, so
-- nothing extra is emitted for them.
--
-- Its width is the columns it swallows PLUS the furniture between them: each join it
-- covers is worth two \tabcolsep and one \arrayrulewidth. The columns are summed from
-- the colspecs rather than taken as "the whole table", because they do not always add
-- up to it -- fitscale shrinks them when they would overflow, and the shares are
-- rounded to four places besides. Sized as the whole table, the merged row came out
-- about 4pt wider than the row beneath it, which with a shaded header reads as the
-- title row and the headings not lining up.
local function spanwidth(colspecs, first, span, ncols, scale)
  local share = 0
  for i = first, first + span - 1 do
    local cs = colspecs[i]
    local w = cs and cs[2]
    share = share + ((w and w > 0) and w or (1 / ncols))
  end
  share = math.floor(share * scale * 10000 + 0.5)
  if share < 1 then share = 1 end
  return string.format('%s*%d/10000+%d\\tabcolsep+%d\\arrayrulewidth\\relax',
                       textwidth(ncols), share, 2 * (span - 1), span - 1)
end

local function row_latex(row, ncols, rule, colspecs, scale)
  local out, n = {}, 0
  for _, cell in ipairs(row.cells) do
    local body = cell_latex(cell)
    local span = cell.col_span or 1
    if span > 1 then
      table.insert(out, string.format(
        '\\multicolumn{%d}{|>{\\raggedright\\arraybackslash}p{%s}|}{%s}',
        span, spanwidth(colspecs, n + 1, span, ncols, scale), body))
    else
      table.insert(out, body)
    end
    n = n + span
  end
  while n < ncols do table.insert(out, ''); n = n + 1 end
  return table.concat(out, ' & ') .. ' \\\\ ' .. (rule or '\\hline')
end

function Table(tbl)
  local ncols = #tbl.colspecs
  local scale = fitscale(tbl.colspecs)
  local specs = {}
  for _, cs in ipairs(tbl.colspecs) do
    table.insert(specs, colspec(cs, ncols, scale))
  end
  -- \toprule and \midrule are emitted as HOOKS, not as rules. The generator hangs
  -- two mechanisms off the rules pandoc puts around a header row, and a
  -- hand-rolled longtable that emits neither turns both off silently:
  --
  --   * \chTblHeadShade redefines \toprule to also emit \rowcolor, which is the
  --     only way colortbl will take a shaded header row -- \rowcolor has to be the
  --     first thing in the row, and a filter cannot put it there.
  --   * the formatting profile's table font sizes travel as \chRowFont, which
  --     \toprule flips to the header size and \midrule back to the body size.
  --
  -- But booktabs must not DRAW here, because it does not share a table with
  -- either vertical rules or colortbl. It puts \aboverulesep/\belowrulesep of
  -- space around each of its rules, which the | rules do not span -- that is the
  -- gap in every vertical line where it meets the header -- and a \rowcolor panel
  -- paints straight over a booktabs rule, which is the header line that goes
  -- missing. Zeroing the four lengths leaves the hooks and takes away the
  -- drawing, so every line in the table is an \hline, drawn by colortbl, which
  -- does co-operate with a coloured row.
  --
  -- Scoped in a group of its own: the lengths are booktabs' own, and the next
  -- table is entitled to find them as it left them.
  local out = {
    '\\begingroup',
    '\\setlength{\\aboverulesep}{0pt}\\setlength{\\belowrulesep}{0pt}',
    '\\setlength{\\heavyrulewidth}{0pt}\\setlength{\\lightrulewidth}{0pt}',
    -- 0.8pt rather than the 0.4pt default, because a colortbl row-colour panel
    -- overlaps the rules bounding its row by about half a rule width. At 0.4pt what
    -- survives is under a device pixel at normal zoom, so a viewer rounds it away
    -- and the header's lines come and go with the zoom level -- while the uncovered
    -- rules elsewhere in the table stay put. At 0.8pt the remaining half is still a
    -- whole pixel. The column widths need no adjustment: they are written in terms
    -- of \arrayrulewidth and are evaluated inside this group.
    '\\setlength{\\arrayrulewidth}{0.8pt}',
    '\\begin{longtable}{|' .. table.concat(specs, '|') .. '|}',
    -- \toprule sits directly against the header row, so the \rowcolor it carries
    -- is the first thing in that row. The visible top border is the \hline above it.
    '\\hline\\toprule'
  }

  -- \toprule carries one \rowcolor and there is only one \toprule, so a table with a
  -- TITLE ROW above its column headings has two header rows and the colour reaches only
  -- the first of them. \chTblHeadRow is the same colour as a row rather than as cells;
  -- the generator defines it empty and \chTblHeadShade turns it on, so emitting it here
  -- is safe whether or not this table asked to be shaded. It goes on every header row
  -- but the first, which \toprule has already coloured -- two \rowcolor in one row is
  -- one too many.
  for i, row in ipairs(tbl.head.rows) do
    local latex = row_latex(row, ncols, i == #tbl.head.rows and '\\midrule\\hline' or nil, tbl.colspecs, scale)
    table.insert(out, i > 1 and ('\\chTblHeadRow ' .. latex) or latex)
  end
  if #tbl.head.rows > 0 then
    table.insert(out, '\\endhead')
  end

  for _, body in ipairs(tbl.bodies) do
    for _, row in ipairs(body.body) do
      table.insert(out, row_latex(row, ncols, nil, tbl.colspecs, scale))
    end
  end
  for _, row in ipairs(tbl.foot.rows) do
    table.insert(out, row_latex(row, ncols, nil, tbl.colspecs, scale))
  end

  table.insert(out, '\\end{longtable}')
  table.insert(out, '\\endgroup')

  local blocks = pandoc.Blocks({pandoc.RawBlock('latex', table.concat(out, '\n'))})
  if tbl.caption and #tbl.caption.long > 0 then
    local cap = pandoc.write(pandoc.Pandoc(tbl.caption.long), 'latex')
    cap = cap:gsub('%s*\n%s*', ' '):gsub('^%s+', ''):gsub('%s+$', '')
    table.insert(blocks, 1,
      pandoc.RawBlock('latex', '\\begin{center}\\textbf{' .. cap .. '}\\end{center}'))
  end
  return blocks
end

-- Replacing the Table element hides it from pandoc's template logic, which
-- would otherwise emit \usepackage{longtable,booktabs,array} -- and it emits
-- that BEFORE any header-includes or -H file, which user preambles may depend
-- on. Setting `tables` restores that line in its original position.
function Pandoc(doc)
  doc.meta['tables'] = true
  return doc
end
