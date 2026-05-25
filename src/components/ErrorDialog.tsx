//src/components/ErrorDialog.tsx
"use client";

import { useErrContext } from "@/app/(main)/ErrContext";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { AlertCircle, RefreshCcw } from "lucide-react";

export function ErrDialog() {
  const { errBody, setErrBody } = useErrContext(); //declare danger == false' for !danger
  const [anim, setAnim] = useState({ a: false, b: false });

  useEffect(() => {
    console.log(
      "in errDialog, msgProp: ",
      errBody.msg,
      " dangerProp: ",
      errBody.danger,
      " errBody: ",
      JSON.stringify(errBody),
    );
    if (errBody?.msg) {
      setAnim({ a: true, b: false });
      setTimeout(() => {
        setAnim({ a: true, b: true });
        if (errBody.fn) return;
        setTimeout(() => {
          exitAnim();
        }, 5000);
      }, 1000);
    }
  }, [errBody?.msg]);

  function exitAnim() {
    setAnim({ a: true, b: false });
    setTimeout(() => {
      setAnim({ a: false, b: false });
    }, 1000);
  }

  function handleClick() {
    errBody?.fn?.();
    exitAnim();
  }

  return (
    //animate presence
    <AnimatePresence>
      {errBody.msg && (
        <motion.main
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }} // how do I animate the border radius property?
          whileHover={{ y: -1 }}
          transition={{
            type: "spring",
            damping: 10,
            stiffness: 80,
            duration: 0.5,
          }}
          className={cn(
            //fix layout for both mobile and desktop;
            "group/main ring-border absolute top-20 left-1/2 z-5 flex -translate-x-1/2 items-center justify-center rounded-4xl bg-linear-180 p-1 px-8 py-4 font-semibold text-white/80 shadow-md ring-2 shadow-black backdrop-blur-xl",
            errBody?.danger == false
              ? "from-stone-600/10 to-stone-400/20"
              : "from-red-300/10 to-red-400/20",
          )}
        >
          <motion.div className="flex flex-col gap-2">
            <motion.p
              id="header"
              className={cn(
                "border-border flex items-center gap-2 truncate rounded-4xl p-2",
                errBody.danger ? "text-destructive" : "text-white",
              )}
            >
              {errBody?.danger != false && (
                <AlertCircle className="text-destructive h-7 w-7" />
              )}{" "}
              {errBody.msg
                ? errBody?.label
                  ? errBody.label
                  : "App Error!"
                : ""}
            </motion.p>
            {/* figuring out how to animate heihgt increase on the main element. I think two options wonder which animates it cleanly:  I wonder if I should set a literal height property in animate and toggle bwtween two states using anim.b or I can just set set the element to render on anim.b and have framer motion automatically smoothly increase the container height to fit element?   */}
            {/* I need the height to only contain the label to start, and then expand to contain the message and/or actions */}

            <AnimatePresence>
              {errBody.msg && (
                <motion.p
                  id="message"
                  className="bg-cardInner flex items-center overflow-hidden rounded-xl p-4 font-normal"
                >
                  {errBody?.msg || ""}
                </motion.p>
              )}
              {errBody.fnName && (
                <motion.p
                  // this is hidden if not errBody.fn and if errBody.fn animates in on anim.b

                  id="actions"
                  whileHover={{ scaleY: 1.05 }}
                  transition={{ duration: 1000 }}
                  className={cn("flex justify-center gap-2")}
                  layout
                >
                  <Button
                    onClick={handleClick}
                    className="text-md text-label w-1/3 cursor-pointer rounded-4xl bg-transparent font-semibold shadow-sm"
                  >
                    <RefreshCcw className="h-7 w-7" />
                    {errBody.fnName}
                  </Button>
                  <Button
                    onClick={() => setErrBody({})}
                    className="text-md text-label w-1/3 cursor-pointer rounded-4xl bg-transparent font-semibold shadow-sm transition-all"
                  >
                    Ok
                  </Button>
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.main>
      )}
    </AnimatePresence>
  );
}
