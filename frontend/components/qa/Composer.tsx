"use client";

import { Composer as UiComposer } from "@/components/ui/Composer";
import type { RefObject } from "react";

export function Composer(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return <UiComposer {...props} />;
}
