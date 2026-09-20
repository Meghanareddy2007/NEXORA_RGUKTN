import type { Metadata } from "next";
import TmsDashboard from "@/components/tms/TmsDashboard";

export const metadata: Metadata = {
  title: "TMS — Track Management System",
};

export default function TmsPage() {
  return <TmsDashboard />;
}
