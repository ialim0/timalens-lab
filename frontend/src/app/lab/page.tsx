import type { Metadata } from "next";
import LabView from "@/components/LabView";

export const metadata: Metadata = { title: "TimaLens Lab" };

export default function LabPage() {
  return <LabView />;
}
