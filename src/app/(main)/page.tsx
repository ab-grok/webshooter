// app/(main)/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  handleDownload,
  optimisticUnvieweds,
  selectedShot,
  siteData,
  timePeriod,
  unviewedType,
} from "@/lib/types";
import { useQuerySites, useUserData } from "./reactquery";
import Shots from "@/components/Shots";
import { usePreserveScroll } from "@/lib/usePreserveScroll";
import Navbar from "@/components/Navbar";

export default function HomePage() {
  const [selectedSite, setSelectedSite] = useState<siteData>(); //unlogged users have no sites, if selectedSite = undefined set to visitor site/cnn.com; account for site active state
  const [refreshingSites, setRefreshingSites] = useState<string>(); //when manual loading getShots

  //States are triggered using Math.random()
  const [selectedShots, setSelectedShots] = useState([] as selectedShot[]); //moved from gallery -- will use in navbar for disable "download selected shots" button and also for download selectedShots
  const [deleteSelectedShots, setDeleteSelectedShots] = useState(0);
  const [viewSelectedShots, setViewSelectedShots] = useState(0);
  const [downloadSelectedShots, setDownloadSelectedShots] = useState(0); //pass keys to mutateDownload
  const [downloadCurrShotAndBefore, setDownloadCurrShotAndBefore] = useState(
    {} as handleDownload,
  );
  const [downloadCurrShotAndAfter, setDownloadCurrShotAndAfter] = useState(
    {} as handleDownload,
  );
  const [downloadUnviewedAfterCurr, setDownloadUnviewedAfterCurr] = useState(
    {} as handleDownload,
  );
  const [downloadUnviewedBeforeCurr, setDownloadUnviewedBeforeCurr] = useState(
    {} as handleDownload,
  );
  const [downloadTimePeriod, setDownloadTimePeriod] = useState(
    {} as timePeriod,
  );

  const { userData, userDataError, userDataLoading } = useUserData(); //when !userData these dont work: delete*, viewSelectedShots, handleAddSite
  // const [userData, setUserData] = useState<userData>(); //will serve as logged indicator and display user info: create type
  const preserveScroll = usePreserveScroll(); // passed down to shots>gallery
  const { sitesLoading, sitesError, sitesRefetch, sites } = useQuerySites(); //sitesRefetch => {data, error, isError, isSuccess}

  //stores db unvieweds for all sites. Is altered in Shots.tsx when shot is viewed or deleted -- no need for local but still can count local unvieweds and expose on dlLocalUnviewed
  const [allSitesUnvieweds, setAllSitesUnvieweds] = useState(
    [] as unviewedType[],
  );
  const [localUnviewed, setlocalUnviewed] = useState<number[]>(); //shotIds[]

  const currId = useMemo(() => {
    if (!selectedShots) return { first: 0, last: 0 };
    //get from selectedShot. will be the first and last selected (for including middle shots in the calc)
    const first = selectedShots[0]?.id;
    const last = selectedShots.at(-1)?.id;

    return { first, last };
  }, [selectedShots]);

  // called in shots change effect
  const handleAllSitesUnvieweds = useCallback(
    ({ delIds, allSitesUnvieweds }: optimisticUnvieweds) => {
      setAllSitesUnvieweds((prev) => {
        const siteUnvieweds = prev.find((p) => p.site == selectedSite?.site)!;
        return delIds?.length
          ? [
              //if delIds: subtract delIds from the previous unvieweds count
              ...prev.filter((s) => s.site != selectedSite?.site),
              {
                ...siteUnvieweds,
                unvieweds:
                  siteUnvieweds?.unvieweds.filter(
                    (s) => !delIds?.includes(s),
                  ) || [],
              },
            ]
          : allSitesUnvieweds!;
      });
    },
    [],
  );

  // decrement optimisticViewed by 1 when shot viewed or unvieweds when multiShots are deleted
  // -- will pass to components which view shots
  // Old  -- Will del
  // const handleOptimisticViewed = useCallback(
  //   ({ site, unvieweds }: unviewedType) => {
  //     if (!site || !selectedSite?.site) {
  //       console.error(
  //         "In handleOptimisticViewed. params missing: ",
  //         site,
  //         selectedSite,
  //       );
  //       return;
  //     }

  //     setAllSitesUnvieweds((unvArr) => {
  //       const site = selectedSite.site;
  //       const thisUnv = unvArr.find((u) => u.site == site);
  //       if (!thisUnv || thisUnv.unvieweds! < 1)
  //         return [
  //           ...unvArr.filter((u) => u.site != site),
  //           { site, unvieweds: 0 },
  //         ]; //setting unvieweds:0 should trigger a refetch of unviewedCount
  //       return [
  //         ...unvArr.filter((u) => u.site != site),
  //         { site, unvieweds: thisUnv.unvieweds! - (unvieweds ?? 1) }, //it should accept unvieweds = 0 when passed;
  //       ];
  //     });
  //   },
  //   [selectedSite?.site],
  // );

  useEffect(() => {
    console.log("in HomePage, useEffect ran;");
    if (!sites?.length) return;
    handleSelectSite(sites[0]);
    //can load userSettings.lastSite
  }, [sites?.length]);

  //Old and inneficient: Gets the real value of site's unvieweds shots upon optimisiticUnviewed change, then updates if different -- shots may be incomplete (can only get count from db and then alter)
  // useEffect(() => {
  //   if (!sites?.length || !selectedSite?.site) {
  //     console.error("in Homepage: Missing params: ", { sites, selectedSite });
  //     return;
  //   }

  //   let cancel = false; //will stop assignment if effect refires during fetch.

  //   (async () => {
  //     const { sitesUnvieweds: dbUnv, error } = await getUnviewedIds(); //queries db -- need rateLimit?
  //     if (error || !dbUnv) {
  //       console.error("in Homepage, unviewedCount: ", error, dbUnv);
  //       return;
  //     }

  //     if (cancel) return;
  //     const siteUnvieweds = dbUnv.find((u) => u.site == selectedSite.site);

  //     requestAnimationFrame(() => {
  //       if (unvieweds?.unvieweds == siteUnvieweds?.unvieweds) return;
  //       setAllSitesUnvieweds(dbUnv!);
  //     });
  //   })();

  //   return () => {
  //     cancel = true;
  //   };
  // }, [selectedSite, sites, unvieweds?.unvieweds]); //potential loop: why use unvieweds -- unvieweds recomputes when setAllSitesUnvieweds and this setsallSitesUnvieweds

  //----> WILL USE sites and siteLoading as is, no need for useEffect for setSites

  // Fetch sites on mount
  // useEffect(() => {
  //   async function loadSites() {
  //     try {
  //       const sitesData = await getSites();
  //       setSites(sitesData);
  //       if (sitesData.length > 0) {
  //         setSelectedSite(sitesData[0]?.site); //from userSites dropdown menu
  //       }
  //     } catch (err) {
  //       setError(parseApiError(err));
  //     } finally {
  //       setSitesLoading(false);
  //     }
  //   }
  //   loadSites();
  // }, []);

  // Fetch shots when site changes
  // useEffect(() => {
  //   //flat map the reactQuery data into a single shots array, Or append to an array of shots[] where each corresponds to a page -- although this still alters the state -- triggering a rerendering. How do I append new sites without triggering a rerendering or causing flickers

  //   async function loadShots() {
  //     // if (!selectedSite) return; // nope: if !selectedSite, will load visitorShots

  //     setShotsLoading(true);
  //     setError(null);
  //     setSelectedShot(null);

  //     try {
  //       //finds:
  //       // prefer this script which only auto loads new sites when user is active, than mapping shots component each with auto load effects -- loadin while the user is active gives a freshness sense

  //       //this script's useEffect>loadShots overwrites loaded sites (setShots) when user switches between sites -- solved with reactQuery: not so, will still load cache -- change to shots component mapped to each site.
  //       //  this will map shots component to each site and only display active one -- dynamic pages?: if component unmounts useState will fail, will then need context and loading that may undifferent from current implementation; Or are there hooks for preserving states in dynamic routes?

  //       //slide position: will have to set current slide index per shot component, set usePreserveScroll to array.
  //       //  Slide position: will be captured before on every fetch: new addition (nextPage) or old addition (prevPage).

  //       //instead of gallery showing slides swipable from left to right, prefer a scrollable gallery component with square containers (images) grouped by date, Is there a swiper variant for this (so I might keep its swiper instance effects), or do I just style the swiper containers ?
  //       //Heard something about next js now memoising functions, is useCallback obsolete?
  //       const shotsData = await getShots(selectedSite);
  //       setShots(shotsData);

  //       if (shotsData.length > 0) {
  //         setSelectedShot(shotsData[0]); //auto selecting firstShot from retrieved 20 unvieweds -- ok?
  //       }
  //     } catch (err) {
  //       setError(parseApiError(err)); //not so.
  //       setShots([]);
  //     } finally {
  //       setShotsLoading(false);
  //     }
  //   }
  //   loadShots();
  // }, [selectedSite]);

  const handleSelectSite = useCallback((site: siteData) => {
    setSelectedSite(site);
  }, []);

  //place in navbar
  const handleRefresh = useCallback(async () => {
    if (!selectedSite) return;

    //triggers refresh effect in Shots.
    setRefreshingSites(selectedSite.site + Math.random());
    try {
      const { error } = await sitesRefetch();
      if (error) throw error;
    } catch (e) {
      console.error("Error refetching sites: ", e);
    } finally {
      setRefreshingSites("");
    }
  }, [selectedSite?.site]);

  const handleAddSite = useCallback(() => {
    // Navigate to cron scheduler to add a new site -- change to overlaid component
    window.location.href = "/cron";
  }, []);

  return (
    <div className="bg-background overflow-hi flex h-screen w-screen flex-col">
      {/* Navbar */}
      <Navbar
        //create contextMenu for these functions in Shots > gallery
        sites={sites}
        selectedSite={selectedSite}
        onSelectSite={handleSelectSite}
        sitesLoading={sitesLoading}
        handleRefresh={handleRefresh}
        onAddSite={handleAddSite}
        allSitesUnvieweds={allSitesUnvieweds}
        localUnviewed={localUnviewed}
        onDownloadTimePeriod={setDownloadTimePeriod}
        userData={userData}
        currId={currId}
        // setSelectedShots={setSelectedShots} // will need this to unselect all shots
        onDownloadSelectedShots={setDownloadSelectedShots}
        onDownloadCurrShotAndAfter={setDownloadCurrShotAndAfter}
        onDownloadCurrShotAndBefore={setDownloadCurrShotAndBefore}
        onDownloadUnviewedAfterCurr={setDownloadUnviewedAfterCurr}
        onDownloadUnviewedBeforeCurr={setDownloadUnviewedBeforeCurr}
        onDeleteSelectedShots={setDeleteSelectedShots}
        onSelectedShotsViewed={setViewSelectedShots}
      />

      {/* Main Content */}
      <Shots
        refresh={refreshingSites!}
        site={selectedSite?.site || ""}
        preserveScroll={preserveScroll}
        deleteSelectedShots={deleteSelectedShots}
        downloadTimePeriod={downloadTimePeriod}
        downloadUnviewedAfterCurr={downloadUnviewedAfterCurr} //pass 'local' to download local unvieweds else db;
        downloadUnviewedBeforeCurr={downloadUnviewedBeforeCurr} //as above
        downloadCurrShotAndAfter={downloadCurrShotAndAfter} //from navbar; selectedShot must be defined here no need for id
        downloadCurrShotAndBefore={downloadCurrShotAndBefore}
        selectedShots={selectedShots}
        downloadSelectedShots={downloadSelectedShots}
        viewSelectedShots={viewSelectedShots}
        onAddSite={handleAddSite}
        onlocalUnviewed={setlocalUnviewed}
        onAllSitesUnvieweds={handleAllSitesUnvieweds}
        onSelectedShots={setSelectedShots}
      />

      {/* Footer gradient accent */}
      <div className="from-primary/50 via-accent/50 to-primary/50 h-1 bg-linear-to-r" />
    </div>
  );
}
