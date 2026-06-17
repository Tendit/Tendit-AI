import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // Return JSON 404 for unknown /api/* routes instead of falling through to the SPA.
  // Without this, vulnerability scanners hitting /api/.env, /api/phpinfo.php, etc.
  // would receive a 200 OK with the React index.html — making the app appear vulnerable.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  // fall through to index.html if the file doesn't exist (SPA client-side routing)
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
