import express from "express";
import { createImportRouter } from "./importRoutes";

export function createServer() {
  const app = express();

  app.use(express.json());
  app.use(createImportRouter());

  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  return app;
}

export default createServer;
