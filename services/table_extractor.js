import { exec } from "child_process";
import fs from "fs";
import path from "path";

/*
 Uses Tabula (Java) to extract tables
 Returns array of tables
*/

export function extractTablesFromPDF(pdfPath) {
  return new Promise((resolve, reject) => {

    const outputFile = pdfPath.replace(".pdf", ".json");

    const cmd = `
      tabula-java -a 0,0,100,100 
      -f JSON 
      -o "${outputFile}" 
      "${pdfPath}"
    `;

    exec(cmd, (error) => {
      if (error) return reject(error);

      const data = JSON.parse(fs.readFileSync(outputFile));
      resolve(data);
    });

  });
}
