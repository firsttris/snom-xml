import express, { Request, Response } from "express";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { create } from "xmlbuilder2";

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/auth/google/callback"
);

const peopleApi = google.people({ version: "v1", auth: oauth2Client });

const TOKEN_PATH = path.join(__dirname, "token.json");

async function loadGoogleContacts(): Promise<string> {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Token nicht gefunden. Bitte zuerst authentifizieren.");
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  oauth2Client.setCredentials(token);

  const allContacts = await fetchAllContactsRecursively();
  console.log(`Insgesamt ${allContacts.length} Kontakte geladen`);

  return convertToSnomXML(allContacts);
}

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

  const updatedContacts = [...accumulatedContacts, ...currentPageContacts];

  const nextPageToken = response.data.nextPageToken;
  if (nextPageToken) {
    return fetchAllContactsRecursively(nextPageToken, updatedContacts);
  }

  return updatedContacts;
}

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

      contactEle.ele("first_name").txt(name.givenName || "");
      contactEle.ele("last_name").txt(name.familyName || "");

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

  return root.end({ prettyPrint: true, headless: true });
}

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

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

    res.sendFile(path.join(__dirname, "public", "success.html"));
  } catch (error) {
    console.error("Fehler bei der OAuth-Authentifizierung:", error);
    res.status(500).send("Authentifizierung fehlgeschlagen");
  }
});

interface TokenStatus {
  authenticated: boolean;
  authError: string | null;
  contactsCount?: number;
}

async function getTokenStatus(): Promise<TokenStatus> {
  return !fs.existsSync(TOKEN_PATH)
    ? {
        authenticated: false,
        authError: "Token nicht gefunden. Bitte zuerst authentifizieren.",
      }
    : await getStatusFromExistingToken();
}

async function getStatusFromExistingToken(): Promise<TokenStatus> {
  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));

    const tokenExpiry = token.expiry_date
      ? new Date(token.expiry_date).toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
        })
      : null;

    try {
      const fullPhonebook = await loadGoogleContacts();

      const contactsCount = (fullPhonebook.match(/<contact /g) || []).length;

      return {
        authenticated: true,
        authError: null,
        contactsCount,
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

app.get("/phonebook.xml", async (req: Request, res: Response) => {
  console.log("GET request received for phonebook");

  try {
    const phonebookXML = await loadGoogleContacts();
    res.set("Content-Type", "text/xml");
    res.send(phonebookXML);
  } catch (error) {
    console.error("Fehler beim Laden der Google Kontakte:", error);
    res.set("Content-Type", "text/xml");
    res.send(getDefaultPhonebookXML());
  }
});

app.post("/phonebook.xml", async (req: Request, res: Response) => {
  console.log("POST request received for phonebook");
  console.log("Request body:", req.body);

  try {
    const phonebookXML = await loadGoogleContacts();
    res.set("Content-Type", "text/xml");
    res.send(phonebookXML);
  } catch (error) {
    console.error("Fehler beim Laden der Google Kontakte:", error);
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
