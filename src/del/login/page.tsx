//Setting site to visitor site for unlogged user; wafter login refetch sites, and shots

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
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ErrDialog } from "@/components/ErrorDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logUser } from "@/lib/actions";
import { logSchema, logType } from "@/lib/zodtypes";
import { Spinner } from "@/components/ui/spinner";

export default function Login({ isMobile }: { isMobile?: boolean }) {
  type logInput = "u" | "p" | "";
  const formItems = ["username", "password"];
  const [dialog, setDialog] = useState({ msg: "", danger: false });
  const textChangeTimer = useRef<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(false);
  const [formType, setFormType] = useState<"login" | "signup">("login");
  const passRef = useRef<HTMLInputElement | null>(null); // can use oneRef, better optimization.
  const nameRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputOffset = useRef({ user: 0, pass: 0 });
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

  async function logSubmitted(values: logType) {
    setLoading(true);

    const { error } = await logUser(values.password, values.username);
    setLoading(false);

    //set to context -- not local
    setDialog({ msg: error || "Successful!", danger: error ? true : false });
  }

  useEffect(() => {
    //separate into user and pass effects -- better optimized.
    if (initRender.current) {
      //This initialises an element for calculating the current width of input text, on every change -- used for anim.
      canvasRef.current = document.createElement("canvas");
      initRender.current = false;
      return;
    }
    // if (currInput.count < 5) return;
    // console.log("timer effect ran");
    if (textChangeTimer.current) clearTimeout(textChangeTimer.current); //setChangingText clears the prev val -- no need to handle different timeouts
    textChangeTimer.current = setTimeout(() => {
      console.log("timer executed");
      setCurrInput((p) => ({ name: "", count: p.count }));
    }, 3000);
    return () => {
      textChangeTimer.current && clearTimeout(textChangeTimer.current);
    };
  }, [currInput.count]);

  function inputChanged(e: ChangeEvent<HTMLInputElement>) {
    const name = e.target.name as "username" | "password";
    logForm.setValue(name, e.target.value || "");
    console.log("name from inputChanged: ", name);

    setCurrInput((p) => ({
      name: name == "username" ? "u" : "p",
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
      inputOffset.current.pass = metrics.width + 8;
    }
  }

  return (
    <div className="border-border/80 h-full w-full overflow-auto border-2 bg-black p-2 px-5">
      <ErrDialog msg={dialog.msg} danger={dialog.danger} />
      <Form {...logForm}>
        <form
          onSubmit={logForm.handleSubmit(logSubmitted)}
          className="flex flex-col space-y-4 overflow-hidden p-2 text-white/80"
        >
          <section className="h-12 w-full text-center text-4xl font-semibold select-none">
            {formType == "login" ? "Log In" : "Sign Up"}
          </section>
          <Separator className="bg-border/50" />
          <section className="flex flex-col space-y-3">
            {formItems.map((a, i) => (
              <FormField
                control={logForm.control}
                key={i}
                name={a as "username" | "password"}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {a.charAt(0).toUpperCase() + a.slice(1)}
                    </FormLabel>
                    <FormControl>
                      <div className="relative flex">
                        <Input
                          {...field}
                          ref={a == "password" ? passRef : nameRef}
                          onChange={inputChanged}
                          className="h-12 overflow-hidden rounded-full shadow-md ring-white focus:shadow-none"
                          placeholder=""
                        />
                        <span
                          className={cn(
                            `absolute top-[25%] h-1/2 items-center truncate rounded-full bg-white/20 p-1 font-bold text-stone-500`,
                            a == "password" && currInput?.count
                              ? "flex"
                              : "hidden",
                          )}
                          style={{ left: `${inputOffset.current.pass + 8}px` }}
                        >
                          Writing password...
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage className="font-bold" />
                  </FormItem>
                )}
              />
            ))}
          </section>
          <Button
            type="submit"
            disabled={loading}
            className={cn(
              "min-h-16 cursor-pointer overflow-hidden rounded-full shadow-md transition-all select-none hover:-translate-y-0.5 hover:bg-green-600/60 active:scale-95 active:shadow-none",
            )}
          >
            {loading ? (
              //add framer motion
              <Spinner className="h-8 w-8" />
            ) : formType == "login" ? (
              <p className="text-2xl font-semibold">Login</p>
            ) : (
              <p className="text-2xl font-semibold">Signup</p>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
