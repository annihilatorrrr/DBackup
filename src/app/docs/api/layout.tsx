import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Reference - DBackup",
  description: "Interactive REST API reference for DBackup.",
};

export default function ApiDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
