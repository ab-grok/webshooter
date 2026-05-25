// Components/Shots.tsx
//refreshingSHots unused

import {
  useMutateDel,
  useMutateHtml,
  useMutateShotBinary,
  useMutateViewed,
  useQueryShots,
} from "@/app/(main)/reactquery";
import { useDownloader } from "@/lib/downloader";
import {
  cursor,
  delShotType,
  file,
  getDownloadCache,
  handleDownload,
  optimisticUnvieweds,
  queryData,
  selectedShot,
  shotData,
  shots,
  siteData,
  timePeriod,
  unviewedType,
} from "@/lib/types";
import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { AnimatePresence, motion, spring, Transition } from "framer-motion";
import SelectedViewer from "./SelectedViewer";
import { preserveScrollType, usePreserveScroll } from "@/lib/usePreserveScroll";
import { delShot, getDbShotKeys, getUnviewedIds } from "@/lib/actions";
import { formatDate } from "@/lib/dateformatter";
import { useQueryClient } from "@tanstack/react-query";
import Gallery from "./Gallery";
import { useErrContext } from "@/app/(main)/ErrContext";
import { cn } from "@/lib/utils";

export async function filterPromise(p: Promise<file | undefined>[]) {
  return (await Promise.all(p)).filter((p) => p != undefined);
}

type state = {
  value: boolean;
  setter: (d: boolean) => void;
};

type ShotsProp = {
  refresh: string; //state var from userSites refreshShots -- why reload sites.
  site: string;
  onAddSite: () => void;
  preserveScroll: preserveScrollType;
  deleteSelectedShots: number;
  downloadTimePeriod: timePeriod;
  downloadUnviewedAfterCurr: handleDownload; //pass 'local' to download local unvieweds else db;
  downloadUnviewedBeforeCurr: handleDownload;
  downloadCurrShotAndAfter: handleDownload; //from navbar; selectedShot must be defined here no need for id
  downloadCurrShotAndBefore: handleDownload;
  selectedShots: selectedShot[];
  downloadSelectedShots: number;
  viewSelectedShots: number;
  onlocalUnviewed: (uv: number[]) => void;
  onSelectedShots: Dispatch<SetStateAction<selectedShot[]>>;
  onAllSitesUnvieweds: ({
    delIds,
    allSitesUnvieweds,
  }: optimisticUnvieweds) => void; //what's this for?
};

function Shots({
  refresh,
  site,
  preserveScroll,
  selectedShots,
  deleteSelectedShots,
  downloadTimePeriod,
  downloadUnviewedAfterCurr,
  downloadUnviewedBeforeCurr,
  downloadCurrShotAndAfter,
  downloadCurrShotAndBefore,
  downloadSelectedShots,
  viewSelectedShots,
  onAddSite,
  onSelectedShots,
  onlocalUnviewed,
  onAllSitesUnvieweds,
}: ShotsProp) {
  // const [siteShots, setSiteShots] = useState<shot[]>();
  const [openedShot, setOpenedShot] = useState<shotData>(); //send setter to gallery>shotCard //used for viewed mod!
  const [prevOpenedShotId, setPrevOpenedShotId] = useState<number>();
  const [delIds, setDelIds] = useState<number[]>();
  const [newShots, setNewShots] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  //hooks
  const { download, openInNewTab } = useDownloader(); //custom downloader
  const { shotBinary, getShotBinary } = useMutateShotBinary(site);
  const { html, getHtml } = useMutateHtml(site);
  const { shotsLoading, shotsError, shots, ...r } = useQueryShots(site);
  const { shotsRefetch, shotsRefetching, fetchNextShots, fetchPrevShots } = r;
  const { mutateDelErr, mutateDel, delReset, mutatingDel } = useMutateDel(site); //setShots deleting
  const { setErrBody } = useErrContext();
  const { swiperRefs } = preserveScroll;

  //siteShots will update when shots is defined; useMemo prevents recomputation on [non shots changed] rerenders
  const siteShots = useMemo(
    () => shots?.pages.flatMap((shots) => shots?.shotsData ?? []),
    [shots],
  );

  //updates localUnviewed used in Navbar
  useEffect(() => {
    if (!siteShots) return;
    console.log("In Shots: useEffect ran");
    const localUnviewed = siteShots?.filter((s) => !s.viewed).map((s) => s.id);
    onlocalUnviewed(localUnviewed!);
  }, [siteShots]);

  //Fetches new shots from db every 1 min; Throws when !rows
  //Should fetch if noMoreShots -- else the user hasn't scrolled to latest;
  useEffect(() => {
    timerRef.current = setInterval(async () => {
      try {
        if (!shots) throw "Shots haven't loaded. Will refetch in next Minute";

        const noMoreNext = shots?.pages?.at(-1)?.noMoreNext;
        if (!noMoreNext) throw "User is behind on stored shots";
        const { error } = await fetchNextShots();
        if (error) throw error;

        setNewShots(Date.now());
        const time = formatDate(Date.now());
        console.log("in Shots.tsx: auto fetch ran fetch on: ", time);
      } catch (e) {
        setNewShots(0);
        console.error("Tried fetching new shots: ", e);
      }
    }, 1000 * 60);

    return () => {
      clearInterval(timerRef.current!); //does this work?
    };
  }, []);

  //tracks ctrl + R for refresh
  useEffect(() => {
    const ctrlR = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() == "r") {
        e.preventDefault();
        refreshShots();
        return;
      }
    };

    if (refresh?.includes(site)) refreshShots(); //random string trigger from parent

    window.addEventListener("keydown", ctrlR);
    return () => window.removeEventListener("keydown", ctrlR);
  }, [refresh]);

  //used in SelectedViewer -- for?
  // const getPrevShot = useCallback(
  //   (id: number) => {
  //     // passed to selectedViewer > ...?
  //     //this render-glitch free?
  //     if (!siteShots) return undefined;

  //     return siteShots.find((s) => s.id == id);
  //   },
  //   [siteShots],
  // );

  const refreshShots = useCallback(async () => {
    try {
      setErrBody({});
      const { error } = await shotsRefetch();
      if (error) throw error;
    } catch (e) {
      console.error("in refreshShots, Problem with refresh: ", e);
      //setError
    }
  }, []);

  //Gets unviewedCount: if filters out shots change from refetch
  //Will update optimistically on viewed since mutateViewed alters shots > siteShots
  //notOpenedShot: the current openedshot is not new; mutatingDel: true while deleting shot; newShots: true after recent shots fetch; shotsLoading: true for init shots fetch;
  useEffect(() => {
    const notOpenedShot = !openedShot || openedShot?.id == prevOpenedShotId;
    if (notOpenedShot && !mutatingDel && !newShots && !shotsLoading) return;

    //optimisically reduces unviewedcount on del; Hoping mutatingDel is true when effect runs from siteShots change;
    if (mutatingDel) {
      onAllSitesUnvieweds({ delIds });
    }

    (async () => {
      try {
        //WIll set to retrieve id[] of count.
        const { error, allSitesUnvieweds } = await getUnviewedIds(); // Main.Page filters for site unvieweds
        if (error || !allSitesUnvieweds) throw error;

        onAllSitesUnvieweds({ allSitesUnvieweds });
        if (openedShot) setPrevOpenedShotId(openedShot?.id);
      } catch (e) {
        // console.error("In Shots getUnviewedIds: ", e);
        //display error?
      }
    })();
  }, [siteShots, shotsLoading, openedShot?.id]);

  //HandleDelShot -- handles del in both gallery and selectedViewer
  const handleDeleteShot = useCallback(async ({ ids }: delShotType) => {
    try {
      ids = Array.isArray(ids) ? ids : [ids];

      setDelIds(ids);
      const { error } = await mutateDel(ids); //optimistically deletes from local then db
      if (error) throw error;
    } catch (e: any) {
      console.error("in handleDeleteShot: ", e);
      //setError -- timeOut
    }
  }, []);

  //effects for download triggers from NavBar or context menu -- create context menu
  useEffect(() => {
    if (!downloadTimePeriod.from) return;
    const { from, to } = downloadTimePeriod;
    handleDownloadTimePeriod({ from, to });
  }, [downloadTimePeriod.from]);

  useEffect(() => {
    //refixing to allow local unviewed download with prop
    if (!downloadUnviewedAfterCurr.unique) return;
    const { local } = downloadCurrShotAndAfter;
    handleDownloadUnviewedAfterCurrent({ local });
  }, [downloadUnviewedAfterCurr.unique]);

  useEffect(() => {
    if (!downloadUnviewedBeforeCurr.unique) return;
    const { local } = downloadCurrShotAndBefore;
    handleDownloadUnviewedBeforeCurrent({ local });
  }, [downloadUnviewedBeforeCurr.unique]);

  useEffect(() => {
    if (!downloadCurrShotAndBefore.unique) return;
    const { local } = downloadCurrShotAndBefore;
    handleDownloadCurrentShotAndBefore({ local });
  }, [downloadCurrShotAndBefore.unique]);

  useEffect(() => {
    if (!downloadCurrShotAndAfter.unique) return;
    const { local } = downloadCurrShotAndAfter;
    handleDownloadCurrentShotAndAfter({ local });
  }, [downloadCurrShotAndAfter.unique]);

  //downloadSelectedShots fn in Gallery

  //downloadCache helper, returns the shotBinary or Html in file format
  const getDownloadCache = useCallback(
    //can I pass this fn as a prop and it calls  useQueryClient() the same way? or perhaps aspects about queryClient go stale?
    async ({ key, date, isHtml }: getDownloadCache) => {
      if (!key || !date) return;
      const queryClient = useQueryClient();
      let cache: any;
      if (!isHtml) cache = queryClient.getQueryData([site, "downloadShots"])!;
      if (isHtml) cache = queryClient.getQueryData([site, "html"]);

      //format 'isShot/user/site_date_time' to 'site date time';
      const fileName = key.split("/").slice(2).join().replace(/_/g, " ");
      const fileType = isHtml ? "text/html" : "image/png";
      let fileData = cache?.[key];

      // is image
      if (!fileData && !isHtml)
        fileData = (await getShotBinary({ shotKey: key })).shotBin;
      // is text
      if (!fileData && isHtml)
        fileData = (await getHtml({ htmlKey: key })).html;

      if (!fileData) throw { message: "FileData not in cache or R2 storage" };
      else return { fileName, fileType, fileData, date };
    },
    [],
  );

  //localUnviewedShots helper: gets the unviewed keys from loaded shots
  const getLocaluvShotKeys = useCallback(
    ({ id, next }: cursor) => {
      if (!siteShots) return;
      const uvShotKeys0 = siteShots?.filter((s) => !s.viewed)!;
      const uvShotKeys1 = uvShotKeys0.filter((u) =>
        next ? u.id > id - 1 : u.id < id + 1,
      ); //+,- for including the current shot;
      const uvShotData = uvShotKeys1.map((u) => ({
        key: u.shotKey,
        date: u.date,
      }));

      return { uvShotData };
    },
    [siteShots],
  );

  const handleDownloadUnviewedAfterCurrent = useCallback(
    async ({ id, local }: handleDownload) => {
      //Gets local shotKeys or dbShotKeyskeys, then retrieves cached binary or gets one from R2bucket;
      //pass id: when invoked in Gallery > ShotCard > context menu;
      //rateLimit?
      try {
        //Normalise id: if not passed, get from selectedShots
        id = id ? id - 1 : selectedShots.at(0)?.id! - 1; // 2ill throw if id undefined

        if (local) {
          //get local unvieweds
          const uvShotData = getLocaluvShotKeys({ id, next: true })?.uvShotData; //this returns {key, date}
          if (!uvShotData) return;

          const uvPromise = uvShotData.map((u) =>
            getDownloadCache({ key: u.key, date: u.date }),
          );

          const uvShots = await filterPromise(uvPromise);

          const { error: e1 } = await download(uvShots as file[]);
          if (e1) throw e1;
        } else {
          //get db unvieweds

          const uvProp = { site, cursor: { id, next: true }, unviewed: true };
          const { error: e2, dShotData } = await getDbShotKeys(uvProp);
          if (e2) throw e2;

          const uvPromise = dShotData.map((d) =>
            getDownloadCache({ key: d.shotKey, date: d.date }),
          );

          const uvShots = await filterPromise(uvPromise);

          const { error: e3 } = await download(uvShots as file[]);
          if (e3) throw e3;
        }
      } catch (e: any) {
        console.error("in handleDownloadUnviewedAfterCurrent: ", e.error);
        //set Error Notification
      }
    },
    [site, selectedShots],
  );

  const handleDownloadUnviewedBeforeCurrent = useCallback(
    async ({ id, local }: handleDownload) => {
      try {
        //Normalise id: passed from context menu (right clicked) or derived from selected shot;
        id = id ? id + 1 : selectedShots.at(-1)?.id! + 1; //will throw if undefined!

        if (local) {
          const uSD = getLocaluvShotKeys({ id, next: false })?.uvShotData;
          if (!uSD) throw "No local unviewed shots!";

          const uvPromise = uSD.map((u) =>
            getDownloadCache({ key: u.key, date: u.date }),
          );
          const uvShots = await filterPromise(uvPromise);
          const { error: e1 } = await download(uvShots as file[]);
          if (e1) throw e1;
        } else {
          const uvProp = { site, cursor: { id, next: false }, unviewed: true };
          const { error: e2, dShotData: dSD } = await getDbShotKeys(uvProp);
          if (e2) throw e2;

          const uvPromise = dSD.map((d) =>
            getDownloadCache({ key: d.shotKey, date: d.date }),
          );

          const uvShots = await filterPromise(uvPromise);

          const { error: e3 } = await download(uvShots as file[]);
          if (e3) throw e3;
        }
      } catch (e) {
        console.error("in handleDownloadUnviewedAfterCurrent: ", e);
        //errBody
      }
    },
    [site, selectedShots],
  );

  //Downloads retrieved unviewd shots -- will need one that seeks db for all unvieweds shots. -- should be done?
  const handleDownloadTimePeriod = useCallback(
    async ({ from, to }: timePeriod) => {
      //can keep operational -- as users, from relogging into the last viewed Id, may want to download from there upwards of the scroll
      try {
        const timeProps = { timePeriod: { from, to }, site };
        const { error: e1, dShotData: dSD } = await getDbShotKeys(timeProps);
        if (e1) throw e1;

        const tPromises = dSD.map((d) =>
          getDownloadCache({ key: d.shotKey, date: d.date }),
        );
        const tShots = await filterPromise(tPromises);
        const { error } = await download(tShots as file[]);
        if (error) throw { error };
      } catch (e) {
        console.error("in handleDownloadTimePeriod: ", e);
      }
    },
    [site],
  );

  const handleDownloadCurrentShotAndAfter = useCallback(
    async ({ id, local }: handleDownload) => {
      //id: defined when passed from Context Menu;
      try {
        id = id ? id - 1 : selectedShots.at(0)?.id! - 1; //will throw if undefined

        //get shotKeys from localShots and then binary data
        if (local) {
          const cSD = siteShots?.filter((s) => s.id > id!)!;
          const cPromise = cSD.map((c) =>
            getDownloadCache({ key: c.shotKey, date: c.date }),
          );
          const cShots = await filterPromise(cPromise);
          const { error: e1 } = await download(cShots as file[]);
          if (e1) throw e1;
        } else {
          //get shotKeys from db and then binary data
          const cProp = { site, cursor: { id, next: true } };
          const { error: e2, dShotData } = await getDbShotKeys(cProp);
          if (e2) throw e2;

          const cPromise = dShotData.map((c) =>
            getDownloadCache({ key: c.shotKey, date: c.date }),
          );
          const cShots = await filterPromise(cPromise);
          const { error: e3 } = await download(cShots as file[]);
          if (e3) throw e3;
        }
      } catch (e) {
        console.error("in downloadCurrentShotsAndAfter: ", JSON.stringify(e));
      }
    },
    [siteShots],
  );

  const handleDownloadCurrentShotAndBefore = useCallback(
    async ({ id, local }: handleDownload) => {
      try {
        id = id ? id + 1 : selectedShots.at(0)?.id! + 1; //will throw if undefined

        //get shotKeys from loadedShots and then binary, else dbShots then binary.
        if (local) {
          const cSD = siteShots?.filter((s) => s.id < id!)!;
          const cPromise = cSD.map((c) =>
            getDownloadCache({ key: c.shotKey, date: c.date }),
          );
          const cShots = await filterPromise(cPromise);
          const { error: e1 } = await download(cShots as file[]);
          if (e1) throw e1;
        } else {
          const cProp = { site, cursor: { id, next: false } };
          const { error: e2, dShotData } = await getDbShotKeys(cProp);
          if (e2) throw e2;

          const cPromise = dShotData.map((c) =>
            getDownloadCache({ key: c.shotKey, date: c.date }),
          );
          const cShots = await filterPromise(cPromise);
          const { error: e3 } = await download(cShots as file[]);
          if (e3) throw e3;
        }
      } catch (e) {
        const e0 = "in downloadCurrentShotAndBefore: ";
        console.error(e0, JSON.stringify(e));
      }
    },
    [siteShots],
  );

  // Log error from shotsError
  useEffect(() => {
    if (!shotsError) return;

    const e = { label: "Shots Error", msg: shotsError.error };
    setErrBody({ ...e, fn: shotsRefetch, fnName: "reFetch" });
  }, [shotsError]);

  useEffect(() => {
    if (!mutateDelErr) return;
    console.log("in Shots: Error trying to del multiShots!", mutateDelErr);
    setErrBody({ label: "Delete Shots Error!", msg: mutateDelErr.error });
  }, [mutateDelErr]);

  const timing: Transition = { type: "spring", damping: 10, stiffness: 80 };

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-white lg:flex-row">
      {/* CHANGE to skeleton in gallery */}
      {/* {(shotsLoading || shotsRefetching) &&
        !siteShots?.length && ( //will not work for shotsRefetching as siteShots is defined -- good
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="text-primary h-8 w-8 animate-spin" />
              <p className="text-muted-foreground font-black">
                Loading Shots...
              </p>
            </div>
          </div>
        )} */}

      {/* DEL: Handling error in err dialog now */}
      {/* {shotsError && !shotsLoading && !shotsRefetching && (
        <div className="flex flex-1 items-center justify-center p-8">
          <Alert
            variant="destructive"
            className="border-destructive/50 bg-destructive/10 max-w-md"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-col gap-3">
              <span>{shotsError.error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshShots}
                className="w-fit gap-2 bg-transparent"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )} */}

      {/* Del -- no shots for site, do not need to set cron. */}
      {/* {!shotsLoading && !shotsError && !siteShots?.length && (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold">No shots here</h2>
            <p className="text-muted-foreground mt-2">Schedule one?</p>
            <Button className="mt-4" onClick={onAddSite}>
              Set Cron
            </Button>
          </div>
        </div>
      )} */}

      {/* Content Layout -- removed siteShots check, so can show skeleton if !siteShots */}
      {/* Mobile: Stacked Layout */}
      <motion.div layout className="flex flex-col lg:hidden">
        {/* Selected Viewer - Top Half on Mobile */}
        <AnimatePresence>
          {openedShot && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ ...timing, duration: 0.5 }}
              layout
              className="border-border/50 h-[50vh] border-b p-4"
            >
              <SelectedViewer
                shot={openedShot}
                onClose={() => setOpenedShot(undefined)}
                getDownloadCache={getDownloadCache}
                onDelete={handleDeleteShot}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gallery - Bottom Half on Mobile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...timing, duration: 0.5 }}
          className="min-h-0 flex-1 p-4"
        >
          <Gallery
            siteShots={siteShots}
            site={site || ""}
            openedShot={openedShot}
            onOpenedShot={setOpenedShot}
            onDeleteShot={handleDeleteShot}
            preserveScroll={preserveScroll}
            delSelectedShots={deleteSelectedShots}
            downloadSelectedShots={downloadSelectedShots}
            viewSelectedShots={viewSelectedShots}
            selectedShots={selectedShots}
            onSelectedShots={onSelectedShots}
            getDownloadCache={getDownloadCache}
          />
        </motion.div>
      </motion.div>

      {/* Desktop: Side by Side Layout */}
      <motion.div
        id="Section Container"
        layout
        transition={{ ...timing, duration: 0.5 }}
        className="hidden flex-1 lg:flex"
      >
        {/* Gallery -- Centralise until openedShot , then reveal selectedViewer  */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          layout
          className={cn(
            "border-border/50 bg-background p-6",
            openedShot ? "border-r lg:w-[55%] lg:flex-none" : "flex-1",
          )}
        >
          <Gallery
            //Modifying Layout: use openedshot as trigger for how many slides are rendered -- can still be same amount.
            //But not so for mobile, which is still the same ammount of slides, just centered instead of to the top.
            siteShots={siteShots}
            site={site}
            openedShot={openedShot}
            onOpenedShot={setOpenedShot}
            preserveScroll={preserveScroll}
            onDeleteShot={handleDeleteShot}
            delSelectedShots={deleteSelectedShots}
            downloadSelectedShots={downloadSelectedShots}
            viewSelectedShots={viewSelectedShots}
            selectedShots={selectedShots}
            onSelectedShots={onSelectedShots}
            getDownloadCache={getDownloadCache}
          />
        </motion.div>

        {/* Selected Viewer - Right Column */}
        <AnimatePresence>
          {openedShot && (
            <motion.div
              id="SelectedViewer Container"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ ...timing, duration: 0.5 }}
              layout
              className="w-[45%] p-6"
            >
              <SelectedViewer
                shot={openedShot}
                onClose={() => setOpenedShot(undefined)}
                getDownloadCache={getDownloadCache}
                onDelete={handleDeleteShot}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  );
}

export default React.memo(Shots);
