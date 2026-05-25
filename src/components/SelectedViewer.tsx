// components/SelectedViewer.tsx
"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  Copy,
  Check,
  X,
  Code,
  ImageIcon,
  Delete,
  Loader,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate } from "@/lib/dateformatter";
import type {
  dCacheReturn,
  delShotType,
  file,
  getDownloadCache,
  shotData,
} from "@/lib/types";
import { useDownloader } from "@/lib/downloader";
import { useErrContext } from "@/app/(main)/ErrContext";

interface SelectedViewerProps {
  shot: shotData | undefined;
  onClose?: () => void;
  onDelete: ({ ids }: delShotType) => void;
  getDownloadCache: ({ key, date, isHtml }: getDownloadCache) => dCacheReturn;
}

type cursorPos = {
  x: number;
  y: number;
};

function SelectedViewer({
  shot,
  onClose,
  getDownloadCache,
  onDelete,
}: SelectedViewerProps) {
  const { setErrBody } = useErrContext();
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"image" | "html">("image");
  const [html, setHtml] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null); //use to set pan logic -- where the user moves around the zoom object
  const { download, openInNewTab } = useDownloader();
  const [mouseOffset, setMouseOffset] = useState<cursorPos | null>(null);
  const mouseInit = useRef({ x: 0, y: 0 });

  //trackts cursor position for zoom dragging
  useEffect(() => {
    if (!imageRef.current) return;

    //listener set on component so the pan must start from there not outside.
    imageRef.current.addEventListener("mousedown", onMouseDown);
    imageRef.current.addEventListener("touchstart", onMouseDown);

    return () => {
      imageRef.current?.removeEventListener("mousedown", onMouseDown);
      imageRef.current?.removeEventListener("touchstart", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("touchmove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchend", onMouseUp);
    };
  }, []);

  //sets event listeners for cursor move and mouseup
  const onMouseDown = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!(zoom > 1)) {
        setMouseOffset(null);
        return;
      }

      //if Checks that there's not a current move action indicated by !mouseInit.current -- if moving, should not overwrite
      //expecting a null return from e.clientX when isTouchEvent -- true?
      if (!mouseInit.current.x) {
        const x =
          (e as MouseEvent).clientX || (e as TouchEvent).touches[0].clientX;
        const y =
          (e as MouseEvent).clientY || (e as TouchEvent).touches[0].clientY;

        mouseInit.current = { x, y };
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("touchmove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp); //mouseup suffices, as zoom starts on comp.mousedown, so !mousedown is pan-end regardless of position
      document.addEventListener("touchend", onMouseUp);
    },
    [zoom],
  );

  //gets relative position of cursor from initial touch/click (set on mousedown)
  const onMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    let x = (e as MouseEvent)?.clientX || (e as TouchEvent).touches[0].clientX;
    let y = (e as MouseEvent)?.clientY || (e as TouchEvent).touches[0].clientY;

    x = x - mouseInit.current.x;
    y = y - mouseInit.current.y;

    //What's the function of requestAnimationFrame()?
    requestAnimationFrame(() => {
      setMouseOffset({ x, y });
    });
  }, []);

  //sets cursor position to null, and removes move event listeners
  const onMouseUp = useCallback(() => {
    requestAnimationFrame(() => {
      setMouseOffset(null);
    });

    mouseInit.current = { x: 0, y: 0 };

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("touchmove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("touchend", onMouseUp);
  }, []);

  useEffect(() => {
    setZoom(1);
    setActiveTab("image");
  }, [shot]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.focus();
    if (document.activeElement != containerRef.current) return;

    const keyZoom = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key == "=") handleZoomIn();
      if (e.ctrlKey && e.key == "-") handleZoomOut();
    };

    containerRef.current!.addEventListener("keydown", keyZoom);
    return () => containerRef.current!.removeEventListener("keydown", keyZoom);
  }, [shot]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        //I reckon this check that any element is fullscreen not just containerRef.current?
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Error in toggleFullscreen: ", err);
      //setError -- can use same error dialog as Shots/gallery
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  //Retrieve Html when the user clicks on the html tab
  useEffect(() => {
    if (html || activeTab != "html") return;
    (async () => {
      setHtml(await getHtml());
    })();
  }, [activeTab]);

  const handleDownload = useCallback(async () => {
    try {
      if (!shot) throw "Shot is undefined!";

      const prop = { key: shot.shotKey, date: shot.date };
      const file = await getDownloadCache(prop);
      if (!file) throw "No file in download Cache";

      const { error } = await download(file);
      if (error) {
        console.error("In handleDowwnload. Download failed: ", error);
        //setErrBody
      }
    } catch (e) {}
  }, [shot]);

  const getHtml = useCallback(async () => {
    if (!shot) return "";
    const prop = { key: shot.htmlKey, date: shot.date, isHtml: true };
    const file = await getDownloadCache(prop);
    if (!file) {
      setErrBody({ msg: "Could not get Html!", label: "Shot Html Error!" });
      return "";
    }

    return file.fileData as string;
  }, [shot]);

  const handleCopyHtml = useCallback(async () => {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("in handleCopyHtml. Failed to copy HTML:", error);
    }
  }, [html]);

  const shotUrl = useMemo(() => {
    return shot?.shotUrl!;
  }, [shot]);

  const MotionImg = motion(Image);

  if (!shot) {
    return (
      <div className="border-border bg-card/30 flex h-full items-center justify-center rounded-xl border border-dashed backdrop-blur-sm">
        <div className="text-center">
          <ImageIcon className="text-muted-foreground/50 mx-auto h-12 w-12" />
          <p className="text-muted-foreground mt-4">
            Selected shot appears here
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      tabIndex={0}
      className={`border-border bg-card/80 flex h-full flex-col overflow-hidden rounded-xl border backdrop-blur-sm ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""
      }`}
    >
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "image" | "html")}
          >
            <TabsList className="bg-muted/50 h-8">
              <TabsTrigger value="image" className="h-6 gap-1.5 text-xs">
                <ImageIcon className="h-3 w-3" />
                Image
              </TabsTrigger>
              <TabsTrigger value="html" className="h-6 gap-1.5 text-xs">
                <Code className="h-3 w-3" />
                HTML
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="text-muted-foreground text-xs">
            {formatDate(shot.date)}
          </span>
        </div>

        {/* Add Animate presence here to see how buttons transition in and out of view. */}
        <div className="flex items-center gap-1">
          {activeTab === "image" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 min-w-16 text-xs"
                onClick={handleResetZoom}
              >
                {Math.round(zoom * 100)}%
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <div className="bg-border mx-2 h-4 w-px" />
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>

          {/* Download button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownload}
            aria-label="Download shot"
          >
            <Download className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleCopyHtml}
            aria-label={copied ? "HTML copied" : "Copy HTML"}
          >
            {copied ? (
              <Check className="text-primary h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          {/* Delete  Button */}
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDelete({ ids: shot.id })}
            aria-label="Delete Shot"
          >
            <Delete className="text-destructive h-4 w-4" />
          </Button>

          {onClose && (
            <>
              <div className="bg-border mx-2 h-4 w-px" />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
                aria-label="Close viewer"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "image" ? (
            <motion.div
              key="image"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="h-full overflow-auto"
            >
              <div
                className="flex min-h-full items-center justify-center p-4"
                style={{
                  cursor: zoom > 1 ? "grab" : "default",
                }}
              >
                <MotionImg
                  ref={imageRef}
                  src={shotUrl || ""}
                  alt={`Shot from ${formatDate(shot.date)}`}
                  className="max-w-full rounded-lg shadow-lg transition-transform duration-200"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{
                    scale: zoom,
                    opacity: 1,
                    translateX: mouseOffset?.x ? mouseOffset.x : 0,
                    translateY: mouseOffset?.y ? mouseOffset.y : 0,
                  }}
                  transition={{ duration: 0.2 }}
                  style={{
                    cursor:
                      zoom > 1
                        ? mouseOffset?.x
                          ? "grabbing"
                          : "grab"
                        : "default",
                  }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="html"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="h-full"
            >
              <ScrollArea className="h-full">
                <pre className="text-muted-foreground p-4 font-mono text-xs leading-relaxed">
                  {html ? (
                    <code>{html}</code>
                  ) : (
                    <div className="gap-1">
                      <Loader className="h-4 w-4 animate-spin" />
                      <p className="text-muted-foreground font-semibold">
                        Fetching HTML...
                      </p>
                    </div>
                  )}
                </pre>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer with viewed status */}
      <div className="border-border flex items-center justify-between border-t px-4 py-2">
        <span className="text-muted-foreground text-xs">
          Shot ID: {shot.id}
        </span>
        <span
          className={`text-xs ${shot.viewed ? "text-muted-foreground" : "text-primary"}`}
        >
          {shot.viewed ? "Viewed" : "New"}
        </span>
      </div>
    </motion.div>
  );
}

export default React.memo(SelectedViewer);
