"use client";
// lib/usePreserveScroll.ts
import { useCallback, useRef } from "react";
import type { Swiper as SwiperType } from "swiper";

type swiperRef = {
  swiper: SwiperType;
  site: string;
  // id?: number; //No purpose? since swiper has swiperID no way to pass this on slidechange
};

type restore = {
  addedCount?: number; // Only relevant for older shots (prepending) since its same count to current position when appending shots
  site: string; // if prepended then added shots upward, but not prepended so index stays same
  prevShotId?: number;
};

export type preserveScrollType = {
  capturePosition: (site: string) => swiperRef[] | null;
  restorePosition: (object: restore) => boolean;
  swiperRefs: React.RefObject<swiperRef[]>;
};

//must call in parent component to share same swiperRefs instance with children.
export function usePreserveScroll(): preserveScrollType {
  const swiperRefs = useRef<swiperRef[]>([]);

  const capturePosition = useCallback((site: string): swiperRef[] | null => {
    //gets the matching swiper
    const thisSwiper = swiperRefs.current?.find((s) => s.site == site);
    if (thisSwiper) {
      const tS = { ...thisSwiper, id: thisSwiper.swiper.activeIndex };
      swiperRefs.current = [
        ...swiperRefs.current.filter((s) => s.site != site),
        tS,
      ];
    } else return null;

    return swiperRefs.current; //returns whole swiper array
  }, []);

  //will calc new pos by captured id else prevShotId
  const restorePosition = useCallback(
    ({ addedCount, site, prevShotId }: restore): boolean => {
      const thisSwiper = swiperRefs.current.find((s) => s.site == site);

      if (thisSwiper) {
        const newIndex = prevShotId
          ? prevShotId
          : thisSwiper.swiper.activeIndex! + (addedCount || 0);
        thisSwiper.swiper.slideTo(newIndex, 100); //second arg is anim duration
      } else return false;

      return true;
    },
    [],
  );

  return {
    capturePosition,
    restorePosition,
    swiperRefs,
  };
}

//Questions
//This subscribes component by pushing component's local ref to swiperRefs;
//I assume the swiperRefs instance then points to the same component regardless of whether usePreserveScroll is invoked elsewhere in sibling component (ie will it be a different swiperRefs array in different components ? -- if so I'd better call in parent and pass as prop to siblings.
