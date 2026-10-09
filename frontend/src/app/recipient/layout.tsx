import type { Metadata } from "next";

export const metadata: Metadata = { title: "Post today's need" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
