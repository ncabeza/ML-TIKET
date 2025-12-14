import express from "express";
import { createImportRouter } from "./importRoutes";

export function createServer() {
  const app = express();
  app.use(express.json());

  app.use("/api/import", createImportRouter());

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const app = createServer();
  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
}
