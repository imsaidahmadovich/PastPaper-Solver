"use client";

import dynamic from "next/dynamic";

const PastPaperApp = dynamic(() => import("../../src/App"), { ssr: false });

export default function PastPaperAppClient() {
  return <PastPaperApp />;
}
