    function secControls() {
      return h(2, 'Controls') +
        p('A <strong>control</strong> is a requirement your configuration satisfies — an ISM control, an internal hardening standard, anything you need to evidence. ' +
          'Controls exist so a report can answer "what did we do to meet this?".') +
        h(3, 'The catalogue') +
        ul([
          'Add a control with a title, a type and a description. Types are open: the seeded list is ISM, AHG and Custom, and you can add your own.',
          '<strong>Import controls (CSV)</strong> loads many at once. The header must be exactly <code>title,type,description</code>; unknown types are registered automatically.',
          'Edit title and type inline; the row expander holds the description, the device assignment and <strong>Remove control</strong>. Removing a control also strips it from every item that referenced it.'
        ]) +
        h(3, 'Assigning controls to devices') +
        p('The <strong>Device columns</strong> bar above the table gives each ticked device its own column, so you can apply or remove a control ' +
          'for that device with a single click — anywhere in the cell, not just on the small box. Use <strong>All</strong> / <strong>None</strong> to change how many columns are shown; ' +
          'the row expander still offers the same assignment if you prefer it.') +
        p('<strong>Click a device&rsquo;s column heading to do the whole column at once.</strong> It assigns that device to every control the table is currently showing, ' +
          'so when you onboard a new device you can search for the controls it needs and apply them all in one click. If every shown control already has that device, ' +
          'the heading turns green and the same click takes it back off. Like everywhere else, &ldquo;shown&rdquo; means whatever the search box has narrowed the table to.') +
        note('Assigning a control to a device creates that control\'s <strong>Unsatisfied</strong> state on the device (see <em>Devices &amp; groups</em>). Un-assigning removes it.') +
        h(3, 'Tags') +
        p('A control&rsquo;s <strong>type</strong> is one classification; <strong>tags</strong> are a free, multi-valued one, so a control can carry several at once. ' +
          'Use them for whatever cuts across your catalogue — marking the administrative controls you need to track but will never action through this tool, for example.') +
        ul([
          'Click <strong>Apply Tag Mode</strong> in the Tools panel on the right. Type a name and press <strong>Add</strong> to create a tag, then click it in the list to select it.',
          'With a tag selected, a <strong>✓ Tag</strong> column appears — tick a control to give it that tag. The Tools panel stays in place as you scroll, so the selected tag is still there hundreds of controls down.',
          '<strong>Tag all N shown</strong> applies it to every control the table is showing (narrow it with the search box first). If they all have it already, the button flips to <strong>Untag all N shown</strong>.',
          'The search box matches tags as well as title, type and description, so searching a tag name filters the table to the controls carrying it.',
          'Deleting a tag removes it from every control that carries it and changes nothing else about them.'
        ]) +
        h(3, 'Filtering the catalogue') +
        p('The row of dropdowns under the headings filters the table by value — <strong>Type</strong>, <strong>Tags</strong> and <strong>Applies to</strong> — ' +
          'each sitting under the column it filters, exactly as on the data tabs. <code>(untagged)</code> and <code>(unassigned)</code> are real answers: ' +
          'they list the controls carrying no tag, and the controls assigned to no device.') +
        p('They <strong>compose</strong> with each other and with the search box, and everything that acts on &ldquo;what is shown&rdquo; honours them — ' +
          'the device column headings, <strong>Tag all N shown</strong>, the count. An active filter is highlighted, the count says how many filters are on, ' +
          'and <strong>clear</strong> resets them.') +
        h(3, 'Linking controls to items') +
        p('Assignment answers "does this control apply to this device?". <strong>Control Refs</strong> in the data tabs answers "which items satisfy it?". ' +
          'Set refs in a row expander, or attach one control to many items at once with Apply Control Mode.');
    }

    /** RD-1..RD-7 + DOC/FMT/TPL: the document designer. */
    function secDesign() {
      return h(2, 'Report Design') +
        p('The <strong>Reporting</strong> command does not produce a fixed document. What it produces is composed here: which sections appear, ' +
          'in what order, at what heading level, with whatever prose and tables you write yourself, under a formatting profile you control. ' +
          'Open it from the Reporting card on the Generate tab.') +
        p('The section list on the left is the spine of the document and stays visible whatever else you are doing. The panes on the right ' +
          'answer questions about it \u2014 one section, the relevance filter, the formatting, the header and footer, the templates, a live preview, and generation itself.') +
        note('Clicking a section on the left <strong>does not change which pane is showing</strong>. That is what makes the Preview usable for the thing it is best at: clicking down the list and watching the document, without two clicks back each time.') +

        h(3, 'Sections, order and heading levels') +
        ul([
          '<strong>Order</strong> — drag a row, or use ▲/▼. The order is saved <em>with the project</em>, so it survives a reload and travels with the file.',
          '<strong>Include</strong> — untick a row to leave it out of this document. The tick is saved with the project, so a section switched off stays off until you switch it back on.',
          '<strong>&#9776;</strong> — which <strong>columns</strong> the section\u2019s table carries, and for a register that splits by action, which <strong>groups</strong>. On the row rather than in a pane, so they can be changed with the Preview open.',
          '<strong>Level</strong> — the box on each row: <code>T</code> for a title, <code>H1</code> to <code>H4</code>, <code>N</code> for normal text with no heading of its own, or <strong>Auto</strong>.'
        ]) +
        p('<strong>Auto</strong> makes a section a sibling of the last heading above it. That is what produces the nesting: set one section to <code>H1</code> ' +
          'and the <code>H2</code>s after it become its children automatically — you never nominate a parent anywhere. Pin a level whenever you want something different.') +
        p('<code>T</code> is a <strong>title</strong>: a heading printed at the top level that takes no number \u2014 and, the part that matters, gives none away. A document that opens with a title page or an executive summary levelled <code>T</code> still has <code>1</code> on the first <code>H1</code> after it. ' +
          'It has its own row in <strong>Formatting \u2192 Fonts</strong>, so a title can be set larger than an <code>H1</code> without touching the sections.') +
        p('Numbering follows the levels: <code>1</code>, <code>1.1</code>, <code>1.2</code>, <code>1.2.1</code>, <code>2</code>. Only the sections that are actually included are counted, ' +
          'so the list reads exactly as the document will. If you set a level with no level above it — an <code>H3</code> under an <code>H1</code> — it is pulled up one and the row says so; ' +
          'you can switch that off under <strong>Formatting → Fonts</strong> if you would rather it numbered <code>1.0.1</code>, which is what LaTeX would do.') +
        note('A register section that splits by action \u2014 Packages into Removed / Disabled / Kept \u2014 produces one <strong>table</strong> per group, under the one heading. The groups have no headings of their own and their declared names are never printed; what tells the tables apart is the <strong>title row</strong> you write above each of them (see <em>Table wording</em>).') +

        h(3, 'Naming a section, and introducing it') +
        p('Every section — generated or hand-written — carries two separate strings. The <strong>heading</strong> is what the document prints. ' +
          'The <strong>name</strong> is only what the section list here calls it. Leave the name blank and the two are the same thing, which is the usual case.') +
        p('The name earns its keep when the heading is long, or when it changes with how the report is being used: ' +
          '<em>Deviations from ASD Samsung Hardening Guidelines, June 2026</em> is a heading a reader wants and a list entry nobody does. ' +
          'Give it the name <em>Guideline deviations</em> and the list becomes readable without touching the document.') +
        p('A <strong>generated</strong> section has a <strong>Heading in the document</strong> box too, so the wording a register section prints is yours to set \u2014 leave it blank for the standard wording, which is offered as the placeholder. A hand-written section keeps the single <strong>Heading</strong> box it always had.') +
        p('<strong>Introduction</strong> is your own prose, printed between the section\u2019s heading and its table. It takes the same ' +
          '<strong>B</strong> / <strong>I</strong> / <strong>\u2039\u203a</strong> / <strong>\u21b5</strong> buttons \u2014 and the same <strong>\ud83d\udd17 Link</strong> button \u2014 as a hand-written paragraph. A register that splits into groups is introduced ' +
          '<em>once</em>, above the lot, rather than once per group.') +
        p('<strong>Number it</strong> gives the introduction the first of its section\u2019s numbers, and the groups shift down to make room: ' +
          '<em>5 Packages</em>, then <em>5.1</em> the introduction, then the tables. Left unnumbered it is simply the prose under the heading. ' +
          'A section with no introduction consumes no number either way.') +

        h(3, 'What each section offers') +
        p('Selecting any section \u2014 generated or hand-written \u2014 shows a <strong>preview of that section alone</strong>, for the currently selected device, rendered from exactly the same code the document is built from, numbered as it will be numbered. ' +
          'Every section \u2014 generated or hand-written \u2014 also carries three placement switches under <strong>On the page</strong>, and can ask for its tables to be <strong>styled</strong> (see below).') +
        deftable(['Switch', 'What it does'], [
          ['<strong>Centre this section\u2019s content</strong>', 'Centres the body <em>and the heading</em>. That is what makes a title page: add a section, give it the <code>T</code> level and tick this.'],
          ['<strong>Start this section on a new page</strong>', 'A page break ahead of the heading. Distinct from the per-<em>level</em> page break under <strong>Formatting \u2192 Fonts</strong>, which is a house rule about every <code>H1</code>; this is a decision about one section, which is what an annex or a title page needs.'],
          ['<strong>Leave out of the contents list</strong>', 'The section still prints its heading and still keeps its number, so a cross-reference to it still reads correctly \u2014 it is simply not listed. For a title block, a colophon, a signature page.']
        ]) +
        deftable(['Section', 'What it carries, and what you can change'], [
          ['<strong>Device Config Information</strong>', 'The provenance block. Tick individual rows on or off — platform, device, model, firmware, version, generated time, the project hash and one row per capture hash. Useful when a report is going somewhere the SHA-256s mean nothing. The choice is saved with the project and travels in a report template.'],
          ['<strong>The registers</strong>', 'Optional columns, and (where the adapter splits by action) which groups to carry.'],
          ['<strong>Control coverage</strong>', 'Each control, its type, its description, its status on this device, the items satisfying it, and the justification. Every column but the control itself is optional.'],
          ['<strong>Deviations from Security Guidelines</strong>', 'Every item flagged as departing from the guidelines, grouped by register, with its description and the narrative behind it.']
        ]) +
        note('<strong>Deviations from Security Guidelines</strong> appears only when something is actually flagged. A register with nothing flagged is left out of it, and if nothing anywhere is flagged the whole section drops out of the list altogether.') +

        h(3, 'Table wording') +
        p('A generated section says what each of its tables calls itself, under <strong>Table wording</strong>. A register that splits by action gets one block of these per group, so <em>Removed</em>, <em>Kept</em> and <em>Disabled</em> are each named separately.') +
        deftable(['Field', 'What it does'], [
          ['<strong>Title row</strong>', 'A row above the column headings, in the header row\u2019s own type and shading. This is what tells one of a section\u2019s tables from the next now that the groups have no headings \u2014 <em>\u201cPackages removed from the build\u201d</em> says more than <em>\u201cRemoved\u201d</em> ever did.'],
          ['<strong>Caption</strong>', 'The numbered line under the table. Left blank it follows the title row, and failing that the section\u2019s heading \u2014 so naming the title row is usually the only thing you have to do.'],
          ['<strong>Column headings</strong>', 'One box per column the table will actually have. Blank means the wording the register declares. Set per table, because the same column carries different content in each: <em>Package</em> in one, <em>Package removed</em> in the next.']
        ]) +
        note('On the page a title row is a centred line in the header row\u2019s own type, sitting directly on the table, rather than a table row proper \u2014 markdown has no way to say \u201cthis row spans every column\u201d, and the LaTeX that would is written by the converter. A shaded band was tried and cannot work: a table\u2019s width is decided when it is typeset, so the band was wider than the table it belonged to and wider by a different amount for each of a section\u2019s tables. The preview draws the line the page prints.') +

        h(3, 'Writing your own sections') +
        p('<strong>+ Add section</strong> makes an empty one and opens it. A section is a heading plus an ordered stack of blocks, and you can mix them freely:') +
        deftable(['Block', 'What it is'], [
          ['<strong>Paragraph</strong>', 'Free prose. Enter is a line break; a blank line starts a new paragraph. Centre it if you want.'],
          ['<strong>Table</strong>', 'Fill it in cell by cell. Every cell takes the same formatting a paragraph does \u2014 bold, italics, code, line breaks and cross-references \u2014 from the toolbar above the table, which acts on whichever cell you were last writing in. Add and remove rows and columns, set each column\'s alignment and <strong>width</strong>, centre the whole table, style its header row and first column, and give it a caption or tick <strong>No caption</strong>.'],
          ['<strong>Line</strong>', 'A horizontal rule across the page.'],
          ['<strong>Page break</strong>', 'Forces what follows onto a new page.']
        ]) +
        p('Use ▲/▼ or drag to reorder the blocks within a section.') +
        p('<strong>If you leave the heading blank</strong>, the section emits no heading at all: it becomes body text and keeps the level of the section above it, ' +
          'which is the way to add a closing paragraph to a generated section. Pin a level on the left if you want something else.') +

        h(3, 'Formatting the text') +
        p('Every box you write prose in \u2014 a paragraph, a section\u2019s <strong>Introduction</strong>, and every cell of a table you wrote \u2014 has ' +
          '<strong>B</strong>, <strong>I</strong>, <strong>\u2039\u203a</strong> (code) and <strong>\u21b5</strong> (line break) buttons that wrap whatever you have selected, ' +
          'and a <strong>\ud83d\udd17 Link</strong> button beside them. A table has one row of buttons above it, acting on the cell you were last writing in.') +
        p('<strong>The box shows what it holds.</strong> Bold reads as bold, a code span as code, a line break as a line break \u2014 and a cross-reference as ' +
          '<em>the name of the thing it points at</em>, as a small chip, rather than as the marker that will become it. That last one is the point: everything else about a sentence ' +
          'you can check by reading it, and a reference was the one part you could not.') +
        p('A reference chip is not editable, because what it says is worked out when the document is generated \u2014 renumber the document and it renumbers with it. ' +
          'Delete it and the whole reference goes; there is no half of one to leave behind. A reference over <em>your own</em> words is underlined instead and the words stay yours to edit. ' +
          'One that points at something no longer in the document is shown in red, here as well as in the PDF.') +
        p('Behind the box the text is stored as small <code>{{\u2026}}</code> markers rather than as markdown, for a reason worth knowing: the characters markdown uses for emphasis are the same ones that appear ' +
          'inside package names and captured values, so they have to be escaped \u2014 and once they are escaped, typing <code>**bold**</code> would put literal asterisks in your PDF. The buttons sidestep that. ' +
          'A project written by an older build opens here unchanged.') +
        p('Under each box, <strong>Escaped for LaTeX</strong> lists any characters in what you have written that will be escaped in the output — <code>%</code>, <code>&amp;</code>, <code>_</code> and the rest. ' +
          'Nothing is refused and nothing is altered in the project; the line is there so the transformation is visible rather than a surprise in the PDF.') +

        h(3, 'Column widths, captions and table styling') +
        p('<strong>Widths.</strong> Every table takes them \u2014 the ones you write and the generated ones alike. On a table you wrote, drag the right-hand edge of a column heading. ' +
          'On a generated section, the <strong>Column widths</strong> strip in the Section pane stands in for the table (its content comes from the register, so there is nothing to type in) ' +
          'and drags exactly the same way. Both are drawn at the <em>page\u2019s</em> text width, taken from the formatting profile, so what you drag is the shape the PDF gets rather than a ratio you have to imagine.') +
        p('<strong>Or type one.</strong> Double-click a percentage and type a number \u2014 60 for 60%. <strong>Tab</strong> moves to the next column\u2019s box and <strong>Shift+Tab</strong> to the previous, so a row of widths is one pass rather than a double-click each. A column never goes below 5%.') +
        deftable(['Doing this', 'Does this'], [
          ['<strong>Dragging</strong> an edge', 'Moves that boundary. The columns are sharing a fixed total, so one growing means the others give way \u2014 they keep their proportions and the total stays at 100%.'],
          ['<strong>Typing</strong> a percentage', 'Sets that one column and leaves the others exactly where they are. This is how a set can end up totalling more, or less, than 100%.']
        ]) +
        p('A percentage is a share of <strong>the page\u2019s text width</strong>, and the shares need not fill it. Three columns at 20% each make a table 60% of the page, centred \u2014 which is how you get a small table that looks like one instead of three columns of white space. Both editors are drawn to scale, so a set that does not fill the strip visibly does not fill it.') +
        note('<strong>Over</strong> 100% \u2014 a 60% column beside a 50% one \u2014 is flagged in red: the table still renders, capped at full width with the columns scaled to fit, so none ends up the width you typed. <strong>Under</strong> 100% is not a fault; it is the narrower table you asked for, and the note says how wide it will be.') +
        note('Widths are saved with the project, not with the session. <strong>Reset widths</strong> hands the table back to automatic \u2014 which is how every table behaves until you set one.') +
        p('<strong>Automatic</strong> is not "all columns equal". A table narrow enough to fit is left exactly as its content sizes it. One that is not gets laid out, and the columns are measured in <em>typeset width</em> rather than in characters \u2014 an <code>i</code> is a third the width of an <code>m</code>, a monospace package name costs more than prose, and bold costs more again. Three claims are settled in order: a word with nothing to break it comes first (it is what overflows into the next column if it is short-changed), then an identifier that <em>can</em> be broken but should not be minced, then the columns that would simply rather be wider and will wrap if they are not.') +
        note('It is still a rule of thumb \u2014 set the widths yourself when a table has to be exact. The generated <code>.md</code> may also be a good deal wider than the page for such a table; that is deliberate, and only the proportions reach the PDF.') +
        p('<strong>A run with no space in it</strong> \u2014 a package name, a path, a settings key \u2014 cannot be broken by a typesetter unless it is asked for: there is no hyphenation point in <code>io.sdsasolutions.tacticalsettings</code>, and a word that does not fit simply runs past its column into the next one. So a run of 18 characters or more that is shaped like an identifier is written into the document as a <em>code span</em>, which is what makes it breakable \u2014 and, as a side effect, stops it demanding a column wide enough to hold it whole. It is set in monospace as a result, which is the right typography for an identifier and matches what a register\u2019s key column has always done. Ordinary prose is left alone; it wraps at its spaces.') +
        p('<strong>Captions.</strong> Every table in the document is captioned and numbered by default, generated ones included. A hand-written table with no caption of its own ' +
          'takes its section\u2019s heading. The numbering is the same one the PDF prints, which is what lets a link read \u201cTable 4\u201d and be right. ' +
          '<strong>No caption</strong> \u2014 on the table itself, or beside the wording of a generated section\u2019s table \u2014 leaves one out: for a table that names itself in its own title row, or one that is really a layout. ' +
          'An uncaptioned table takes no number either, so the numbers a reader counts stay the numbers a cross-reference names; it cannot then be cross-referenced, which is the trade. ' +
          '<strong>Centre the table caption</strong>, in the Formatting pane, settles a small inconsistency: a caption shorter than its table is centred by the typesetter anyway, one that wraps is not, and the switch centres both.') +
        p('<strong>Columns.</strong> Every generated section says which columns its table carries \u2014 the registers, and <strong>Control coverage</strong> too. ' +
          'The first column is the key and is always there. The width strip follows whatever is ticked, so the widths you set are always against the columns you will actually get. ' +
          'The ticks are <strong>saved with the project</strong> and travel with the file.') +
        note('A few columns ship <strong>off</strong> rather than on, because they are working notes rather than things a signed report leads with: <strong>Rationale</strong> and <strong>Rollback</strong> on the registers, and <strong>Type</strong> and <strong>Items (by dataset)</strong> in Control coverage. Tick any of them and it stays ticked.') +
        p('<strong>Styling.</strong> A table can wear a <strong>shaded header row</strong> and a <strong>shaded first column</strong>. ' +
          'The two halves of that are deliberately separate: <em>what the shading looks like</em> is set once for the whole document in the <strong>Formatting</strong> pane, ' +
          'and <em>which tables wear it</em> is ticked per table \u2014 on the table itself for one you wrote, in the Section pane for a generated register. ' +
          'Change the house colour once and every table that opted in follows.') +
        note('The <em>size, weight and slope</em> of a header row and of a first column are not part of opting in: they are under <strong>Formatting \u2192 Fonts</strong> with every other type setting, and they reach every table. One switch per question \u2014 two places saying \u201cbold\u201d is how a document ends up with two kinds of header.') +

        h(3, 'Empty space, and how to ask for it') +
        p('Space is asked for in <strong>millimetres</strong>, in three places. Line breaks will not do it: however many blank lines you leave, ' +
          'markdown means the same single paragraph break by them, and the typesetter gives that one fixed gap \u2014 which is why a run of breaks ' +
          'only ever came out as one empty line.') +
        deftable(['For', 'Use', 'Where'], [
          ['A gap between paragraphs, or under a table', '<strong>+ Space</strong>', 'The add bar of a hand-written section. It is a part like any other \u2014 drag it, move it, delete it \u2014 and the strip under the box shows the gap at its real size.'],
          ['Somewhere to sign or write', '<strong>Extra row height</strong>', 'Beside <strong>+ Row</strong> and <strong>+ Column</strong> on a table you wrote. A row gets that many millimetres of empty space <em>under</em> its content, so a cell reading \u201cSigned:\u201d keeps its label at the top and the room underneath. Setting a height puts a <strong>tick against every row</strong>, all on \u2014 untick the ones that are a statement of fact rather than somewhere to write.'],
          ['A section that starts partway down the page', '<strong>Start this section \u2026 mm further down the page</strong>', 'The <strong>On the page</strong> box in the Section pane. It works on generated sections as well as hand-written ones.']
        ]) +
        p('The last one is how a <strong>signature page</strong> is composed: tick <strong>Start this section on a new page</strong>, then say how far down it the heading should sit, ' +
          'and put a table with an extra row height under it. The two compose \u2014 a new page, and then the gap on it \u2014 and the gap holds even when the section is the first thing on the page, ' +
          'which is exactly where ordinary space is thrown away.') +
        note('A gap is <em>drawn</em> in the preview at the size it will print, rather than announced. Nothing else in the document moves: the space is empty on the page because it is empty here.') +

        h(3, 'Links') +
        p('<strong>\ud83d\udd17 Link</strong> offers every <strong>section</strong>, every captioned <strong>table</strong> and every <strong>paragraph</strong> in the document. It is on a hand-written paragraph and on a generated section\u2019s <strong>Introduction</strong> alike.') +
        p('<strong>Select text first</strong> and those words become the link \u2014 for a sentence that already reads \u201c\u2026as the packages table shows\u201d. With nothing selected you pick what the link should <em>read</em> as, and each target offers three:') +
        deftable(['Reading', 'What it prints'], [
          ['<strong>Full</strong>', '<em>Table 4: Packages removed</em>, or <em>Section 2.1 \u2014 Firmware</em>.'],
          ['<strong>Number</strong>', '<em>Table 4</em>, or <em>Section 2.1</em> \u2014 for \u201csee Section 2.1\u201d.'],
          ['<strong>Title</strong>', '<em>Packages removed</em> \u2014 the name alone.']
        ]) +
        p('A reference stores nothing but the target\'s internal id. Every visible part of it \u2014 the number and the title both \u2014 is worked out when the document is generated, ' +
          'so <strong>reordering changes the number the link reads and renaming changes the title, and the link itself never breaks</strong>. ' +
          'If you delete the target, the reference renders as a visible <strong>[missing reference]</strong> rather than a silent gap.') +
        p('<strong>Every mention of a control links itself.</strong> Write <em>AHG-001</em> or <em>ISM-1416</em> in any paragraph, introduction, rationale or justification and it becomes a link to that control\u2019s row in <strong>Control coverage</strong> \u2014 you do not insert anything. ' +
          'Nothing is linked if the coverage section is switched off, because a link to a section the document does not carry is a link to nowhere.') +
        note('All of it survives the conversion: a link in the <code>.md</code> becomes a real internal link in the PDF, so a reader can click \u201cTable 4\u201d or a control id and land on it.') +

        h(3, 'The Formatting pane') +
        p('A <strong>formatting profile</strong> is a named set of page and heading choices, saved with the project:') +
        ul([
          '<strong>Page</strong> \u2014 paper size, all four margins, <strong>body font</strong>, line spacing and code shading. Page numbers are not here: they are a <strong>Header &amp; Footer</strong> slot like anything else that prints on every page.',
          '<strong>Fonts</strong> \u2014 whether sections are numbered, whether a skipped level is pulled up, and then every kind of text in the document in one table: the <strong>Title</strong> level and <code>H1</code>\u2013<code>H4</code> with point size, leading, bold, italic, space before and after and whether they start a new page; then <strong>Regular</strong> (the document\u2019s own size, which everything falls back to), <strong>Table text</strong>, <strong>Table headers</strong>, <strong>Table first column</strong> and <strong>Table captions</strong>. Every one of them takes a size <em>and</em> bold and italic; what stays greyed is the leading, the two spacings and the page break, which mean nothing to a run of body text.',
          '<strong>Contents</strong> — whether to include a table of contents, how deep, and how much space sits between one entry and the next. <em>Where</em> it goes is the <strong>Contents</strong> section’s business, in the section list on the left: move it, rename it, or give it a heading level like anything else. Switch the box off here and the section disappears from the list; leave the box on but untick the section and this one report goes out without a contents list.',
          '<strong>Tables</strong> \u2014 where the caption sits and how far from the table, whether it is centred, and the <em>shade</em> a styled header row and first column wear. That is all this pane is for: type is set under <strong>Fonts</strong> with every other type setting, so a header row\u2019s size and weight reach every table, and ticking a section\u2019s header row in buys it the shading and nothing else.'
        ]) +
        note('<strong>No shade</strong> beside a colour well is not the same as picking white \u2014 a colour picker has no \u201cnone\u201d, and white is a colour. Use the button to remove the shading entirely.') +
        h(3, 'Captions, code and the title block') +
        p('<strong>Every table is captioned and numbered</strong> \u2014 <em>\u201cTable 4: Packages removed from the build\u201d</em> \u2014 and the number is the one a cross-reference to that table uses, because both come from the same count. ' +
          'The caption sits <strong>below</strong> the table by default, which is where the preview draws it; <strong>Caption position</strong> moves it above, and <strong>Caption gap</strong> sets the space between the two.') +
        p('<strong>Code shading</strong> paints a background behind a code span \u2014 a package name, a register key, a hash. ' +
          'A run too long for the line it is on is left unshaded instead, because it has to be able to <em>wrap</em>, and a background painted across a line break reads worse than none: ' +
          'a 64-character SHA-256 in a shaded box runs off the page rather than breaking. Short spans shade, long ones wrap, and the typesetter decides which is which by measuring.') +
        p('<strong>Automatic title block</strong> (under <strong>Relevance \u2192 Document</strong>) is <em>off</em>. On, the document opens with a title, the model and firmware, and the date, printed ahead of everything you arranged. ' +
          'Off, it opens with whatever section you put first \u2014 so to make your own title page, add a section, give it the <strong>T</strong> level and centre it. ' +
          'Switching it off loses no provenance: the tool version, device, generated-at and project hash still travel in the file\u2019s metadata and in <strong>Device Config Information</strong>.') +

        p('<strong>Body font</strong> offers ten faces \u2014 seven serif, three sans. Every one of them <em>ships with the TeX distribution</em>, so the <code>.md</code> carries its own font: ' +
          'nothing has to be installed on the machine that builds the PDF, and the document looks the same wherever it is converted. That is why the list is fixed rather than a box you type a font name into \u2014 ' +
          'a name that is not a TeX package is a conversion failure, not a substituted font. Leave it on <strong>Default</strong> and no font is named at all, which gives you pandoc\u2019s own (Latin Modern). ' +
          'The preview picks the closest face your screen has, so a serif choice previews as a serif and a sans as a sans; the shapes will not match the PDF exactly, and the point sizes and column widths will.') +
        p('The shipped <strong>Standard</strong> profile is A4, 25&nbsp;mm margins, 11&nbsp;pt, numbered sections, a page number in the footer\u2019s centre, a contents list three deep, H1 starting a new page, bold table headers, and a pale blue header row with a grey first column for any table that asks for shading. ' +
          'It cannot be edited — <strong>Duplicate</strong> it and change the copy, so every project keeps a known-good baseline to fall back to. Delete the profile in use and the document falls back to Standard rather than breaking.') +

        h(3, 'Templates') +
        deftable(['Kind', 'What it holds'], [
          ['<strong>Section template</strong>', 'One section\'s shape — its heading and every block in it. Save one with <strong>Save as template</strong> in the Section pane; add one with <strong>From template</strong> above the section list.'],
          ['<strong>Formatting profile</strong>', 'The page and heading settings above.'],
          ['<strong>Report template</strong>', 'The whole design: section order, pinned levels, section names, introductions, table wording, table styling, which sections start a page or stay out of the contents, every custom section, and the formatting profile \u2014 header and footer included. Applying one <strong>replaces</strong> the current arrangement, so you are asked first.']
        ]) +
        p('All three can be exported and imported on their own, independently of the project file, from the <strong>Templates</strong> pane.') +
        p('<strong>An import never deletes anything you already have.</strong> Entries whose names do not collide are simply added. Where a name does collide you are asked, one by one, ' +
          'whether to keep yours or take the imported one, with <strong>Keep all mine</strong> and <strong>Replace all</strong> to answer the lot at once. ' +
          'If you say nothing, your copy is kept — silence never overwrites your work.') +

        h(3, 'Preview') +
        p('The <strong>Preview</strong> pane renders the document from the same markdown the Generate button downloads — not a second approximation of it. ' +
          'The outline on the left is clickable. Press <strong>\u21bb Refresh</strong> after a change to rebuild it.') +
        p('It is drawn as a <strong>page</strong>, and the page carries the formatting profile: the paper width and margins, the base font size and line spacing, each heading level\u2019s size, weight and spacing, the table shading colours and the caption alignment. Change any of them in <strong>Formatting</strong> and the preview \u2014 and every per-section preview \u2014 follows, without generating anything. ' +
          'It stays white in dark mode on purpose: the page will be white, and a shade colour judged against a dark background is being judged against the wrong thing.') +
        note('It is an approximation \u2014 a browser is not a typesetter, and line breaks and page breaks will not fall in the same places. What it is faithful about is the <em>content</em> and the <em>proportions</em>: what is in the document, in what order, at what relative size, and how wide each column is.') +
        p('<strong>Pages</strong> lays it out as sheets of paper instead of one continuous column: the paper size and margins from the profile, a page break wherever the document asks for one, and the running <strong>header and footer</strong> on every sheet. Off, it is the continuous view, which is the better one for reading what the document <em>says</em>. ' +
          'Where the breaks fall is the browser\u2019s guess, not the typesetter\u2019s \u2014 use it to see what is on every page, not to count them.') +

        h(3, 'Header &amp; Footer') +
        p('The header and the footer are configured separately, each with a <strong>left</strong>, a <strong>centre</strong> and a <strong>right</strong> slot. Type whatever should print there.') +
        ul([
          'Write <code>#page</code> for the page number and <code>#pages</code> for the total \u2014 <code>Page #page of #pages</code> prints \u201cPage 3 of 12\u201d. Everything else prints as you wrote it, so a header reading \u201cTitle page\u201d stays \u201cTitle page\u201d.',
          '<strong>Give the first page its own header and footer</strong> adds a second set for page one. A title page usually wants neither \u2014 leave every slot empty and it carries nothing.',
          '<strong>OFFICIAL: Sensitive on every page</strong> prints the banner in the first free slot of each, preferring the centre. Fill all three slots of a line yourself and the banner leaves that line alone \u2014 your words win.'
        ]) +
        note('These show in the <strong>Preview</strong> only with <strong>Pages</strong> switched on. A continuous scroll has no page edges to put them against, and drawing a footer halfway down a column of text would be claiming a page boundary that is not there.') +

        h(3, 'Generate') +
        p('The last pane, and the only one that writes a file.') +
        p('<strong>File name</strong> names the <code>.md</code>. Leave it blank for the standard device-and-timestamp name.') +
        p('<strong>Placeholders</strong> is the useful half. Write <code>/[Date]</code> \u2014 a slash, then a name in square brackets \u2014 anywhere you type text: a heading, a section name, an introduction, a paragraph, a table cell, a title row, a column heading, a header or footer slot. ' +
          'Every distinct one is listed here with a box beside it, and what you type replaces <em>every</em> occurrence when you generate. That is what lets one design be issued repeatedly with a new date, a new author or a new reference number.') +
        note('A placeholder left blank is printed as it stands \u2014 <code>/[Date]</code>, visibly \u2014 rather than blanked. An unfinished document should look unfinished; a silent gap reads as complete and is not. The pane counts the ones still to fill in.') +
        note('<strong>Generate .md</strong> is here rather than in the footer, because naming the file and filling in the placeholders are part of generating. The pane also carries the full <strong>pandoc</strong> command that converts it — including the Lua filter, without which every table in the document comes out wrong.');
    }

    function secGenerate() {
      return h(2, 'Generating output') +
        p('Pick a device, then run any of the five commands. Each is independent. The two script bundles produce a <code>.zip</code>; the three documents produce a single <code>.md</code>.') +
        deftable(['Command', 'What you get'], [
          ['<strong>Implementation</strong>', 'A <code>.zip</code>: the scripts and config files that apply your decisions, plus a <code>manifest.json</code> of checksums.'],
          ['<strong>Verification</strong>', 'A <code>.zip</code>: scripts that check a device against your decisions. Options: restrict to selected datasets, only items that deviate from default, and an optional results CSV to fill in.'],
          ['<strong>Reporting</strong>', 'One markdown file, composed in <strong>Report Design</strong>. Convert it to PDF with pandoc.'],
          ['<strong>Control report</strong>', 'One markdown file: each control and the items that satisfy it, optionally including items with no control.'],
          ['<strong>Procedure</strong>', 'One markdown file: the work in the <em>order it is carried out</em>, one step per Custom Security Action plus one for <em>Configure Packages</em> and one for <em>Configure Tactical Settings</em>.']
        ]) +
        note('The three documents used to be Word-targeted HTML in a zip. They are markdown now, and they carry no <code>manifest.json</code> — ' +
          'the provenance it held (tool and version, device, generated-at, project SHA-256) is written into the document\'s own metadata block instead, where a reader of the finished PDF can see it.') +
        h(3, 'Turning a document into a PDF') +
        p('The markdown is written for <strong>pandoc</strong>, and every choice made in Report Design travels with it as a YAML metadata block at the top of the file — paper size, margins, fonts, page numbers, contents and the heading styling. ' +
          'One command; pandoc drives tectonic itself, so there is no second step. Run it in the folder holding both the <code>.md</code> and <code>pdfGenLuaConfig.lua</code>:') +
        pre('pandoc report.md --lua-filter=pdfGenLuaConfig.lua --pdf-engine=tectonic -o report.pdf') +
        p('<strong>The Lua filter is not optional.</strong> Every table in the document is built as a LaTeX <code>longtable</code> through it — without it the shading, the merged title rows, ' +
          'the column widths and the line breaks inside cells are all lost. The same command, with the full text of it and the three things that bite on Windows, is on the ' +
          '<strong>Generate</strong> pane of Report Design, next to the button that writes the file.') +
        p('Verified against <strong>pandoc 3.1.11</strong> and <strong>tectonic 0.15.0</strong>. Tectonic downloads the TeX packages it needs on first run and caches them, ' +
          'so the first build needs network access and takes about a minute; later builds are offline and quick. Any other engine works too — ' +
          '<code>--pdf-engine=xelatex</code> or <code>lualatex</code> — provided <code>titlesec</code>, <code>fancyhdr</code>, <code>setspace</code>, <code>seqsplit</code> and <code>geometry</code> are installed.') +
        p('Characters that are load-bearing in LaTeX — <code>\\ { } $ &amp; # ^ _ ~ %</code> — are escaped on the way into the file, and register keys are written as code spans, which are verbatim. ' +
          'Nothing you type is altered in the project; the escaping happens only in the generated document.') +
        h(3, 'How a captured value is printed') +
        p('A decision value can be a list or a record \u2014 a whitelist of packages, or the whole firewall rule list. In the <strong>documents</strong> those are printed as a reading rather than as JSON: ' +
          'an empty list says <em>(none)</em>, a list of strings gets one entry per line, and a list of records is numbered, one record per line with its fields spelled out. No braces, no quotes, no commas you have to skip over.') +
        note('This is presentation only, and only in the documents a person reads. The <code>tactical.json</code> the device consumes and the verification script both still carry the exact canonical JSON \u2014 they are read by machines, and a reading is not reversible.') +
        h(3, 'Readiness gating') +
        p('The buttons are disabled until the selected device is <strong>ready</strong> — every applicable item decided, counting overrides. ' +
          'The page states what is blocking it, per dataset.') +
        h(3, 'Options') +
        p('Each command has an <strong>Options</strong> panel. Apart from the report’s composition, they are session-only and never written into the project:') +
        ul([
          '<strong>Reporting</strong> — has no dropdown at all. Its <strong>Report Design</strong> button opens a full-screen workspace; see the <strong>Report Design</strong> section of this manual. ' +
            'That is also where <strong>Security Relevance</strong> is filtered — which categories of item the report carries at all. <code>IRRELEVANT</code> is switched off to begin with, so the report stops listing things nobody decided anything about; ' +
            '<code>REPORT</code> is on, because that tag means "not a hardening decision, but say it anyway". A filtered report names the categories you left out and states how many items that cost. ' +
            'What the report is <em>made of</em> — which sections and groups are in, which columns each carries, this relevance filter, the automatic title block and the <strong>classification banner</strong> — is <strong>saved with the project</strong> and travels with the file. ' +
            'Only the document’s <strong>file name</strong> and its <code>/[Tag]</code> values are not: they are answers for one run, which is the point of a tag. ' +
            '<strong>Control coverage lists controls only</strong>: an item referencing no control is by definition something that was left as it was, and listing them all buried the controls the section exists to evidence.',
          '<strong>Implementation</strong> — restrict to certain datasets, or to certain actions within a dataset.',
          '<strong>Verification</strong> — restrict to certain datasets, list only deviations, add the results CSV.',
          '<strong>Control report</strong> — classification header, and whether to include items with no control.',
          '<strong>Procedure</strong> — the running order (see below), and the classification header.'
        ]) +
        h(3, 'The Procedure report and its running order') +
        p('The other four outputs are organised by structure — by dataset, by control, by deviation. None of them answers the question someone standing in front of a device has, ' +
          'which is <em>what do I do first, and what after that</em>. The Procedure report is organised by sequence, and the sequence is yours to set.') +
        p('Open <strong>Options</strong> on the Procedure card. Each step is a row: <strong>drag</strong> it, or use <strong>▲</strong>/<strong>▼</strong>, to put the steps in the order the work is done. ' +
          'The numbers count only the steps that are ticked in, so what the list shows is exactly what the report will say.') +
        ul([
          'Each <strong>Custom Security Action</strong> is its own step, carrying its Action, its <strong>Procedure</strong>, rationale, rollback and controls.',
          '<strong>Configure Packages</strong> and <strong>Configure Tactical Settings</strong> are one step each — the work there is one scripted pass, and 400 packages as 400 steps would bury the manual actions. Each takes an optional note of its own (where to run it from, what to check first).',
          'Untick a step to leave it out of this report; the rest renumber.',
          'The order is saved <strong>in the project</strong>, unlike every other option panel, so it is there next time and it travels with the file. A deleted action drops out of the order by itself, and a new one lands at the end.'
        ]) +
        h(3, 'Running the output') +
        ul([
          'Packages emits a PowerShell script that drives <code>adb</code> from a Windows host. It starts with a how-to-run header and the exact command to use.',
          'Tactical emits <code>tactical.json</code> in the captured format — upload it straight to Knox tactical. There is no script step.',
          '<strong>HighCom network note:</strong> HighCom machines block opening a folder containing <code>.ps1</code> files. Tick <strong>Output scripts as .txt</strong>, move them to a non-HighCom machine, then rename them back to <code>.ps1</code> before running.'
        ]) +
        h(3, 'The manifest') +
        p('Every bundle contains a <code>manifest.json</code> recording the tool version, the device, the generation time, a SHA-256 of each generated file, ' +
          'and the exact decisions used. Two bundles generated from the same project are byte-identical, so you can diff them.');
    }

    function secSaving() {
      return h(2, 'Saving &amp; recovery') +
        h(3, 'Saving') +
        ul([
          '<strong>Save project</strong> asks for a file name and downloads the project <code>.json</code>. That file is the record — store it where your team keeps it.',
          'The dot beside the title in the top bar means there are <strong>unsaved changes</strong>. The browser also warns you before leaving the page with unsaved work.',
          'Saving is deterministic: the file is written in a canonical order, so the same state always produces the same bytes and diffs stay readable.'
        ]) +
        h(3, 'Loading') +
        p('<strong>Load project</strong> validates the file before accepting it. Older project versions are migrated automatically. ' +
          'If the file cannot be accepted, the reasons are listed in the Activity drawer and the current state is left alone. ' +
          'Loading also clears the Undo/Redo history, since that history belongs to the previous project.') +
        h(3, 'Draft autosave') +
        p('While you work, the app keeps a local draft in the browser as <strong>crash insurance only</strong>. It is not the record. ' +
          'If a draft is found when the app opens, a banner offers <strong>Restore draft</strong> or <strong>Discard</strong>. ' +
          'A restored draft counts as unsaved, so save it to make it real. Saving clears the draft.') +
        note('Browser storage can be unavailable when running from a file:// path. If so the app carries on without a draft — which is exactly why the downloaded project file, or a connected folder, is the record. See <strong>Project folder</strong> for saving into a folder automatically.') +
        h(3, 'Other top-bar controls') +
        deftable(['Control', 'Effect'], [
          ['<strong>Export CSV</strong>', 'Downloads the current data tab as shown.'],
          ['<strong>Platform</strong>', 'Switches the active platform profile. The tabs and capture formats follow it.'],
          ['<strong>🌙 Dark / ☀ Light</strong>', 'Switches theme. Display only — it never affects generated output.'],
          ['<strong>Self-tests</strong>', 'Opens the built-in test suite in a new tab.']
        ]);
    }

