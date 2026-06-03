import { safeCron } from "./utils";

export function formatDate(date: number | string | Date): string {
  try {
    date = isDate(date) ? date : new Date(date);
    return new Intl.DateTimeFormat("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    })
      .format(date)
      .replace(/\//g, "-");
  } catch {
    return "Null date";
  }
}

export function formatRelativeTime(date: string | Date): string {
  try {
    date = isDate(date) ? date : new Date(date);

    const miliDiff = new Date().getTime() - date.getTime();
    const secDiff = Math.floor(miliDiff / 1000);
    const minDiff = Math.floor(secDiff / 60);
    const hourDiff = Math.floor(minDiff / 60);
    const dayDiff = Math.floor(hourDiff / 24);
    const monthDiff = Math.floor(dayDiff / 30);
    const yearDiff = Math.floor(dayDiff / 365);

    if (yearDiff >= 1) return `${yearDiff} year(s) ago`;
    if (monthDiff >= 1) return `${monthDiff} months(s) ago`;
    if (dayDiff >= 1) return `${dayDiff} day(s) ago`;
    if (hourDiff >= 1) return `${hourDiff} hour(s) ago`;
    if (minDiff >= 1) return `${minDiff} min(s) ago`;
    if (secDiff >= 1) return `${secDiff} sec(s) ago`;

    return "just now";
  } catch {
    return "Null date";
  }
}

export function truncateHtml(
  html: string | undefined | null,
  maxLength = 150,
): string {
  if (!html) return "";
  // Strip HTML tags for preview
  const textContent = html.replace(/<[^>]*>/g, "").trim();
  if (textContent.length <= maxLength) return textContent;
  return `${textContent.slice(0, maxLength)}...`;
}

export function isDate(date: any): date is Date {
  return date instanceof Date && !isNaN(date.valueOf());
}

export function cronToText(cron: string) {
  //transforms crons into text. By iterating over the cron fields appending fillers like "from", "every" depending on field format
  if (!safeCron(cron)) return { error: "Invalid Cron" };

  const [mm, hh, DD, MM, WW] = cron.trim().split(/\s+/);
  const mmText = cronFieldText(mm, "minute");
  const hhText = cronFieldText(hh, "hour");
  const DDText = cronFieldText(DD, "day");
  const MMText = cronFieldText(MM, "months");
  const WWText = cronFieldText(WW, "weekday");

  const parts = [mmText, hhText, DDText, WWText, MMText];
  // const text = parts.join(" - ");
  const text = parts.join(" - ");
  return text;
}

function cronFieldText(cronField: string, timeUnit: string) {
  //an earlier version of this had all now `match` method as `includes` methods -- I don't forsee any problems here?
  //Non list calls (from top level cf): get `Of` prepended before cfText with `every` -- indicated by list
  // i: is mainly for listString -- index of list items;

  //always i==0 (first in field); minute field begins the Cron text with Every`
  function starString(field: string) {
    if (field != "*") return "";
    return `${timeUnit == "minute" ? "Every" : "Of every"} ${timeUnit}`;
  }

  //numbers | mon, fri | jan, dec
  //pass i == 0 when called outside list -- will only append `On timeunit` then; else is in a list and the time unit is defines in i==0;
  function dString(field: string, i: number, list?: string) {
    if (isNaN(Number(field))) return "";
    return `${i == 0 || !list ? `On ${timeUnit}` : ""} ${timeSpan(timeUnit, field)}`;
  }

  //returns "d" | "d to d" | "jan to feb" | "sun to mon"
  //d d/d d-d
  //pass i
  function rangeString(field: string, i: number, list?: string) {
    if (!field.includes("-")) return "";
    return `${i == 0 || !list ? `From ${timeUnit}s` : ""} ${timeSpan(timeUnit, field.split("-"))}`;
  }

  //a cronField can have only one step even in a list -- mmost likely the last item
  //for non list calls: pass i==0 -- gets the Of preposition then;
  function stepString(field: string, i: number, list?: string) {
    if (!field.includes("/")) return "";

    const [base, step] = field.split("/");

    //prepend 'Every' when step starts the list field; `and every` when it ends the list field; `every` when called outside .
    let prefix =
      timeUnit == "minute" && !list //when is minute field and not called from listString;
        ? "Every"
        : i == 0 //When is first in non minute fields (including lists)
          ? "Of every"
          : i == 4 //when is last in list
            ? "and every"
            : "every"; //when in middle of list
    const suffix = base != "*" ? `starting ${timeSpan(timeUnit, base)}` : "";
    const s = Number(step) > 1 ? "s" : "";
    return `${prefix} ${step} ${timeUnit}${s} ${suffix}`;
  }

  //list is top level classifier, can contain d+, range, step,
  //Functions(field) already append necessary prepositions.
  function listString(field: string) {
    if (!field.includes(",")) return "";

    const listStrings = [];
    const listItems = field.split(/,/);

    for (const [i, item] of listItems.entries()) {
      listStrings.push(
        dString(field, i, "list") ||
          stepString(field, i, "list") ||
          rangeString(field, i, "list"),
      );
    }

    //joins list items with 'and' prefixed to the last element
    const firstParts = listStrings.slice(0, -1).join(", ");
    return `${firstParts} and ${listStrings.at(-1)}`;
  }

  //n here is used for the first field, different from i used in listString (which numerates list items)
  let field: string;
  field = listString(cronField);
  field = !field ? rangeString(cronField, 0) : "";
  field = !field ? stepString(cronField, 0) : "";
  field = !field ? dString(cronField, 0) : "";
  field = !field ? starString(cronField) : "";

  return field;
}

//timeUnit accounts for weekDays (1-7) and months (1-12), then returns the number for all others -- can be better.
//d expects [d].length==2 or d; d is a stringified number from regex parsing
function timeSpan(timeUnit: string, d: string | string[]) {
  const timeValue = [];
  const dArr: any[] = Array.isArray(d) ? d : [d];

  for (let d of dArr) {
    d = Number(d);
    if (timeUnit == "weekday") timeValue.push(weekDays[d]);
    else if (timeUnit == "months") timeValue.push(months[d]);
    else timeValue.push(d);
  }

  const l2 = timeValue.length == 2;
  return l2 ? `${timeValue.join(" to ")}` : `${timeValue[0]}`;
}

export const weekDays: string[] = [
  "",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const months: string[] = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
