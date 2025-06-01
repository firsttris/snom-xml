import express, { Request, Response } from "express";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { create } from "xmlbuilder2";

dotenv.config();

const app = express();
const port = 3000;

// Middleware zum Parsen von JSON und URL-encodierten Daten
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Google OAuth2 Konfiguration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/auth/google/callback"
);

// Google People API Client
const peopleApi = google.people({ version: "v1", auth: oauth2Client });

// Token-Speicherung
const TOKEN_PATH = path.join(__dirname, "token.json");

// Kontakte aus Google laden und in Snom XML umwandeln
async function loadGoogleContacts(): Promise<string> {
  try {
    // Prüfen, ob Token-Datei existiert
    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
      oauth2Client.setCredentials(token);
    } else {
      console.log("Token nicht gefunden. Bitte zuerst authentifizieren.");
      return getDefaultPhonebookXML();
    }

    // Kontakte abrufen
    const response = await peopleApi.people.connections.list({
      resourceName: "people/me",
      pageSize: 100,
      personFields: "names,phoneNumbers",
    });

    // Kontakte in Snom XML umwandeln
    return convertToSnomXML(response.data.connections || []);
  } catch (error) {
    console.error("Fehler beim Laden der Google Kontakte:", error);
    return getDefaultPhonebookXML();
  }
}

// Konvertieren der Google Kontakte in Snom XML Format
function convertToSnomXML(contacts: any[]): string {
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("tbook", {
    e: "2",
    version: "2.0",
  });

  contacts.forEach((contact) => {
    const name = contact.names?.[0];
    const phoneNumbers = contact.phoneNumbers || [];

    if (name && phoneNumbers.length > 0) {
      const contactEle = root.ele("contact", {
        fav: "false",
        vip: "false",
        blocked: "false",
      });

      // Namen
      contactEle.ele("first_name").txt(name.givenName || "");
      contactEle.ele("last_name").txt(name.familyName || "");

      // Telefonnummern
      const numbersEle = contactEle.ele("numbers");

      phoneNumbers.forEach((phone: any) => {
        const number = phone.value?.replace(/\s+/g, "") || "";
        const type = mapPhoneType(phone.type);

        if (number) {
          numbersEle.ele("number", {
            no: number,
            type: type,
            outgoing_id: "0",
          });
        }
      });
    }
  });

  // Formatiertes XML zurückgeben
  return root.end({ prettyPrint: true, headless: true });
}

// Telefonnummerntypen von Google zu Snom mappen
function mapPhoneType(googleType: string): string {
  const typeMap: { [key: string]: string } = {
    home: "home",
    work: "office",
    mobile: "mobile",
    main: "office",
    other: "other",
  };

  return typeMap[googleType?.toLowerCase()] || "other";
}

// Standard-XML, falls Google-Integration fehlschlägt
function getDefaultPhonebookXML(): string {
  return `<tbook e='2' version='2.0'>
<contact fav="false" vip="false" blocked="false">
  <first_name>John</first_name>
  <last_name>Doe</last_name>
  <numbers>
    <number no="1234567890" type="mobile" outgoing_id="0"/>
  </numbers>
</contact>
</tbook>`;
}

// Auth-Routes
app.get("/auth/google", (req: Request, res: Response) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/contacts.readonly"],
  });
  res.redirect(url);
});

app.get("/auth/google/callback", async (req: Request, res: Response) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // Token speichern
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

    res.send(
      "Authentifizierung erfolgreich! Du kannst dieses Fenster jetzt schließen."
    );
  } catch (error) {
    console.error("Fehler bei der OAuth-Authentifizierung:", error);
    res.status(500).send("Authentifizierung fehlgeschlagen");
  }
});

// GET-Anfrage für Telefonbuch
app.get("/phonebook.xml", async (req: Request, res: Response) => {
  console.log("GET request received for phonebook");

  // Google Kontakte laden
  const phonebookXML = await loadGoogleContacts();

  res.set("Content-Type", "text/xml");
  res.send(phonebookXML);
});

// POST-Anfrage für Telefonbuch
app.post("/phonebook.xml", async (req: Request, res: Response) => {
  console.log("POST request received for phonebook");
  console.log("Request body:", req.body);

  // Google Kontakte laden
  const phonebookXML = await loadGoogleContacts();

  res.set("Content-Type", "text/xml");
  res.send(phonebookXML);
});

app.listen(port, () => {
  console.log(
    `SNOM XML Phonebook Server läuft auf http://localhost:${port}/phonebook.xml`
  );
  console.log(
    `Authentifiziere dich unter http://localhost:${port}/auth/google`
  );
});
