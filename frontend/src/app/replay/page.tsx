import type { Metadata } from "next";
import ReplayView from "@/components/ReplayView";
import "./replay.css";

export const metadata: Metadata = { title: "TimaLens Lab · Replay" };

export default function ReplayPage() {
  return <ReplayView />;
}
