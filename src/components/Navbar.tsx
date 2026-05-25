// src/components/Navbar.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Camera,
  Clock,
  Download,
  LogIn,
  UserPlus,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type {
  handleDownload,
  siteData,
  timePeriod,
  unviewedType,
  userData,
} from "@/lib/types";
import Image from "next/image";
import SitesTab from "./SitesTab";

interface NavbarProps {
  sitesLoading: boolean;
  sites: siteData[] | undefined;
  selectedSite: siteData | undefined;
  allSitesUnvieweds: unviewedType[];
  localUnviewed: number[] | undefined;
  userData: userData | undefined;
  currId?: { first: number | undefined; last: number | undefined };
  onSelectSite: (site: siteData) => void;
  onAddSite: () => void;
  handleRefresh: () => void;
  onDownloadCurrShotAndAfter: (n: handleDownload) => void;
  onDownloadCurrShotAndBefore: (n: handleDownload) => void;
  onDownloadSelectedShots: (n: number) => void;
  onDownloadUnviewedBeforeCurr: (n: handleDownload) => void;
  onDownloadUnviewedAfterCurr: (n: handleDownload) => void;
  onDownloadTimePeriod: (n: timePeriod) => void;
  onDeleteSelectedShots: (n: number) => void;
  onSelectedShotsViewed: (n: number) => void;
  // TODO: Add user info prop when auth is implemented
}

function Navbar({
  sites,
  currId,
  userData,
  allSitesUnvieweds,
  localUnviewed, //shotIds[]
  selectedSite,
  sitesLoading,
  onAddSite,
  onSelectSite,
  onDownloadCurrShotAndAfter,
  onDownloadCurrShotAndBefore,
  onDownloadSelectedShots,
  onDownloadUnviewedBeforeCurr,
  onDownloadUnviewedAfterCurr,
  onDownloadTimePeriod,
  onDeleteSelectedShots,
  onSelectedShotsViewed,
}: NavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  //recomputes per site or allUnviewed.unvieweds change -- useMemo prevents irrelevant recomputes from component rerenders and other allUnviewed changes
  const selectedSiteUnviewed = useMemo(() => {
    return allSitesUnvieweds.find((s) => s.site == selectedSite?.site);
  }, [selectedSite?.site, allSitesUnvieweds]);

  const dbUnviewedCurrAndBefore = useMemo(() => {
    const curr = (currId?.last || 0) + 1;
    return selectedSiteUnviewed?.unvieweds.filter((s) => s < curr).length || 0;
  }, [selectedSiteUnviewed]);

  const dbUnviewedCurrAndAfter = useMemo(() => {
    const curr = (currId?.first || 0) - 1;
    return selectedSiteUnviewed?.unvieweds.filter((s) => s > curr).length || 0;
  }, [selectedSiteUnviewed]);

  const localUnviewedCurrAndAfter = useMemo(() => {
    const curr = (currId?.first || 0) - 1;
    return localUnviewed?.filter((s) => s > curr).length || 0;
  }, [localUnviewed]);

  const localUnviewedCurrAndBefore = useMemo(() => {
    const curr = (currId?.last || 0) + 1;
    return localUnviewed?.filter((s) => s < curr).length || 0;
  }, [localUnviewed]);

  useEffect(() => {
    console.log("in Navbar, useEffect ran");
  }, []);
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-border/50 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary/10 flex h-9 w-9 items-center justify-center rounded-lg">
            <Image
              src="/webshooter.png"
              width={50}
              height={50}
              alt="WebShooter logo"
            />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Web Shooter
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-4 md:flex">
          {/* Site Switcher */}
          <SitesTab
            sites={sites}
            selectedSite={selectedSite}
            onSelectSite={onSelectSite}
            allSitesUnvieweds={allSitesUnvieweds}
            sitesLoading={sitesLoading}
            selectedSiteUnviewed={selectedSiteUnviewed}
            onAddNew={onAddSite}
          />

          {/* Quick Actions */}
          <Button variant="ghost" size="sm" asChild className="gap-2">
            <Link href="/cron">
              <Clock className="h-4 w-4" />
              <span>Scheduler</span>
            </Link>
          </Button>

          {(dbUnviewedCurrAndBefore || 0) > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onDownloadUnviewedBeforeCurr({ unique: Date.now() })
              }
              className="border-primary/50 text-primary hover:bg-primary/10 gap-2 bg-transparent"
            >
              <Download className="h-4 w-4" />
              <span>
                Download{" "}
                <span className="h-fit w-fit rounded-full bg-red-500 p-1 shadow-sm">
                  {" "}
                  {dbUnviewedCurrAndBefore}
                </span>{" "}
                db unviewed shots
              </span>
            </Button>
          )}

          {/* use DropDownMenu: Download Db shots > `23 shots after current` ; `34 shots before current`  */}

          {/* set download buttons */}

          {/* Auth Buttons */}
          {!userData ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild className="gap-2">
                {/* Change to login component */}
                <Link href="/login">
                  <LogIn className="h-4 w-4" />
                  <span>Log in</span>
                </Link>
              </Button>
              <Button size="sm" asChild className="gap-2">
                <Link href="/signup">
                  <UserPlus className="h-4 w-4" />
                  <span>Sign up</span>
                </Link>
              </Button>
            </div>
          ) : (
            // TODO: Replace with UserControlsOverlay trigger : Can have notifications and delete account here;
            <Button variant="ghost" size="sm">
              Account
            </Button>
          )}
        </div>

        {/* Mobile Menu */}
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="border-border/50 bg-card/95 w-[280px] backdrop-blur-md"
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Camera className="text-primary h-5 w-5" />
                Web Shooter
              </SheetTitle>
            </SheetHeader>

            <div className="mt-6 flex flex-col gap-4">
              {/* Site Switcher */}
              <div>
                <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                  Sites
                </p>
                <SitesTab
                  sites={sites}
                  selectedSite={selectedSite}
                  sitesLoading={sitesLoading}
                  selectedSiteUnviewed={selectedSiteUnviewed}
                  allSitesUnvieweds={allSitesUnvieweds}
                  onSelectSite={(site) => {
                    onSelectSite(site);
                    setIsMobileMenuOpen(false);
                  }}
                  onAddNew={onAddSite}
                />
              </div>

              {/* Navigation Links */}
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                  Navigation
                </p>
                <Button
                  variant="ghost"
                  className="justify-start gap-2"
                  asChild
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {/* change to cron component: popover, dialog, (implememting login as a component that pops right under the button on click -- is it a modal I need? What's the right component? ) */}
                  <Link href="/cron">
                    <Clock className="h-4 w-4" />
                    Cron Scheduler
                  </Link>
                </Button>

                {(dbUnviewedCurrAndBefore || 0) > 0 && (
                  <Button
                    variant="ghost"
                    className="text-primary justify-start gap-2"
                    onClick={() => {
                      onDownloadCurrShotAndBefore({ unique: Date.now() });
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Download{" "}
                    <span className="h-fit w-fit rounded-full bg-red-500 p-1 shadow-sm">
                      {" "}
                      {dbUnviewedCurrAndBefore}
                    </span>{" "}
                    db unviewed shots
                  </Button>
                )}
              </div>

              {/* Auth Section */}
              <div className="border-border/50 flex flex-col gap-2 border-t pt-4">
                {!userData ? (
                  <>
                    <Button
                      variant="ghost"
                      className="justify-start gap-2"
                      asChild
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {/* Change to hover + popover card */}
                      <Link href="/login">
                        <LogIn className="h-4 w-4" />
                        Log in
                      </Link>
                    </Button>
                    <Button
                      className="justify-start gap-2"
                      asChild
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Link href="/signup">
                        <UserPlus className="h-4 w-4" />
                        Sign up
                      </Link>
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" className="justify-start">
                    Account Settings
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </motion.header>
  );
}

export default React.memo(Navbar);
