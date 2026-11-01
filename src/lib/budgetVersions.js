// A budget version pushed from a change order holds only that change order's
// lines, so it is never "the budget". Every read of the newest budget skips
// these; asking for one by version number still works. No database in this
// file, the budget editor imports it.
const CO_MARK = '"source":"change_order"';

export const NOT_CO_VERSION = {
  OR: [{ changeSummary: null }, { NOT: { changeSummary: { contains: CO_MARK } } }],
};

export const isCoVersion = (matrix) => !!matrix?.changeSummary?.includes(CO_MARK);
