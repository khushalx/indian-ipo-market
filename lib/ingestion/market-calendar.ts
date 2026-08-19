export type ExchangeCalendar = {
  isHoliday(date: string): boolean;
};

export const emptyExchangeCalendar: ExchangeCalendar = {
  isHoliday: () => false,
};

export function istDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isWeekday(date = new Date()): boolean {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(date);
  return day !== "Sat" && day !== "Sun";
}

export function isMarketDay(date = new Date(), calendar: ExchangeCalendar = emptyExchangeCalendar): boolean {
  return isWeekday(date) && !calendar.isHoliday(istDateKey(date));
}

export function isRegularMarketHours(date = new Date(), calendar: ExchangeCalendar = emptyExchangeCalendar): boolean {
  if (!isMarketDay(date, calendar)) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const total = hour * 60 + minute;
  return total >= 9 * 60 + 15 && total <= 15 * 60 + 30;
}
