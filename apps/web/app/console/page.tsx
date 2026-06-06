import { Suspense } from "react";
import { Console } from "@/components/Console";

export default function ConsolePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Console />
    </Suspense>
  );
}
