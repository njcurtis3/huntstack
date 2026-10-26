// How old a refuge count can be and still describe what the birds are doing now.
// Weekly and biweekly surveys go stale in three weeks; the LDWF aerial survey is monthly, so it
// gets a window that spans one missed cycle. Annual rows (midwinter, MWI) are historical context
// and never pass. Used by hunt recommendations so last season's counts can't rank as current.
export const FRESH_DAYS = 21
export const FRESH_DAYS_MONTHLY = 45
