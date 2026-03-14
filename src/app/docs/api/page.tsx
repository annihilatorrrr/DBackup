"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

export default function ApiDocsPage() {
  return (
    <div style={{ height: "100vh" }}>
      <ApiReferenceReact
        configuration={{
          url: "/openapi.yaml",
          theme: "default",
          metaData: { title: "DBackup API Reference" },
          defaultHttpClient: {
            targetKey: "shell",
            clientKey: "curl",
          },
          agent: {
            disabled: true,
          },
        }}
      />
    </div>
  );
}
