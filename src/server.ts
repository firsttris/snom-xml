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
  // Prüfen, ob Token-Datei existiert
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Token nicht gefunden. Bitte zuerst authentifizieren.");
  }

  // Token laden
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  oauth2Client.setCredentials(token);

  // Alle Kontakte mit rekursiver Funktion abrufen
  const allContacts = await fetchAllContactsRecursively();
  console.log(`Insgesamt ${allContacts.length} Kontakte geladen`);

  // Kontakte in Snom XML umwandeln
  return convertToSnomXML(allContacts);
}

// Rekursive Funktion zum Abrufen aller Kontakte
async function fetchAllContactsRecursively(
  pageToken?: string,
  accumulatedContacts: any[] = []
): Promise<any[]> {
  console.log(`Lade Kontakte${pageToken ? " (nächste Seite)" : ""}...`);

  const response = await peopleApi.people.connections.list({
    resourceName: "people/me",
    pageSize: 100,
    personFields: "names,phoneNumbers",
    pageToken: pageToken,
  });

  const currentPageContacts = response.data.connections || [];
  console.log(`${currentPageContacts.length} Kontakte in dieser Seite geladen`);

  // Aktuelle Seite zu den akkumulierten Kontakten hinzufügen
  const updatedContacts = [...accumulatedContacts, ...currentPageContacts];

  // Prüfen, ob weitere Seiten vorhanden sind
  const nextPageToken = response.data.nextPageToken;
  if (nextPageToken) {
    // Rekursiv die nächste Seite laden und Ergebnisse zusammenführen
    return fetchAllContactsRecursively(nextPageToken, updatedContacts);
  }

  // Keine weiteren Seiten - alle Kontakte zurückgeben
  return updatedContacts;
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

    res.sendFile(path.join(__dirname, "public", "success.html"));
  } catch (error) {
    console.error("Fehler bei der OAuth-Authentifizierung:", error);
    res.status(500).send("Authentifizierung fehlgeschlagen");
  }
});

// Typdefinition für den Token-Status
interface TokenStatus {
  authenticated: boolean;
  authError: string | null;
  contactsCount?: number; // Neue Eigenschaft für die Anzahl der Kontakte
}

// Funktion zur Ermittlung des Token-Status
async function getTokenStatus(): Promise<TokenStatus> {
  // Prüfen, ob Token existiert und Status zurückgeben
  return !fs.existsSync(TOKEN_PATH)
    ? {
        authenticated: false,
        authError: "Token nicht gefunden. Bitte zuerst authentifizieren.",
      }
    : await getStatusFromExistingToken();
}

// Hilfsfunktion zum Auslesen des Status aus einem existierenden Token
async function getStatusFromExistingToken(): Promise<TokenStatus> {
  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));

    // Ablaufdatum formatieren
    const tokenExpiry = token.expiry_date
      ? new Date(token.expiry_date).toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
        })
      : null;

    // Versuche, die Kontakte zu laden
    try {
      const fullPhonebook = await loadGoogleContacts();

      // Zähle die Anzahl der Kontakte im XML
      const contactsCount = (fullPhonebook.match(/<contact /g) || []).length;

      return {
        authenticated: true,
        authError: null,
        contactsCount, // Neue Eigenschaft hinzufügen
      };
    } catch (apiError) {
      // API-Fehler: Token möglicherweise ungültig
      return {
        authenticated: false,
        authError: "Google API-Fehler: " + (apiError as Error).message,
        contactsCount: 0,
      };
    }
  } catch (error) {
    // Fehler beim Lesen oder Parsen des Tokens
    return {
      authenticated: false,
      authError: "Token-Datei ungültig: " + (error as Error).message,
      contactsCount: 0,
    };
  }
}

// API-Endpunkt mit der neuen Funktion
app.get("/api/status", async (req: Request, res: Response) => {
  const status = await getTokenStatus();

  res.json({
    ...status,
    serverUrl: `http://localhost:${port}/phonebook.xml`,
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// GET-Anfrage für Telefonbuch
app.get("/phonebook.xml", async (req: Request, res: Response) => {
  console.log("GET request received for phonebook");

  try {
    // Google Kontakte laden
    const phonebookXML = await loadGoogleContacts();
    res.set("Content-Type", "text/xml");
    res.send(phonebookXML);
  } catch (error) {
    console.error("Fehler beim Laden der Google Kontakte:", error);
    // Im Fehlerfall Standard-XML zurückgeben
    res.set("Content-Type", "text/xml");
    res.send(getDefaultPhonebookXML());
  }
});

// POST-Anfrage für Telefonbuch
app.post("/phonebook.xml", async (req: Request, res: Response) => {
  console.log("POST request received for phonebook");
  console.log("Request body:", req.body);

  try {
    // Google Kontakte laden
    const phonebookXML = await loadGoogleContacts();
    res.set("Content-Type", "text/xml");
    res.send(phonebookXML);
  } catch (error) {
    console.error("Fehler beim Laden der Google Kontakte:", error);
    // Im Fehlerfall Standard-XML zurückgeben
    res.set("Content-Type", "text/xml");
    res.send(getDefaultPhonebookXML());
  }
});

app.listen(port, () => {
  console.log(
    `SNOM XML Phonebook Server läuft auf http://localhost:${port}/phonebook.xml`
  );
  console.log(`Dashboard verfügbar unter http://localhost:${port}`);
  console.log(
    `Authentifiziere dich unter http://localhost:${port}/auth/google`
  );
});
