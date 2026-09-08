    App.docStore = {
      nextId: nextId, blankPart: blankPart,
      // RPT-3: the section order. It lived on App.store, which meant the module
      // reached into the host to reorder its own document.
      setReportOrder: setReportOrder,
      setBlockLevel: setBlockLevel, setBlockCentre: setBlockCentre, setMetaField: setMetaField,
      // SEC-4: per-section placement — centring, a page of its own, out of the contents.
      setBlockFlag: setBlockFlag,
      // SPC-1: …and how far down the page its heading starts.
      setBlockSpace: setBlockSpace, mmValue: mmValue,
      DEFAULT_SPACE_MM: DEFAULT_SPACE_MM, MAX_SPACE_MM: MAX_SPACE_MM,
      setTitleBlock: setTitleBlock,
      // CLS-1: the classification banner, which is a document decision, not a per-run one.
      setClassification: setClassification,
      // NAM-1 / SEC-1 / TBS-1: a section's name, its introduction, its table styling.
      setBlockName: setBlockName, setBlockHeading: setBlockHeading, setBlockIntro: setBlockIntro,
      setBlockIntroNumbered: setBlockIntroNumbered, setBlockTableStyle: setBlockTableStyle,
      // TBL-1: a generated table's own title row, caption and column headings.
      setTableText: setTableText, setTableColumnLabel: setTableColumnLabel, ONE_TABLE: '_all',
      setTableNoCaption: setTableNoCaption,
      // OPT-2: what the report is made of, stored with the report rather than the session.
      setReportInclude: setReportInclude, INCLUDE_MAPS: INCLUDE_MAPS,
      addSection: addSection, updateSection: updateSection, removeSection: removeSection,
      addPart: addPart, updatePart: updatePart, removePart: removePart, movePart: movePart,
      setCell: setCell, addRow: addRow, removeRow: removeRow,
      // SPC-1: which rows take the table's extra height.
      setRowTall: setRowTall, rowTall: rowTall,
      addColumn: addColumn, removeColumn: removeColumn, setAlign: setAlign,
      // TW-1/TW-2: per-column widths, dragged or typed, on authored and generated tables.
      setWidth: setWidth, clearWidths: clearWidths, renormalise: renormalise,
      setBlockWidth: setBlockWidth, clearBlockWidths: clearBlockWidths,
      applyWidth: applyWidth, evenWidths: evenWidths, widthTotal: widthTotal, MIN_WIDTH: MIN_WIDTH,
      addFormat: addFormat, updateFormat: updateFormat, removeFormat: removeFormat, setFormatId: setFormatId,
      saveSectionTemplate: saveSectionTemplate, removeSectionTemplate: removeSectionTemplate,
      useSectionTemplate: useSectionTemplate,
      saveReportTemplate: saveReportTemplate, removeReportTemplate: removeReportTemplate,
      useReportTemplate: useReportTemplate
    };
  })(App);
