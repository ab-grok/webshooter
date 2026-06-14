//set trigger action dialog boxes;
"use client";
//Components/Gallery
//Consumed as Shots > Gallery

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import {
  Navigation,
  Keyboard,
  A11y,
  Pagination,
  Scrollbar,
  EffectCoverflow,
} from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { preserveScrollType } from "@/lib/usePreserveScroll";
import type {
  dCacheReturn,
  delShotType,
  file,
  getUrlBlob,
  handleViewed,
  selectedShot,
  shotData,
} from "@/lib/types";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/scrollbar";
import "swiper/css/effect-coverflow";
import { useMutateViewed, useQueryShots } from "@/app/(main)/reactquery";
import { useDownloader } from "@/lib/downloader";
import ShotCard from "./ShotCard";
import { useErrContext } from "@/app/(main)/ErrContext";
import { filterPromise, timing } from "./Shots";

interface GalleryProps {
  site: string;
  siteShots: shotData[] | undefined;
  openedShot: shotData | undefined;
  selectedShots: selectedShot[];
  preserveScroll: preserveScrollType;
  delSelectedShots: number;
  downloadSelectedShots: number;
  viewSelectedShots: number;
  getUrlBlob: ({ key, date }: getUrlBlob) => dCacheReturn;
  onOpenedShot: (shot: shotData) => void;
  onDeleteShot: ({ ids }: delShotType) => void; //deletes selectedShots when active
  onSelectedShots: (
    fn: selectedShot[] | ((shot: selectedShot[]) => selectedShot[]),
  ) => void;
}

function ShotSkeleton() {
  return (
    <div className="mx-auto h-full w-full shrink-0">
      <div className="border-border/50 bg-card/50 aspect-9/16 animate-pulse overflow-hidden rounded-3xl border" />
      <div className="mt-4 flex flex-col gap-2">
        <div className="bg-muted/60 h-4 w-3/4 animate-pulse rounded-full" />
        <div className="bg-muted/60 h-3 w-1/2 animate-pulse rounded-full" />
      </div>
    </div>
  );
}

function Gallery({
  site,
  siteShots,
  openedShot, //for altering viewed
  selectedShots,
  preserveScroll,
  delSelectedShots,
  viewSelectedShots,
  downloadSelectedShots,
  getUrlBlob,
  onOpenedShot, //unneeded: will select shots here and pass to selected shot -- false need in parent for selectedViewer
  onDeleteShot,
  onSelectedShots,
}: GalleryProps) {
  const { setErrBody } = useErrContext();
  const [addedCount, setAddedCount] = useState(0); //will be passed to shotCard to acc selects and used for dl
  const [firstDeledShot, setFirstDeledShot] = useState<number>(); //holds id of first shot in selectedShots when deled

  const { shots, fetchNextShots, fetchPrevShots, ...s } = useQueryShots(site);
  const { fetchingNextShots, fetchingPrevShots, shotsLoading } = s;
  const { mutateViewed, resetViewed, ...v } = useMutateViewed(site);
  const { mutateViewedErr, mutatingViewed } = v; // set loader or sth
  const { capturePosition, restorePosition, swiperRefs } = preserveScroll; //a user can switch between multiple sites, and I need the scroll position restored after a change and back to a site -- this achieved?
  const { download } = useDownloader();
  const galleryRef = useRef<HTMLDivElement>(null);
  const notLoading = !fetchingPrevShots && !shotsLoading && !fetchingNextShots;

  const noMorePrev = useMemo(() => {
    if (!shots?.pages?.length) return true;
    return shots.pages[0].noMorePrev;
  }, [shots]);

  const noMoreNext = useMemo(() => {
    if (!shots?.pages?.length) return true;
    return shots.pages.at(-1)?.noMoreNext;
  }, [shots]);

  //global effect for restorePositon on shot change -- position captured per slide change.
  // Uses firstDeledShot for restoring to previous id after delShot -- may need change if grid layout / manual scroll
  //on delShot fail: effect retriggers refixing optimstically deled shots and setting to activeIndex from capturePosition -- good.
  // Else block: non delshot shots change: uses addedCount ( only useful for prepended shots);
  useEffect(() => {
    if (!shots?.pages?.length) return;

    if (Number(firstDeledShot)) {
      if (!selectedShots.length) return;

      let prevShotId =
        Math.min(...selectedShots.map((s) => s.swiperId!).filter(Boolean)) - 1;
      prevShotId = prevShotId >= 0 ? prevShotId : 0;

      onSelectedShots([]); //runs after optiistic del
      setFirstDeledShot(undefined);

      //at this point shots have been deled -- no need for requestAnimationFrame to wait for DOM to update before restoring position -- is this concept of requestAnimationFrame accurate or perhaps the goal to restore position seamlessly is simply useLayoutEffect no requestAimationFrame in talks?
      const restored = restorePosition({ site, prevShotId });
      if (!restored) console.error("Failed to restore ");
    } else {
      restorePosition({ site, addedCount });
      setAddedCount(0);
    }
  }, [shots]);

  useEffect(() => {
    if (!viewSelectedShots) return;
    handleViewed({ viewSelectedShots: true });
  }, [viewSelectedShots]);

  useEffect(() => {
    //effect for delShot trigger (from Navbar) and context menu -- do context menu
    if (!delSelectedShots) return;
    handleDeleteShot2({} as delShotType);
  }, [delSelectedShots]);

  useEffect(() => {
    if (!downloadSelectedShots || !selectedShots.length) return;
    handleDownloadSelectedShots();
  }, [downloadSelectedShots]);

  useEffect(() => {
    if (!mutateViewedErr) return;
    setErrBody({ msg: mutateViewedErr.error, label: "Set Shot Viewed Error!" });
  }, [mutateViewedErr]);

  //Closes errorDialog
  useEffect(() => {
    if (notLoading && !siteShots?.length) setErrBody({});
  }, [notLoading, siteShots?.length]);

  // Fix download
  const handleDownloadSelectedShots = useCallback(async () => {
    try {
      const selIds = selectedShots.map((s) => s.id!);
      const selShotKeys = siteShots
        ?.filter((s) => selIds?.includes(s.id))
        .map((s) => ({ url: s.shotUrl, key: s.shotKey, date: s.date }))!;

      const selShots0 = selShotKeys.map((s) => getUrlBlob(s));
      const selShots = await filterPromise(selShots0);

      const { error } = await download(selShots);
      if (error) throw error;
    } catch (e: any) {
      console.error("in Gallery handleDownloadSelShots: ", e);
      setErrBody({ msg: e, label: "Download Selected Shots Error!" });
    }
  }, [selectedShots]);

  // Optimistically mods shots.viewed, can call by selectedShots; capture unnecessary and removed.
  const handleViewed = useCallback(
    async ({ id, viewSelectedShots }: handleViewed) => {
      try {
        let ids = [id!];

        if (viewSelectedShots && selectedShots?.length) {
          ids = selectedShots.map((s) => s.id!);
        }

        const { error } = await mutateViewed({ ids }); //before await resolves, shots refresh optimistically
        if (error) throw error;
      } catch (e: any) {
        console.error("in Gallery handleViewed: ", e);
        setErrBody({ msg: e, label: "Set Viewed Error!" });
      }
    },
    [selectedShots],
  );

  //Multishots: !id: passes [...], called from Navbar trigger and passed to Shots.handleDeleteShot
  const handleDeleteShot2 = useCallback(
    async ({ ids }: delShotType) => {
      try {
        capturePosition(site);
        if (!ids) {
          if (!selectedShots.length) return;
          setFirstDeledShot(selectedShots[0].swiperId!);

          ids = selectedShots.map((s) => s.id!);

          onDeleteShot({ ids });
        } else {
          onDeleteShot({ ids });
        }
        return;
      } catch (e: any) {
        console.error("in Gallery handleDeleteShot2: ", e);
        setErrBody({ msg: e, label: "Delete Shot Error!" });
      }
    },
    [selectedShots],
  );

  //initialise swiperRefs (array) with swiper instance.
  const pushSwiper = useCallback(
    (swiper: SwiperType) => {
      const savedSwiper = swiperRefs.current?.find((s) => s.site == site);
      if (savedSwiper) return;

      const thisSwiper = { swiper, site };
      swiperRefs.current.push(thisSwiper);
    },
    [site],
  );

  const onReachBegining = useCallback(async () => {
    try {
      if (noMorePrev) throw "No more prev shots!";
      if (fetchingPrevShots) throw "Fetching prev shots!";

      const { error, data } = await fetchPrevShots();
      if (error) throw error;

      //Prepended shots which means orginal position shifted forwards (or upwards when grid layout)
      setAddedCount(data?.pages[0].shotsData.length!);
    } catch (e: any) {
      console.error("In onScrollDown: ", e);
      setErrBody({ msg: e, label: "Fetch Prev Shots Error!" });
    }
  }, [noMorePrev, fetchingPrevShots]);

  const onReachEnd = useCallback(async () => {
    try {
      if (noMoreNext) throw "You're up to date.";
      if (fetchingNextShots) throw "Fetching next shots.";

      const { error, data } = await fetchNextShots();
      if (error) throw error;

      //no Need to setAddedCount -- as appended shots may not shift activeIndex (but may for manual scroll position seeking in grid layout);
      // effect is triggered by shots change
    } catch (e: any) {
      console.error("In onScrollUp: ", e);
      setErrBody({ msg: e, label: "Fetch Next Shots Error!" });
    }
  }, [noMoreNext, fetchingNextShots]);

  //computes the onEnd/onStart-Reached of the slides and fetches old/new for either
  //Logic change after implementing slides as grid?: get container height and calc container top reached and loading next and container bottom reached and load prev shots (use requestAnimFrame);
  //implemented toggleSelectShot here even if not opened, since 'slide change' = activeIndex change -- is assumption correct?
  const handleSlideChange = useCallback(
    //Problematic. Can trigger slideTo unnecesarily on rapid scrolling -- switch to layout and layout scroll.
    async (swiper: SwiperType) => {
      if (!siteShots?.length) return;

      const swiperId = swiper.activeIndex;
      const id = siteShots?.at(swiperId)?.id;

      toggleSelectShot({ id, swiperId, single: true });
      capturePosition(site);

      try {
        if (swiper.activeIndex < 5 && !noMorePrev && !fetchingPrevShots)
          await onReachEnd();
        else {
          const pageEnd = swiper.activeIndex > swiper.slides.length - 6;
          if (pageEnd && !noMoreNext && !fetchingNextShots) {
            await onReachBegining();
          }
        }
      } catch (e: any) {
        console.error("In handleSlidesChange: ", e);
        setErrBody({ msg: e, label: "Slides Change Error!" });
      }
    },
    [noMorePrev, noMoreNext, fetchingNextShots, fetchingPrevShots],
  );

  //Passed to ShotCard for onSelect shot (multiShots); Updated here on slideChange (single shot);
  const toggleSelectShot = useCallback(
    ({ id, swiperId, single }: selectedShot) => {
      //single: clears prevArray;
      //looking to pass id to capturePosition on onOpenedChange or selectedShots (from highest swiperID)

      onSelectedShots((shot) => {
        if (single) return [{ id, swiperId }];

        const wasSelected = shot.find((s) => s.id == id);
        if (wasSelected) return shot.filter((s) => s.id != id);
        return [...shot, { id, swiperId }];
      });
    },
    [],
  );

  //Alternative component B
  if (false && !siteShots?.length && notLoading) {
    return (
      //CHANGE to framer motion and perform transforms on hover, click
      <div className="border-border bg-card/50 flex h-64 items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground">No Shots yet, Sorry!</p>
        {/* Display cron details */}
        {/* Show actions Modify cron, delete cron */}
      </div>
    );
  }

  return (
    <div
      ref={galleryRef}
      className="relative flex flex-1 flex-col overflow-hidden bg-red-800"
    >
      {/* Error message */}
      {/* <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-destructive/10 text-destructive absolute top-0 right-0 left-0 z-10 rounded-lg p-2 text-center text-sm"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence> */}

      {/* Left & Right Loading indicators */}
      <AnimatePresence>
        {fetchingPrevShots && (
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0 }}
            className="absolute top-1/2 left-4 z-10 -translate-y-1/2"
          >
            <Loader2 className="text-primary h-6 w-6 animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fetchingNextShots && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0 }}
            className="absolute top-1/2 right-4 z-10 -translate-y-1/2"
          >
            <Loader2 className="text-primary h-6 w-6 animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation buttons used to be here  */}

      {/* Swiper */}
      <div className="flex-1 p-4">
        <Swiper //explain each props
          key={site}
          modules={[EffectCoverflow, Navigation, Keyboard, A11y, Scrollbar]}
          navigation={{
            prevEl: ".gallery-prev",
            nextEl: ".gallery-next",
          }}
          keyboard={{
            enabled: true,
            onlyInViewport: true,
          }}
          effect="coverflow"
          grabCursor={true}
          centeredSlides
          coverflowEffect={{
            rotate: 10,
            stretch: 50,
            depth: 100,
            modifier: 1,
            slideShadows: false,
          }}
          // breakpoints={{
          //   640: { slidesPerView: 2, spaceBetween: 12 },
          //   1024: { slidesPerView: 4, spaceBetween: 14 },
          //   1280: { slidesPerView: 5, spaceBetween: 16 },
          // }}
          slidesPerView="auto"
          scrollbar={{ draggable: true }}
          onSwiper={pushSwiper}
          // onSlideChange={handleSlideChange}
          onReachBeginning={onReachBegining}
          onReachEnd={onReachEnd}
          className={`mx-auto min-h-0 max-w-[70vw] bg-amber-200 pb-12 ${
            openedShot ? "lg:max-w-[55vw]" : "lg:max-w-[80vw]"
          }`}
        >
          {/* PrevShots skeleton */}
          {fetchingPrevShots &&
            !noMorePrev &&
            Array.from({ length: 2 }).map((v, i) => (
              <SwiperSlide
                key={`skeleton-newer-${i}`}
                className="mx-auto !w-50"
              >
                <ShotSkeleton />
              </SwiperSlide>
            ))}

          {siteShots?.length &&
            siteShots.map((shot, i) => (
              <SwiperSlide
                key={shot.id}
                className="flex !w-50 items-center justify-center"
              >
                <ShotCard
                  shot={shot}
                  isOpen={openedShot?.id === shot.id}
                  onOpened={onOpenedShot}
                  onViewed={handleViewed}
                  onDelete={handleDeleteShot2}
                  site={site}
                  toggleSelect={toggleSelectShot}
                  swiperId={i}
                  getUrlBlob={getUrlBlob}
                />
              </SwiperSlide>
            ))}

          {
            // This is the component rendering in this testing phase
            (true ||
              (fetchingNextShots && !noMoreNext) ||
              (shotsLoading && !siteShots?.length)) &&
              Array.from({ length: 5 }).map((v, i) => (
                <SwiperSlide key={`skeleton-newer-${i}`} className="!w-50">
                  <ShotSkeleton />
                </SwiperSlide>
              ))
          }
        </Swiper>
      </div>

      {/* Load more buttons for manual control */}
      <div className="mt-4 flex items-center justify-center gap-8 bg-blue-700">
        <Button
          variant="outline"
          size="sm"
          onClick={onReachBegining}
          disabled={fetchingPrevShots || noMorePrev}
          className="rounded-full bg-transparent text-xs"
        >
          {fetchingPrevShots ? (
            <p className="mr-2 gap-2">
              <Loader2 className="mr-2 h-3 w-3 animate-spin rounded-full" />
              Loading Older...
            </p>
          ) : (
            <p className="mr-2 cursor-pointer hover:ring-2"> Load Older </p>
          )}
        </Button>

        {/* Navigation buttons */}
        <Button
          variant="secondary"
          size="icon"
          className="gallery-prev bg-background/50 hover:bg-background z-10 flex size-15 cursor-pointer rounded-3xl text-center shadow-sm backdrop-blur-sm hover:shadow-md hover:ring-2"
          aria-label="Previous screenshots"
        >
          <motion.div
            animate={{ x: 0 }}
            transition={timing}
            whileTap={{ x: -5 }}
            whileHover={{ x: -10 }}
          >
            <ChevronLeft className="size-10" />
          </motion.div>
        </Button>

        <Button
          variant="secondary"
          size="icon"
          className="gallery-next bg-background/50 hover:bg-background z-10 size-15 cursor-pointer rounded-3xl shadow-sm backdrop-blur-sm hover:shadow-md hover:ring-2"
          aria-label="Next screenshots"
        >
          <motion.div
            animate={{ x: 0 }}
            whileTap={{ x: 5 }}
            transition={timing}
            whileHover={{ x: 10 }}
          >
            <ChevronRight className="size-10" />
          </motion.div>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onReachEnd}
          disabled={fetchingNextShots || noMoreNext}
          className="rounded-full bg-transparent text-xs hover:ring-2"
        >
          {fetchingNextShots ? (
            <p className="mr-2 gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading Newer...
            </p>
          ) : (
            <p className="mr-2"> Load Newer </p>
          )}
        </Button>
      </div>
    </div>
  );
}

export default React.memo(Gallery);
