import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// -------------> helper functions
export function safeSite(site: string, noDots?: string) {
  try {
    site = site?.trim();
    if (!site) throw { error: "Missing parameters!" };
    if (!site.startsWith("http")) site = "https://" + site;

    const s = new URL(site);
    if (!s) throw { error: "Couldn't parse URL" };
    const domain = s.hostname.replace("www.", "");
    const pathname = s.pathname.replace(/\/$/, "");

    if (!domain.match(/(\.[a-z]{2,})$/)) throw { error: "Invalid Site" };

    let ss = domain + pathname;

    if (noDots) ss = ss.replace(/[^a-z0-9_]/gi, "_");
    const isNoDot = noDots ? "NoDots " : "";
    console.log(`in safeSite. ${isNoDot}site after http removed: ${ss}`);
    return ss;
  } catch (e) {
    console.error("Safesite error: ", e);
    return null;
  }
}

export function safeCron(cron: string) {
  try {
    function timeRange(val: number, unit: number) {
      const startingVal = unit == 12 || unit == 7 || unit == 31 ? 1 : 0;
      return val >= startingVal && val <= unit;
    }

    function validateCronField(cF: string, unit: number) {
      // *(/d)? | d(-d)? (,d/d)? ,d(-d)* (,d/d)?;
      if (
        !/^((\*|\d+)(\/\d+)?|\d+(-\d+)?(,(\d+(-\d+)?))*(,\d+\/\d+)?)$/.test(cF)
      )
        throw { error: `Invalid cron field: ${cF} ` };

      //Multi levels cause lists `,` can contain `/-`;
      const cFLevel1 = cF.split(/[,/-]/); //handles riange `-`, and step `/`, but cF mmay be list.
      const cFLevel2 = cFLevel1.flatMap((cF) => cF.split(/[/-]/)); //handles range, step in list.
      const cFDigits = cFLevel2.filter((f) => f != "*" && f != ""); //removes *

      return cFDigits.every((f) => timeRange(Number(f), unit)); //checks the digit that it's within timeUnit bounds;
    }

    const units = [59, 23, 31, 12, 7];

    const cronFields = cron.split(/\s+/);
    if (cronFields.length != 5) throw "Incomplete cron!";

    cronFields.forEach((c, i) => validateCronField(c, units[i])); //throws if a field is invalid, true??

    return cron;
  } catch (e) {
    console.error("Safecron error: ", e);
    return "";
  }
}

export function safeRange(range: { start: number; end: number }) {
  if (!(isNaN(range?.start) || isNaN(range?.end))) return range;
}
