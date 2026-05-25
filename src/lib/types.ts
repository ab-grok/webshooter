export type shotData = {
  id: number;
  date: string; //sql timestamptz
  viewed: boolean;
  htmlKey: string; //may be problematic sending key, can switch to hash.
  shotKey: string;
  shotUrl: string;
};

export type downloadProps = {
  cursor?: cursor;
  timePeriod?: timePeriod;
  unviewed?: boolean;
};

export type cursor = { id: number; next?: boolean };

export type timePeriod = { from: Date; to?: Date };

export type userData = {
  user?: string;
  joined?: string;
  isAdmin?: number;
  maxCrons?: number | undefined;
  activeSites?: shotData[] | undefined;
  userSites?: shotData[] | undefined;
};

export type handleDownload = {
  id?: number; //Needed from context menu; not needed from navbar,
  local?: boolean;
  unique?: number; // Date.now() which will trigger fresh downloads from navbar
};

export type getDownloadCache = { key: string; isHtml?: boolean; date: string };
export type dCacheReturn = Promise<file | undefined>;

export type multiShots = {
  site: string;
  shots: shots[];
};

export type file = {
  date?: string | Date; //date is not defined when used in getShots
  fileName: string;
  fileData: Uint8Array | string;
  fileType: string;
};

export type deletionAttempt = {
  due: Date;
  message: string;
};

export type shots = {
  shotsData: shotData[];
  nextCursor: number;
  prevCursor: number;
  noMoreNext: boolean;
  noMorePrev: boolean;
  // error: string;
};

export type siteData = {
  cron: string;
  site: string;
  range?: { start: number; end: number };
  active: boolean;
};

export type unviewedType = {
  site: string;
  unvieweds: number[];
};

export type handleViewed = {
  id?: number;
  viewSelectedShots?: boolean;
};

export type optimisticUnvieweds = {
  delIds?: number[]; //deleted shot ids
  allSitesUnvieweds?: unviewedType[];
};

export type selectedShot = {
  id?: number;
  swiperId?: number;
  single?: boolean; // clear other selected shots
};

export type delShotType = {
  ids: number | number[];
  site?: string;
};

export type range = { start: number; end: number } | null;

export type userSites = {
  sites: siteData;
}[];

export type queryData = {
  pages: shots[];
  pageParam: { id: number; next: boolean };
};
