import type { ReactNode } from "react";
import "../src/index.css";

export const metadata = {
  title: "PastPaper Solver — Practice with purpose",
  description: "Rehearse real past exams, then review where to focus next.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
