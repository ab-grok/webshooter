//Setting site to visitor site for unlogged user; wafter logIn refetch sites, and shots

"use client";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import React, {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logUser, signUser } from "@/lib/actions";
import { logSchema, logType } from "@/lib/zodtypes";
import { Spinner } from "@/components/ui/spinner";
import { useErrContext } from "@/app/(main)/ErrContext";
import { AnimatePresence, motion } from "framer-motion";
import { LogIn } from "lucide-react";
import { timing } from "./Shots";

type Auth = {
  logIn: boolean;
  signUp: boolean;
};

function Auth({ logIn, signUp }: Auth) {
  const { setErrBody } = useErrContext();
  type logInput = "U" | "P" | "";
  const formItems = ["U", "P"];
  const textChangeTimer = useRef<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(false);
  const passRef = useRef<HTMLInputElement | null>(null); // can use oneRef, better optimization.
  const nameRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputOffset = useRef(0);
  const [currInput, setCurrInput] = useState({
    count: 0,
    name: "" as logInput,
  });
  const initRender = useRef(true);
  // const changeTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  // const [textChange, setTextChange] = useState({uname: false, pass: false})

  const logForm = useForm<logType>({
    resolver: zodResolver(logSchema),
    defaultValues: { username: "", password: "" },
  });

  async function formSubmitted(values: logType) {
    setLoading(true);

    let error;
    if (logIn) error = (await logUser(values.password, values.username)).error;
    if (signUp) error = (await signUser({ ...values })).error;

    setLoading(false);

    const l = (logIn ? "Log In" : "Sign Up") + error ? " Error!" : " Success!";
    const eBody = { msg: error || "Welcome " + values.username };

    setErrBody({ ...eBody, danger: !!error, label: l });
  }

  useEffect(() => {
    //separate into user and pass effects -- better optimized.
    if (initRender.current) {
      //This initialises an element for calculating the current width of input text, on every change -- used for anim.
      canvasRef.current = document.createElement("canvas");
      initRender.current = false;
      return;
    }
    if (currInput.count < 5) return;
    if (logIn) return;
    // console.log("timer effect ran");
    if (textChangeTimer.current) clearTimeout(textChangeTimer.current); //setChangingText clears the prev val -- no need to handle different timeouts
    textChangeTimer.current = setTimeout(() => {
      console.log("Auth useEffect timer executed");
      setCurrInput({ name: "", count: 0 });
    }, 3000);
    return () => {
      textChangeTimer.current && clearTimeout(textChangeTimer.current);
    };
  }, [currInput.count]);

  //sets value to form validator and sets value length to setCurrInput
  function inputChanged(e: ChangeEvent<HTMLInputElement>) {
    const name = e.target.name as "username" | "password";
    logForm.setValue(name, e.target.value || "");

    if (logIn) return;
    setCurrInput((p) => ({
      name: name == "username" ? "U" : "P",
      count: e.target.value.length ?? 0,
    }));
    measureText(e.target);
  }

  function measureText(I: HTMLInputElement) {
    //measures just pass text
    if (canvasRef.current && I.value && I.value.length! > 5) {
      const context = canvasRef.current.getContext("2d")!;
      context.font = getComputedStyle(I).font || "16px san-serif";

      const metrics = context.measureText(I.value);
      inputOffset.current = Math.min(metrics.width + 8, 300);
    }
  }

  return (
    <motion.div
      layout
      className={cn(
        "border-border backgrop-blur-4xl rounded-4xl border-2 p-2 px-5 shadow-md",
        logIn ? "logGradient logBox" : "signGradient signBox",
      )}
    >
      <Form {...logForm}>
        <form
          onSubmit={logForm.handleSubmit(formSubmitted)}
          className="flex flex-col space-y-4 p-2 text-white/80"
        >
          <p className="py-auto my-auto h-12 w-full text-center text-3xl font-semibold select-none">
            {logIn ? "Log In" : signUp ? "Sign Up" : ""}
          </p>
          <Separator className="bg-border/50" />
          <section className="flex flex-col space-y-3">
            {formItems.map((f, i) => (
              <FormField
                control={logForm.control}
                key={i}
                name={f == "U" ? "username" : "password"}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f == "U" ? "Username" : "Password"}</FormLabel>
                    <FormControl>
                      <motion.div className="relative flex">
                        <Input
                          {...field}
                          ref={f == "P" ? passRef : nameRef}
                          onChange={inputChanged}
                          className="h-12 w-80 overflow-hidden rounded-full shadow-md ring-white focus:shadow-none"
                          placeholder={f == "U" ? "Username " : "Password"}
                        />
                        <AnimatePresence>
                          {currInput.count > 5 &&
                            currInput.name == (f as logInput) && (
                              <motion.div
                                animate={{
                                  opacity: 1,
                                  x: inputOffset.current + 8,
                                }}
                                initial={{ opacity: 0 }}
                                exit={{ opacity: 0, x: 5 }}
                                className={cn(
                                  `absolute top-[25%] z-10 h-1/2 items-center truncate rounded-full bg-white/20 p-1 font-bold text-stone-500`,
                                )}
                              >
                                Zod Error message
                              </motion.div>
                            )}
                        </AnimatePresence>
                      </motion.div>
                    </FormControl>
                    <FormMessage className="font-bold" />
                  </FormItem>
                )}
              />
            ))}
          </section>
          <motion.section
            layout
            transition={{ ...timing, duration: 0.1 }}
            whileHover={{ y: -5 }}
            whileTap={{ y: -3 }}
            className={cn(
              "logButtonBox active:translate-y-0.2 overflow-hidden rounded-full p-0 select-none",
            )}
          >
            <Button
              type="submit"
              className={cn(
                "h-full w-full cursor-pointer",
                logIn ? "logButtonGradient" : "signButtonGradient",
              )}
              disabled={loading}
            >
              {loading ? (
                //add framer motion
                <Spinner className="h-8 w-8" />
              ) : logIn ? (
                <p className="text-xl font-semibold">Enter Account</p>
              ) : signUp ? (
                <p className="text-xl font-semibold">Create Account</p>
              ) : null}
            </Button>
          </motion.section>
        </form>
      </Form>
    </motion.div>
  );
}

export default React.memo(Auth);
