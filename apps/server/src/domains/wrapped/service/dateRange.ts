import type { DateRange, Period } from "../wrapped.types.js"

/**
 * Computes the date window, cache-key, and human label for a wrapped period.
 * Throws when `period === "custom"` and either `from` or `to` is missing.
 */
export function getDateRange(period: Period, from?: string, to?: string): DateRange {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  switch (period) {
    case "wtd": return wtdRange(now, today)
    case "last-week": return lastWeekRange(now)
    case "last-month": return lastMonthRange(now)
    case "last-year": return lastYearRange(now)
    case "custom": return customRange(from, to)
  }
}

function wtdRange(now: Date, today: string): DateRange {
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  return {
    from: monday.toISOString().slice(0, 10),
    to: today,
    periodKey: `wtd-v3-${today}`,
    label: "Week to date",
  }
}

function lastWeekRange(now: Date): DateRange {
  const day = now.getDay()
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() - ((day + 6) % 7))
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const lastSunday = new Date(thisMonday)
  lastSunday.setDate(thisMonday.getDate() - 1)
  const weekNum = getISOWeek(lastMonday)
  return {
    from: lastMonday.toISOString().slice(0, 10),
    to: lastSunday.toISOString().slice(0, 10),
    periodKey: `last-week-v3-${lastMonday.getFullYear()}-W${String(weekNum).padStart(2, "0")}`,
    label: "Last week",
  }
}

function lastMonthRange(now: Date): DateRange {
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
  return {
    from: lastMonth.toISOString().slice(0, 10),
    to: lastDay.toISOString().slice(0, 10),
    periodKey: `last-month-v3-${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`,
    label: "Last month",
  }
}

function lastYearRange(now: Date): DateRange {
  const year = now.getFullYear() - 1
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    periodKey: `last-year-v3-${year}`,
    label: `${year}`,
  }
}

function customRange(from: string | undefined, to: string | undefined): DateRange {
  if (!from || !to) throw new Error("Custom period requires 'from' and 'to' query params")
  return {
    from,
    to,
    periodKey: `custom-v3-${from}-${to}`,
    label: `${from} to ${to}`,
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}
