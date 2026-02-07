// =====================================
// GYNEX AI - OCR + GITHUB MODELS CHAT BACKEND
// =====================================

require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { exec } = require("child_process");

// GitHub Models (OpenAI compatible)
const OpenAI = require("openai");

// --------------------
// APP INIT
// --------------------
const app = express();
app.use(cors());
app.use(express.json());

// --------------------
// FILE UPLOAD
// --------------------
const upload = multer({ dest: "uploads/" });

// --------------------
// API KEY FOR OCR
// --------------------
const API_KEY = "GYNEX_OCR_123";

function checkKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Invalid API Key" });
  }
  next();
}

// --------------------
// GITHUB MODELS CLIENT
// --------------------
const aiClient = new OpenAI({
  apiKey: process.env.GITHUB_TOKEN,
  baseURL: "https://models.inference.ai.azure.com"
});

// --------------------
// PDF → IMAGE
// --------------------
function pdfToImages(pdfPath, outDir) {
  return new Promise((resolve, reject) => {
    exec(
      `pdftoppm -r 300 "${pdfPath}" "${outDir}/page" -png`,
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// --------------------
// HEALTH
// --------------------
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

      // ---------- TXT ----------
      if (name.endsWith(".txt")) {
        const text = fs.readFileSync(filePath, "utf8");
        return res.json({ text });
      }

      // ---------- PDF ----------
      if (name.endsWith(".pdf")) {

        const outDir = "uploads/pdf_images";
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        await pdfToImages(filePath, outDir);

        const pages = fs.readdirSync(outDir);
        let finalText = "";

        for (const img of pages) {

          const imgPath = path.join(outDir, img);
          const clean = imgPath + "_clean.png";

          await sharp(imgPath)
            .grayscale()
            .resize({ width: 2400 })
            .sharpen()
            .normalize()
            .toFile(clean);

          const result = await Tesseract.recognize(clean, "eng");
          finalText += result.data.text + "\n";
        }

        return res.json({ text: finalText });
      }

      // ---------- IMAGE ----------
      const clean = filePath + "_clean.png";

      await sharp(filePath)
        .grayscale()
        .resize({ width: 2400 })
        .sharpen()
        .normalize()
        .toFile(clean);

      const result = await Tesseract.recognize(clean, "eng");

      return res.json({ text: result.data.text });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "OCR failed" });
    }
  }
);

// =================================================
// AI CHAT (GITHUB MODELS)
// =================================================
app.post("/analyze", async (req, res) => {
  try {

    const { text, question } = req.body;

    if (!process.env.GITHUB_TOKEN) {
      return res.status(500).json({ error: "Missing GITHUB_TOKEN" });
    }

    const prompt = `
You are a professional document assistant.

DOCUMENT:
${text}

USER QUESTION:
${question || "Give a short clear summary"}
`;

    const response = await aiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3
    });

    res.json({
      answer: response.choices[0].message.content
    });

  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

// --------------------
// START SERVER
// --------------------
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("GYNEX AI backend running on port", PORT);
});
