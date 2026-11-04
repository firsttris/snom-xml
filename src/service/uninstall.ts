import { Service } from "node-windows";
import * as path from "path";

// The script the service was installed with (install.ts): node-windows finds the service's
// files in the folder "daemon" next to it
const scriptPath = path.join(__dirname, "../server.ts");

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
