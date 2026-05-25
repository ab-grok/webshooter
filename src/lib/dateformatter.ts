import { safeCron } from "./server";

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
    if (monthDiff >= 1) return `${monthDiff} month(s) ago`;
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

export async function cronToText(cron: string) {
  try {
    //transforms crons into text. By iterating over the cron fields appending fillers like "from", "every" depending on field format
    const sC = await safeCron(cron);
    if (!sC) return { error: "Invalid cron" };
    const [mm, hh, DD, MM, WW] = sC.trim().split(/\s+/);
    const mmText = cronFieldText(mm, "minute");
    const hhText = cronFieldText(hh, "hour");
    const DDText = cronFieldText(DD, "day");
    const MMText = cronFieldText(MM, "month");
    const WWText = cronFieldText(WW, "weekday");

    const parts = [mmText, hhText, DDText, WWText, MMText];
    // const text = parts.join(" - ");
    const text = parts.join(" ");
    return text;
  } catch (e) {
    console.error("Error in cronToText: ", e);
    return "";
  }

  async function cronFieldText(cronField: string, timeUnit: string) {
    //an earlier version of this had all now `match` method as `includes` methods -- I don't forsee any problems here?
    if (cronField?.includes("/")) {
      const [base, step] = cronField.split("/");

      switch (true) {
        //every
        case base == "*":
          return `every ${step} ${timeUnit}s `;

        //list or ranged list
        case base?.includes(","):
          let dArr: string[] = []; //[from mon to tue, wed to thur, on fri, from d, d]
          cronField.split(",").forEach((d, i) => {
            if (d?.includes("-")) {
              const tSpan = timeSpan(timeUnit, d.split("-"));
              dArr.push(`${i == 0 ? "from " : ""}` + `${tSpan}`);
            } else
              dArr.push(`${i == 0 ? "on " : ""}` + `${timeSpan(timeUnit, d)}`);
          });

          const moreD = dArr.length > 1;

          return `every ${step} ${timeUnit}s ${
            moreD
              ? `${dArr.slice(0, -1).join(", ")}, and ${dArr.at(-1)}`
              : `${dArr.toString()}`
          } `;

        //span
        case base?.includes("-"):
          const tSpan = timeSpan(timeUnit, base.split("-"));
          return `every ${step} ${timeUnit}s from ${tSpan}`;

        default:
          return `every ${step} ${timeUnit}s starting ${timeSpan(
            timeUnit,
            base,
          )}`;
      }
    } else if (cronField?.includes(",")) {
      const dArr: string[] = [];
      cronField.split(",").forEach((d, i) => {
        if (d?.includes("-")) {
          //without 'from' append, you've got "monday to thursday" != from "monday to thursday"
          dArr.push(timeSpan(timeUnit, d.split("-")));
        } else dArr.push(timeSpan(timeUnit, d));
      });

      const s = dArr.length > 1 ? "s" : "";
      const tSpan = s
        ? `${dArr.slice(0, -1).join(", ")}, and ${dArr.at(-1)}`
        : dArr.toString();

      return `on ${timeUnit}${s} ${tSpan}`;
    } else if (cronField?.includes("-")) {
      const tU =
        timeUnit == "month" || timeUnit == "weekday" ? "" : ` ${timeUnit}`;
      return `from${tU} ${timeSpan(timeUnit, cronField.split("-"))}`;
    } else if (cronField == "*") return `every ${timeUnit}`;
    else if (!isNaN(Number(cronField))) {
      const tU =
        timeUnit == "month" || timeUnit == "weekday" ? "" : ` ${timeUnit}`;
      return `on${tU} ${timeSpan(timeUnit, cronField)}`;
    }
    return `on ${timeUnit} ${cronField}`;
  }
}

//timeUnit accounts for weekDay (0-6) and month (1-12), then returns the number for all others -- can be better.
//d is a stringified number from regex parsing
function timeSpan(timeUnit: string, d: string | string[]) {
  //timeD: [time, d];
  const t = [];
  const dArr: string[] = Array.isArray(d) ? d : [d];
  for (const d of dArr) {
    if (timeUnit == "weekday") t.push(timeText({ WW: d }));
    else if (timeUnit == "month") t.push(timeText({ MM: d }));
    else t.push(d);
  }

  const l2 = t.length == 2;
  return l2 ? `${t.join(" to ")}` : `${t[0]}`;

  function timeText({ WW, MM }: { WW?: string; MM?: string }) {
    const weekDay: Record<string, string> = {
      "0": "sunday",
      "1": "monday",
      "2": "tuesday",
      "3": "wednesday",
      "4": "thursday",
      "5": "friday",
      "6": "saturday",
    };

    const month: Record<string, string> = {
      "1": "jan",
      "2": "feb",
      "3": "mar",
      "4": "apr",
      "5": "may",
      "6": "jun",
      "7": "jul",
      "8": "aug",
      "9": "sep",
      "10": "oct",
      "11": "nov",
      "12": "dec",
    };

    if (WW) return weekDay[WW] || WW;
    if (MM) return month[MM] || MM;
  }
}
