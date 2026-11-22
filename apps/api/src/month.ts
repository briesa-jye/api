export const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);

/** Today's date in Australia/Sydney as YYYY-MM-DD (rules are evaluated on the Australian calendar date). */
export const todayAU = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
