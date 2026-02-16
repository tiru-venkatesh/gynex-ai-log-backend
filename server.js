// =====================================
// GYNEX AI - DOCUMENT INTELLIGENCE BACKEND
// =====================================

require("dotenv").config();
console.log("TOKEN:", process.env.GITHUB_TOKEN);
const { buildAdvancedExcel } = require("./services/advancedExcelWriter");
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const pdfParse = require("pdf-parse");
const pLimit = require("p-limit").default;
const { exec } = require("child_process");
const OpenAI = require("openai");

const { addDocuments, search } = require("./services/vectorStore");

// --------------------
// APP INIT
// --------------------
const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

// --------------------
// SECURITY
// --------------------
const API_KEY = process.env.OCR_KEY || "GYNEX_OCR_123";

function checkKey(req, res, next) {
  if (req.headers["x-api-key"] !== API_KEY) {
    return res.status(401).json({ error: "Invalid API Key" });
  }
  next();
}

// --------------------
// AI CLIENT
// --------------------
const aiClient = new OpenAI({
  apiKey: process.env.GITHUB_TOKEN,
  baseURL: "https://models.github.ai/inference",
  defaultHeaders: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
  }
});

function safeJSON(text) {
  if (!text) throw new Error("Empty AI response");

  // Remove markdown fences
  text = text.replace(/```json/g, "");
  text = text.replace(/```/g, "");

  // Trim
  text = text.trim();

  return JSON.parse(text);
}

// --------------------
const limit = pLimit(4);

async function aiBuildTable(text) {

  const r = await aiClient.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{
    role: "user",
    content: `
Analyze this document and build clean tables.

Rules:
- Each table must have: 
  - sheet (string)
  - rows (array of objects)
- All rows inside one table MUST use SAME keys
- Use short professional column names
- Convert numbers to numbers
- Remove currency symbols
- Remove empty columns

Return ONLY JSON.

DOCUMENT:
${text}
`
  }]
});

return safeJSON(r.choices[0].message.content);
}
// =================================================
// UTILS
// =================================================

function cleanText(text) {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

function chunkText(text, size = 2500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    const part = text.slice(i, i + size);
    if (part.trim().length > 50) {
      chunks.push(part);
    }
  }
  return chunks;
}

// =================================================
// PDF → IMAGE (WINDOWS SAFE)
// =================================================

function pdfToImages(pdfPath, outDir) {
  return new Promise((resolve, reject) => {
    exec(
      `pdftoppm -r 300 "${pdfPath}" "${outDir}/page" -png`,
      err => err ? reject(err) : resolve()
    );
  });
}

// =================================================
// HYBRID PDF EXTRACTION
// =================================================

async function extractFromPDF(pdfPath) {

  // Digital text first
  const buffer = fs.readFileSync(pdfPath);
  const parsed = await pdfParse(buffer);

  if (parsed.text && parsed.text.trim().length > 1000) {
    return parsed.text.split("\f");
  }

  // OCR fallback
  const outDir = "uploads/pdf_pages";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  await pdfToImages(pdfPath, outDir);

  const images = fs.readdirSync(outDir).sort();
  const pages = [];

  await Promise.all(
    images.map(img =>
      limit(async () => {

        const imgPath = path.join(outDir, img);
        const cleanImg = imgPath + "_clean.png";

        await sharp(imgPath)
          .grayscale()
          .resize({ width: 2600 })
          .normalize()
          .sharpen()
          .rotate()
          .toFile(cleanImg);

        const r = await Tesseract.recognize(
          cleanImg,
          "eng+hin+tam+tel"
        );

        if (r.data.text && r.data.text.trim().length > 0) {
          pages.push(r.data.text);
        }
      })
    )
  );

  fs.rmSync(outDir, { recursive: true, force: true });

  return pages;
}

// =================================================
// FALLBACK AI
// =================================================

async function fallbackAI(text, question) {

  const final = await aiClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `
You are a document assistant.

DOCUMENT:
${text}

QUESTION:
${question}
`
    }]
  });

  return final.choices[0].message.content;
}

// =================================================
// RAG PIPELINE
// =================================================

async function analyzeWithVector(pages, question) {

  let allChunks = [];

  pages.forEach(p => {
    const cleaned = cleanText(p);
    if (cleaned.length > 50) {
      allChunks.push(...chunkText(cleaned));
    }
  });

  if (allChunks.length === 0) {
    return fallbackAI(pages.join("\n"), question);
  }

  await addDocuments(allChunks);

  const matches = await search(question, 6);

  if (!matches || matches.length === 0) {
    return fallbackAI(pages.join("\n"), question);
  }

  const context = matches.join("\n");

  const final = await aiClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `
Answer using ONLY this context:

${context}

Question: ${question}
`
    }]
  });

  return final.choices[0].message.content;
}

// =================================================
// HEALTH
// =================================================

app.get("/", (req, res) => {
  res.send("GYNEX AI Backend Running");
});

// =================================================
// OCR ENDPOINT
// =================================================

app.post(
  "/extract-text",
  checkKey,
  upload.single("file"),
  async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const name = req.file.originalname.toLowerCase();
      let pages = [];

      if (name.endsWith(".txt")) {
        pages = [fs.readFileSync(filePath, "utf8")];
      }

      else if (name.endsWith(".pdf")) {
        pages = await extractFromPDF(filePath);
      }

      else {
        const cleanImg = filePath + "_clean.png";

        await sharp(filePath)
          .grayscale()
          .resize({ width: 2600 })
          .normalize()
          .sharpen()
          .rotate()
          .toFile(cleanImg);

        const r = await Tesseract.recognize(
          cleanImg,
          "eng+hin+tam+tel"
        );

        pages = [r.data.text];
      }

      fs.unlinkSync(filePath);

      res.json({
        pages: pages.length,
        text: pages.join("\n")
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "OCR failed" });
    }
  }
);

// =================================================
// AI ANALYZE
// =================================================
function bigChunks(text, size = 10000){
  const arr = [];
  for(let i = 0; i < text.length; i += size){
    arr.push(text.slice(i, i + size));
  }
  return arr;
}
async function aiBuildTables(text) {

  const r = await aiClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `
Convert this document into structured tables.

IMPORTANT:
- Do NOT summarize.
- Do NOT drop rows.
- Include ALL rows exactly as they appear.
- If many rows exist, include all.
- Return JSON ONLY.

Format:

[
 { "sheet":"Sheet Name", "rows":[ {...}, {...} ] }
]

DOCUMENT:
${text}
`
    }]
  });

  return safeJSON(r.choices[0].message.content);
}

app.post("/analyze", async (req, res) => {

  try {

    const { text, question } = req.body;

    const pages = Array.isArray(text) ? text : [text];

    const answer = await analyzeWithVector(pages, question);

    res.json({ answer });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI failed" });
  }
});

async function aiBuildTables(text) {

  const r = await aiClient.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [{
      role: "user",
      content: `
You are a data extraction engine.

Rules:
- Convert document into MULTIPLE logical tables
- Never summarize
- Never drop rows
- Every row must be preserved
- Same keys inside one table
- Numbers must be numbers
- Return JSON ONLY

Format:
[
 { "sheet":"Sheet Name", "rows":[ {...}, {...} ] }
]

DOCUMENT:
${text}
`
    }]
  });

  return safeJSON(r.choices[0].message.content);
}

function bigChunks(text, size = 12000) {
  const arr = [];
  for (let i = 0; i < text.length; i += size) {
    arr.push(text.slice(i, i + size));
  }
  return arr;
}
// =================================================
// ADVANCED EXCEL ENDPOINT
// =================================================
app.post("/text-to-excel-advanced", async (req, res) => {
  try {

    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const fullText = Array.isArray(text) ? text.join("\n") : text;

    const chunks = bigChunks(fullText);
    let allTables = [];

    for (const c of chunks) {
      try {
        const tables = await aiBuildTables(c);
        if (Array.isArray(tables)) {
          allTables.push(...tables);
        }
      } catch {
        console.log("⚠️ Chunk failed, skipping");
      }
    }

    if (allTables.length === 0) {
      return res.status(400).json({
        error: "No tables detected from document"
      });
    }

    const filePath = `uploads/${Date.now()}.xlsx`;

    await buildAdvancedExcel(allTables, filePath);

    res.download(filePath);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Excel generation failed" });
  }
});
app.post("/text-to-excel", async (req, res) => {
  try {
    const filePath = `uploads/${Date.now()}.xlsx`;

    await buildAdvancedExcel(allTables, filePath);

    res.download(filePath);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Excel generation failed" });
  }

});

// =================================================
// START SERVER
// =================================================

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("GYNEX AI running on port", PORT);
});
