// components/CronScheduler.tsx
"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Search,
  Play,
  AlertCircle,
  Clock,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import React from "react";
import { siteData, userData } from "@/lib/types";
import { modalState } from "./Navbar";
import { safeCron, safeSite } from "@/lib/utils";
import { scheduleShot } from "@/lib/actions";
import { useErrContext } from "@/app/(main)/ErrContext";
import { cronToText, months, weekDays } from "@/lib/dateformatter";

interface cronScheduler {
  resetForm: number; //math random for resetting after user signs up;
  userData: userData | undefined; //is defined when user is validated/logged in
  setSiteData: (fn: ((prev: setSiteData) => setSiteData) | setSiteData) => void;
  setModalState: (fn: ((prev: modalState) => modalState) | modalState) => void;
}

type setSiteData = siteData | undefined;
type TimeUnit = "minutes" | "hours" | "days" | "weeks" | "months";

interface cronConfig {
  unit: TimeUnit;
  value: number;
}

interface cronText {
  cronConfig: cronConfig;
  customCron: string;
  useCustomCron: boolean;
}

// Generate preset cron expression from passed {unit, value}
function generateCron(config: cronConfig): string {
  const { unit, value } = config;

  switch (unit) {
    case "minutes":
      return `*/${value} * * * *`;
    case "hours":
      return `0 */${value} * * *`;
    case "days":
      return `0 0 */${value} * *`;
    case "weeks":
      return `0 0 * * ${value}`; // Run on specific day of week
    case "months":
      return `0 0 1 */${value} *`;
    default:
      return "0 * * * *"; // Default: every hour
  }
}

function getScheduleDescription({
  cronConfig,
  customCron,
  useCustomCron,
}: cronText): string {
  const { unit, value } = cronConfig;
  if (useCustomCron) return `Custom: ${customCron}`;

  switch (unit) {
    case "minutes":
      return `Every ${value} minute${value > 1 ? "s" : ""}`;
    case "hours":
      return `Every ${value} hour${value > 1 ? "s" : ""}`;
    case "days":
      return `Every ${value} day${value > 1 ? "s" : ""} at midnight`;
    case "weeks":
      return `Every ${weekDays[value]} at midnight`;
    case "months":
      return `Every ${value} month${value > 1 ? "s" : ""} on the 1st`;
    default:
      return "";
  }
}

// Validate cron expression format
function validateCron(cron: string): boolean {
  if (safeCron(cron)) return true;
  return false;
}

const timeUnits: { value: TimeUnit; label: string }[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

const valueOptions: Record<TimeUnit, number[]> = {
  minutes: [10, 15, 30],
  hours: [1, 2, 4, 6, 12],
  days: [1, 2, 3, 7],
  weeks: [1, 2, 3, 4, 5, 6, 7], // Day of week (1 = Sunday);
  months: [1, 2, 3, 6],
};

function CronScheduler({
  userData,
  resetForm,
  setSiteData,
  setModalState,
}: cronScheduler) {
  const [site, setSite] = useState("");
  const [cronConfig, setCronConfig] = useState<cronConfig>({
    unit: "hours",
    value: 1,
  });
  const [customCron, setCustomCron] = useState("");
  const [useCustomCron, setUseCustomCron] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null); //displayed in interface.
  const [localResetForm, setLocalResetForm] = useState(0);
  const { setErrBody } = useErrContext();

  // Memoize cron expression
  const cron = useMemo(() => {
    if (useCustomCron) return customCron;
    return generateCron(cronConfig);
  }, [useCustomCron, customCron, cronConfig]);

  // Validation
  const siteError = useMemo(() => {
    if (!site) return null;
    if (!safeSite(site)) return "Please enter a valid URL";
    return null;
  }, [site]);

  const cronError = useMemo(() => {
    if (useCustomCron && customCron && !validateCron(customCron)) {
      return "Invalid cron expression format";
    }
    return null;
  }, [useCustomCron, customCron]);

  const canSubmit = site && !siteError && !cronError && cron;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    //site data available in top fn, can be called after user reg.
    setSiteData({ site, cron, active: true });

    //Transitions framer to sign up dialog
    if (!userData?.user) {
      setModalState("S");
      return;
    }

    setIsSubmitting(true); //triggers loader
    setError(null);

    //On error: Display danger notification
    const { error } = await scheduleShot({ site, cron });
    if (error) {
      const e = { label: "Schedule Cron Error!", msg: error };
      setErrBody(e);
    }

    //On success: Displays success notification
    const s = {
      label: "Schedule Cron Success",
      msg: `Your cron is now set, it runs ${cronToText(cron)}`,
    };
    setErrBody(s);

    // Reset form
    setLocalResetForm(Math.random());

    setIsSubmitting(false);
  }, [canSubmit, site, cron, userData]);

  //Resets form: Triggered from outside and inside the component
  useEffect(() => {
    if (!resetForm && !localResetForm) return;

    setSite("");
    setCronConfig({ unit: "hours", value: 1 });
    setCustomCron("");
  }, [resetForm, localResetForm]);

  //returns weekday or number -- which serves well for time units besides weekday
  const getValueLabel = (unit: TimeUnit, value: number): string => {
    if (unit == "weeks") return weekDays[value];
    if (unit == "months") return months[value];

    return String(value);
  };

  return (
    //Use Zod schema
    <motion.div
      layout
      className="scheduleGradient cronBox border-border/50 flex gap-6 rounded-3xl p-4 backdrop-blur-3xl"
    >
      {/* URL Input & Preview */}
      <Card className="cardGradient border-border/50 border-2 shadow-md backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="text-primary h-5 w-5" />
            Live Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Enter the URL to capture</Label>
            <div className="relative">
              <Input
                id="url"
                type="url"
                placeholder="example.com/page"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className={`pr-10 ${siteError ? "border-destructive" : ""}`}
              />
              {site && !siteError && (
                <a
                  href={site.startsWith("http") ? site : `https://${site}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary absolute top-1/2 right-3 -translate-y-1/2"
                  aria-label="Open URL in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            {siteError && (
              <p className="text-destructive text-xs">{siteError}</p>
            )}
          </div>

          {/* Live Preview */}
          {site && !siteError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-border bg-muted/30 overflow-hidden rounded-lg border"
            >
              <div className="border-border bg-muted/50 flex items-center justify-between border-b px-3 py-2">
                <span className="text-muted-foreground text-xs">Preview</span>
                <span className="text-muted-foreground truncate font-mono text-xs">
                  {safeSite(site)}
                </span>
              </div>
              <div className="aspect-video">
                <iframe
                  src={site.startsWith("http") ? site : `https://${site}`}
                  className="h-full w-full"
                  title="Website preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Cron Configuration */}

      <Card className="border-border/50 cardGradient border-2 shadow-md backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="text-primary h-5 w-5" />
            Schedule Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Unit/Value Selection */}
          <motion.div layout className="space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Capture every</Label>
              <Button
                variant={useCustomCron ? "outline" : "secondary"}
                size="sm"
                onClick={() => setUseCustomCron(false)}
                className="cursor-pointer text-xs"
              >
                Simple
              </Button>
              <Button
                variant={useCustomCron ? "secondary" : "outline"}
                size="sm"
                onClick={() => setUseCustomCron(true)}
                className="cursor-pointer text-xs"
              >
                Custom
              </Button>
            </div>
            <LayoutGroup>
              {!useCustomCron ? (
                <AnimatePresence key="1" mode="wait">
                  <motion.div
                    key="simple"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.1 }}
                    className="grid grid-cols-2 gap-4"
                  >
                    <motion.div
                      whileHover={{ x: 3 }}
                      transition={{ duration: 1 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="value">Value</Label>
                      <Select
                        value={String(cronConfig.value)}
                        onValueChange={(v) =>
                          setCronConfig((prev) => ({
                            ...prev,
                            value: Number(v),
                          }))
                        }
                      >
                        <SelectTrigger id="value">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {valueOptions[cronConfig.unit].map((val) => (
                            <SelectItem key={val} value={String(val)}>
                              {getValueLabel(cronConfig.unit, val)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>

                    <motion.div
                      whileHover={{ x: -2 }}
                      transition={{ duration: 1 }}
                      className="space-y-2"
                    >
                      <Label className="cursor-pointer" htmlFor="unit">
                        Unit
                      </Label>
                      <Select
                        value={cronConfig.unit}
                        onValueChange={(v) =>
                          setCronConfig({
                            unit: v as TimeUnit,
                            value: valueOptions[v as TimeUnit][0],
                          })
                        }
                      >
                        <SelectTrigger className="cursor-pointer" id="unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {timeUnits.map((unit) => (
                            <SelectItem
                              className="cursor-pointer"
                              key={unit.value}
                              value={unit.value}
                            >
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>
                  </motion.div>
                </AnimatePresence>
              ) : (
                <AnimatePresence key="2" mode="wait">
                  <motion.div
                    key="custom"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.1 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="custom-cron">Cron Expression</Label>
                    <Input
                      id="custom-cron"
                      placeholder="* * * * *"
                      value={customCron}
                      onChange={(e) => setCustomCron(e.target.value)}
                      className={`font-mono ${cronError ? "border-destructive" : ""}`}
                    />
                    <AnimatePresence>
                      {cronError && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="text-destructive text-xs"
                        >
                          {cronError}
                        </motion.p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        Format: minute hour day-of-month month day-of-week
                      </p>
                    </AnimatePresence>
                  </motion.div>
                </AnimatePresence>
              )}
            </LayoutGroup>
          </motion.div>

          {/* Schedule Preview */}
          <div className="border-border bg-muted/30 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Schedule:</span>
              <span className="text-sm font-medium">
                {getScheduleDescription({
                  cronConfig,
                  customCron,
                  useCustomCron,
                })}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Cron:</span>
              <code className="text-primary font-mono text-sm">{cron}</code>
            </div>
          </div>

          {/* Error/Success Messages */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </motion.div>
            )}
            //use errBody
            {/* {success && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Alert className="border-primary/50 bg-primary/10">
                  <Check className="text-primary h-4 w-4" />
                  <AlertDescription className="text-primary">
                    Cron job scheduled successfully!
                  </AlertDescription>
                </Alert>
              </motion.div>
            )} */}
          </AnimatePresence>

          {/* Submit Button */}
          <Button
            className="w-full cursor-pointer gap-2"
            disabled={!canSubmit || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {!userData?.user
              ? "Sign Up"
              : isSubmitting
                ? "Setting Schedule..."
                : "Schedule Capture"}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default React.memo(CronScheduler);
