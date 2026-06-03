"use client";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useState,
} from "react";

// Each component can render a site having it's own state, no need for general storage in context

export type errBody = {
  msg?: string;
  danger?: boolean; //is true on default.
  label?: string;
  fn?: () => void;
  fnName?: string;
};

type ErrContextType = {
  errBody: errBody;
  setErrBody: Dispatch<SetStateAction<errBody>>;
};

const ErrorContext = createContext({} as ErrContextType); //create context with state and setter type

//export context then it can be imported by wrapped components
export function useErrContext() {
  return useContext(ErrorContext);
}

export function ErrContext({ children }: React.PropsWithChildren) {
  const [errBody, setErrBody] = useState({} as errBody);

  return (
    <ErrorContext.Provider value={{ errBody, setErrBody }}>
      {children}
    </ErrorContext.Provider>
  );
}
