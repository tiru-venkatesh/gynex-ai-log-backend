const { google } = require("googleapis");

async function exportToGoogleSheet(auth, tables) {

  const sheets = google.sheets({version:"v4", auth});

  const sheet = await sheets.spreadsheets.create({
    resource:{properties:{title:"Gynex Export"}}
  });

  const id = sheet.data.spreadsheetId;

  for (const t of tables) {
    await sheets.spreadsheets.values.update({
      spreadsheetId:id,
      range:`${t.sheet}!A1`,
      valueInputOption:"USER_ENTERED",
      resource:{ values:[ t.columns.map(c=>c.name), ...t.rows.map(r=>Object.values(r)) ] }
    });
  }

  return `https://docs.google.com/spreadsheets/d/${id}`;
}

module.exports = { exportToGoogleSheet };
