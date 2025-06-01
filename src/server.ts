import express, { Request, Response } from "express";

const app = express();
const port = 3000;

// Middleware zum Parsen von JSON und URL-encodierten Daten
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Beispiel-Telefonbuch XML
const phonebookXML = `<tbook e='2' version='2.0'>
<contact fav="false" vip="false" blocked="false">
  <first_name>Theo</first_name>
  <last_name>Maier</last_name>
  <numbers>
    <number no="25234984723" type="mobile" outgoing_id="0"/>
  </numbers>
</contact>
<contact fav="false" vip="false" blocked="false">
  <first_name>John</first_name>
  <last_name>Doe</last_name>
  <numbers>
    <number no="1234567890" type="mobile" outgoing_id="0"/>
  </numbers>
</contact>
<contact fav="false" vip="false" blocked="false">
  <first_name>Alice</first_name>
  <last_name>Smith</last_name>
  <numbers>
    <number no="9876543210" type="home" outgoing_id="0"/>
  </numbers>
</contact>
</tbook>
`;

// GET-Anfrage für Telefonbuch
app.get("/phonebook.xml", (req: Request, res: Response) => {
  console.log("GET request received for phonebook");
  res.set("Content-Type", "text/xml");
  res.send(phonebookXML);
});

// POST-Anfrage für Telefonbuch
// Snom-Telefone können POST verwenden, z.B. bei Suchfunktionen
app.post("/phonebook.xml", (req: Request, res: Response) => {
  console.log("POST request received for phonebook");
  console.log("Request body:", req);

  // Optional: Implementiere hier Suchfunktionalität basierend auf req.body
  // Beispiel: Wenn das Telefon nach einem Namen sucht

  res.set("Content-Type", "text/xml");
  res.send(phonebookXML);
});

app.listen(port, () => {
  console.log(
    `SNOM XML Phonebook Server läuft auf http://localhost:${port}/phonebook.xml`
  );
  console.log(`Unterstützt GET und POST Anfragen`);
});
