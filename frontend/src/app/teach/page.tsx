import type { Metadata } from "next";
import TeacherHome from "@/components/TeacherHome";
import "./teach.css";

export const metadata: Metadata = { title: "TimaLens Lab · Teachers" };

/** The teacher's page: a lesson in, a lab out. */
export default function TeachPage() {
  return <TeacherHome />;
}
