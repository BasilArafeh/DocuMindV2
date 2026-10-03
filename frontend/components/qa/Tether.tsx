"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TetherValue = {
  activeN: number;
  hoveredN: number | null;
  displayN: number;
  setHoveredN: (n: number | null) => void;
  selectN: (n: number) => void;
};

const TetherContext = createContext<TetherValue | null>(null);

export function TetherProvider({
  children,
  citationCount,
  onSelect,
}: {
  children: ReactNode;
  citationCount: number;
  onSelect?: (n: number) => void;
}) {
  const [activeN, setActiveN] = useState(1);
  const [hoveredN, setHoveredN] = useState<number | null>(null);

  const selectN = useCallback(
    (n: number) => {
      setActiveN(n);
      onSelect?.(n);
    },
    [onSelect],
  );

  const displayN = hoveredN ?? Math.min(Math.max(activeN, 1), Math.max(citationCount, 1));

  const value = useMemo(
    () => ({ activeN, hoveredN, displayN, setHoveredN, selectN }),
    [activeN, hoveredN, displayN, selectN],
  );

  return <TetherContext.Provider value={value}>{children}</TetherContext.Provider>;
}

export function useTether() {
  return useContext(TetherContext);
}
