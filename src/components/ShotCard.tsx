// components/ShotCard.tsx
"use client";

import React from "react";
import Image from "next/image";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Eye, Download, Copy, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/dateformatter";
import type {
  dCacheReturn,
  delShotType,
  getDownloadCache,
  handleViewed,
  selectedShot,
  shotData,
} from "@/lib/types";
import { useDownloader } from "@/lib/downloader";
import { filterPromise } from "./Shots";
import { useErrContext } from "@/app/(main)/ErrContext";

interface ShotCardProps {
  site: string;
  shot: shotData;
  isOpen?: boolean;
  onOpened: (shot: shotData) => void;
  onViewed: ({ id }: handleViewed) => Promise<void>;
  onDelete: ({ ids }: delShotType) => void;
  toggleSelect: ({}: selectedShot) => void;
  getDownloadCache: ({ key, date }: getDownloadCache) => dCacheReturn;
  swiperId: number;
}

function ShotCard({
  shot,
  isOpen = false,
  onOpened,
  onViewed,
  site,
  onDelete,
  toggleSelect,
  swiperId,
  getDownloadCache,
}: ShotCardProps) {
  const [markingViewed, setMarkingViewed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localViewed, setLocalViewed] = useState(shot.viewed);
  const { download, openInNewTab } = useDownloader();
  const { setErrBody } = useErrContext();

  const markViewed = useCallback(
    //for manual setting of viewed -- viewed sets onOpened
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (markingViewed || localViewed) return;

      setMarkingViewed(true);
      try {
        onViewed({ id: shot.id });
        setLocalViewed(true);
      } catch (e) {
        console.error("In markViewed:", e);
      } finally {
        setMarkingViewed(false);
      }
    },
    [markingViewed, localViewed],
  );

  const downloadShot = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); //prevent this click from triggering card's onClick
    const s = await filterPromise([
      getDownloadCache({ key: shot.shotKey, date: shot.date }),
    ]);

    const { error } = await download(s);

    if (error) setErrBody({ msg: error, label: "Download Shot Error!" });
  }, []);

  //Calls getDownloadCache for html and writes to clipboard!
  const copyHtml = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const hProp = { key: shot.htmlKey, date: shot.date, isHtml: true };
      const html = await getDownloadCache(hProp);
      if (!html) throw "Html undefined!";
      await navigator.clipboard.writeText(html.fileData as string);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      console.error("in ShotCard, copyHtml: Failed to copy HTML:", e);
      setErrBody({ msg: e.message || e, label: "Copy Html Error!" });
    }
  }, []);

  //done: set to button/ context menu
  const openHtmlInNewPage = useCallback(async (e: React.MouseEvent) => {
    //call downloader passing html as text/plain or perhaps there's a type for that
    e.stopPropagation();
    try {
      const hProp = { key: shot.htmlKey, date: shot.date, isHtml: true };
      const html = await getDownloadCache(hProp);
      if (!html) throw "Could not get HTML from Download Cache!";
      const { error } = await openInNewTab(html);
      if (error) throw error;
    } catch (e) {
      console.error("Failed to open html in newpage: ", e);
      //setError
    }
  }, []);

  // if ctrlKey: multiSelect -- will not open shot or mark viewed but set to selectedShots; else does
  const handleClicked = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey) toggleSelect({ id: shot.id, swiperId });
    else {
      toggleSelect({ id: shot.id, swiperId, single: true });
      markViewed(e);
      onOpened(shot);
    }
  }, []);

  //getting active shot on delShot not dependent on slides change, cause selectedShots will not trigger slideChange

  //create a select button on card
  const handleSelectShot = () => toggleSelect({ id: shot.id });

  //Create a delete button on card
  const handleDelete = () => onDelete({ ids: shot.id });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      {/* hope parent clicks are not propagated to children -- ie when card is clicked both Card.onClick and Card.CardContent.(Motion.div).Button.onClick is triggered  */}
      <Card
        //place hover:box-shadow
        className={`group border-border/50 bg-card/80 hover:border-primary/50 hover:shadow-primary/10 relative h-full cursor-pointer overflow-hidden backdrop-blur-sm transition-all duration-300 hover:shadow-lg ${
          isOpen ? "ring-primary border-primary ring-2" : ""
        }`}
        onClick={handleClicked}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpened(shot);
          }
        }}
        aria-label={`Shot from ${formatRelativeTime(shot.date)}`}
      >
        {/* Unviewed indicator */}
        {!localViewed && (
          <div className="bg-primary absolute top-2 right-2 z-10 h-2.5 w-2.5 animate-pulse rounded-full" />
        )}

        {/* Selected Shot Indicator */}

        <CardContent className="flex h-full flex-col p-0">
          {/* Image container */}
          <div className="bg-muted relative aspect-9/16 w-full overflow-hidden">
            {/* {shot.file.fileType == "text/plain" ? (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold transition-transform duration-300">
                {shot.file.fileData}
              </div>
            ) } */}
            (
            <Image
              src={shot.shotUrl}
              alt={`Screenshot from ${site} ${formatRelativeTime(shot.date)}`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              placeholder="blur"
            />
            ){/* Overlay with actions on hover? */}
            <motion.div
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              className="bg-background/80 absolute inset-0 flex items-center justify-center gap-2 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
            >
              <Button
                size="sm"
                variant="secondary"
                onClick={downloadShot}
                className="h-8 w-8 p-0"
                aria-label="Download Shot"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={copyHtml}
                className="h-8 w-8 p-0"
                aria-label={copied ? "HTML copied" : "Copy HTML"}
              >
                {copied ? (
                  <Check className="text-primary h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              {!localViewed && (
                //mark as viewed
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={markViewed}
                  disabled={markingViewed}
                  className="h-8 w-8 p-0"
                  aria-label="Mark as viewed"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
            </motion.div>
          </div>

          {/* Content section */}
          <div className="flex flex-1 flex-col gap-2 p-3">
            {/* HTML preview */}
            <p className="text-muted-foreground line-clamp-2 flex-1 font-mono text-xs">
              Click to download html (soon)!
            </p>

            {/* Date */}
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Clock className="h-3 w-3" />
              <time dateTime={new Date(shot.date).toISOString()}>
                {formatRelativeTime(shot.date)}
              </time>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default React.memo(ShotCard);
