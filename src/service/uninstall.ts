import { Service } from "node-windows";
import * as path from "path";

// Pfad zur kompilierten server.js
const scriptPath = path.join(__dirname, "../server.js");

const svc = new Service({
  name: "SNOM XML Phone Book Server",
  script: scriptPath,
});

svc.on("uninstall", () => {
  console.log("Service erfolgreich deinstalliert.");
});

svc.on("error", (error: any) => {
  console.error("Fehler:", error);
});

// Deinstallation starten
svc.uninstall();
