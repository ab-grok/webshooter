// components/UserControlsOverlay.tsx
"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  LogOut,
  Trash2,
  Download,
  Bell,
  X,
  AlertTriangle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";

interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
}

interface UserControlsOverlayProps {
  onLogout?: () => void;
  onDeleteAccount?: () => void;
  onDownloadAll?: () => void;
  onDownloadUnviewed?: () => void;
  notifications?: Notification[];
  onDismissNotification?: (id: string) => void;
  onMarkAllRead?: () => void;
  userName?: string;
  userEmail?: string;
}

function UserControlsOverlay({
  onLogout,
  onDeleteAccount,
  onDownloadAll,
  onDownloadUnviewed,
  notifications = [],
  onDismissNotification,
  onMarkAllRead,
  userName = "Visitor",
  userEmail = "Visitor@example.com",
}: UserControlsOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "notifications">(
    "account",
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleLogout = useCallback(() => {
    onLogout?.();
    setIsOpen(false);
  }, [onLogout]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label="User menu"
        >
          <User className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="border-border/50 bg-card/95 flex w-[350px] flex-col p-0 backdrop-blur-md sm:w-[400px]">
        <SheetHeader className="border-border/50 border-b p-4">
          <SheetTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                <User className="text-primary h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-muted-foreground text-xs">{userEmail}</p>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Tab Navigation */}
        <div className="border-border/50 flex border-b">
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "account"
                ? "border-primary text-primary border-b-2"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("account")}
          >
            Account
          </button>
          <button
            className={`relative flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "notifications"
                ? "border-primary text-primary border-b-2"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("notifications")}
          >
            Notifications
            {unreadCount > 0 && (
              <span className="bg-primary text-primary-foreground ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === "account" ? (
              <motion.div
                key="account"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex h-full flex-col p-4"
              >
                <div className="flex-1 space-y-2">
                  {/* Download Actions */}
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      Downloads
                    </p>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3 bg-transparent"
                      onClick={onDownloadAll}
                    >
                      <Download className="h-4 w-4" />
                      Download all shots
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3 bg-transparent"
                      onClick={onDownloadUnviewed}
                    >
                      <Download className="text-primary h-4 w-4" />
                      Download unviewed shots
                    </Button>
                  </div>

                  <Separator className="bg-border/50 my-4" />

                  {/* Account Actions */}
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      Account
                    </p>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3 bg-transparent"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive w-full justify-start gap-3 bg-transparent"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete account
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="border-border/50 bg-card/95 backdrop-blur-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="text-destructive h-5 w-5" />
                            Delete Account
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete your account and remove all your data,
                            including all screenshots and schedules.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={onDeleteAccount}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Account
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="notifications"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex h-full flex-col"
              >
                {notifications.length > 0 ? (
                  <>
                    <ScrollArea className="flex-1">
                      <div className="space-y-1 p-2">
                        {notifications.map((notification, index) => (
                          <motion.div
                            key={notification.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={`group relative rounded-lg border p-3 transition-colors ${
                              notification.read
                                ? "bg-muted/30 border-transparent"
                                : "border-primary/30 bg-primary/5"
                            }`}
                          >
                            <div className="pr-8">
                              <div className="flex items-center gap-2">
                                <Bell
                                  className={`h-3.5 w-3.5 ${
                                    notification.read
                                      ? "text-muted-foreground"
                                      : "text-primary"
                                  }`}
                                />
                                <p className="text-sm font-medium">
                                  {notification.title}
                                </p>
                              </div>
                              <p className="text-muted-foreground mt-1 text-xs">
                                {notification.message}
                              </p>
                              <p className="text-muted-foreground mt-2 text-[10px]">
                                {notification.date}
                              </p>
                            </div>
                            <button
                              className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-2 right-2 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={() =>
                                onDismissNotification?.(notification.id)
                              }
                              aria-label="Dismiss notification"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    </ScrollArea>
                    {unreadCount > 0 && (
                      <div className="border-border/50 border-t p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full gap-2"
                          onClick={onMarkAllRead}
                        >
                          <Check className="h-4 w-4" />
                          Mark all as read
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                    <Bell className="text-muted-foreground/30 h-12 w-12" />
                    <p className="text-muted-foreground mt-4 text-sm">
                      No notifications
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <SheetFooter className="border-border/50 border-t p-4">
          <p className="text-muted-foreground text-xs">
            Shooter v1.0.0 - Screenshot automation
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default React.memo(UserControlsOverlay);
