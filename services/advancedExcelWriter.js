const ExcelJS = require("exceljs");

async function buildAdvancedExcel(tables, outputPath) {

  const workbook = new ExcelJS.Workbook();

  for (const table of tables) {

    let baseName = table.sheet || "Sheet";
let name = baseName;
let i = 1;

while (workbook.getWorksheet(name)) {
  name = `${baseName}_${i++}`;
}

const sheet = workbook.addWorksheet(name);


    // -------------------------
    // AUTO DETECT COLUMNS
    // -------------------------
    if (!table.rows || table.rows.length === 0) continue;

    const columns = Object.keys(table.rows[0]).map(key => ({
      header: key,
      key: key,
      width: 18
    }));

    sheet.columns = columns;

    // -------------------------
    // ADD ROWS
    // -------------------------
    table.rows.forEach(row => {
      sheet.addRow(row);
    });

    // -------------------------
    // STYLE HEADER
    // -------------------------
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center" };

    // -------------------------
    // FREEZE HEADER
    // -------------------------
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  await workbook.xlsx.writeFile(outputPath);
}

module.exports = { buildAdvancedExcel };
