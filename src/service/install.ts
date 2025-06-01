import { Service } from "node-windows";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const scriptPath = path.join(__dirname, "../server.js");

const svc = new Service({
  name: "SNOM XML Phone Book Server",
  description:
    "Synchronisiert Google Kontakte und stellt sie als XML für SNOM-Telefone bereit",
  script: scriptPath,
  nodeOptions: ["--harmony"],
  env: [
    {
      name: "GOOGLE_CLIENT_ID",
      value: process.env.GOOGLE_CLIENT_ID || "",
    },
    {
      name: "GOOGLE_CLIENT_SECRET",
      value: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  ],
});

svc.on("install", () => {
  console.log("Service installiert");
  svc.start();
});

svc.on("start", () => {
  console.log("Service gestartet");
  console.log("Zugriff auf Dashboard: http://localhost:3000");
  console.log("Zugriff auf SNOM XML: http://localhost:3000/phonebook.xml");
});

svc.on("alreadyinstalled", () => {
  console.log("Der Service ist bereits installiert");
});

svc.on("invalidinstallation", () => {
  console.log("Ungültige Installation gefunden");
});

svc.on("uninstall", () => {
  console.log("Service deinstalliert");
});

svc.on("alreadyuninstalled", () => {
  console.log("Der Service ist bereits deinstalliert");
});

svc.on("error", (error: any) => {
  console.error("Fehler:", error);
});

const args = process.argv.slice(2);
if (args.includes("uninstall")) {
  console.log("Deinstalliere Service...");
  svc.uninstall();
} else {
  console.log("Installiere Service...");
  svc.install();
}
