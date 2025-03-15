require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateText";
const API_KEY = process.env.GEMINI_API_KEY;

app.use(express.static("public"));

const MODEL = "gemini-2.0-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;


async function translateTextBatch(texts, targetLanguage, retries = 3) {
  const sanitizedTexts = texts.map(text => text.replace(/\\\\N/g, "<tag##do##not##translate>").replace(/\\N/g, "<tag##do##not##translate>").replace(/\\n/g, "<tag##do##not##translate>"));
  // console.log(JSON.stringify(sanitizedTexts, null, 2));

  const requestBody = {
    contents: [{
      parts: [{
        text: `Translate the following text to ${targetLanguage}.
        DO NOT replace "<tag##do##not##translate>" with other characters or translate it.
        ONLY return the translated text without any additional explanations, notes, or formatting:

${sanitizedTexts.join('\n')}`
      }]
    }]
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          const waitTime = attempt * 2000;
          console.warn(`Rate limit hit. Retrying in ${waitTime / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      let translatedTexts = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().split("\n") || texts;
      translatedTexts = translatedTexts.map(text => text.replace(/<tag##do##not##translate>/g, "\\n"));
      return translatedTexts || texts;
    } catch (error) {
      console.error("Batch Translation Error:", error);
      if (attempt === retries) return texts;
    }
  }
}
async function translateSubtitles(subtitleText, targetLang = "vi") {
  try {
    const lines = subtitleText.split("\n");
    let translatedLines = [...lines];
    let batch = [];
    let batchIndexMap = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("Dialogue:")) {
        const parts = line.split(",", 9);
        const dialogueText = line.substring(parts.join(",").length + 1);
        batch.push(dialogueText);
        batchIndexMap.push(i);
      }

      if (batch.length === 50 || i === lines.length - 1) {
        if (batch.length > 0) {
          const translatedBatch = await translateTextBatch(batch, targetLang);
          await Promise.all(translatedBatch).then(translations => {
            batchIndexMap.forEach((index, j) => {
              const parts = lines[index].split(",", 9);
              translatedLines[index] = `${parts.join(",")},${translations[j]}`;
            });
          });
          batch = [];
          batchIndexMap = [];
        }
      }
    }

    return translatedLines.join("\n");
  } catch (error) {
    console.error("Subtitle Translation Error:", error);
    return subtitleText;
  }
}

app.post("/upload", upload.single("file"), async (req, res) => {
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const targetLang = req.body.language || "vi"; // Default: Spanish

    try {
        let fileContent = fs.readFileSync(filePath, "utf-8");
        let translatedContent = await translateSubtitles(fileContent, targetLang);

        const translatedFilePath = `uploads/translated_${fileName}`;
        fs.writeFileSync(translatedFilePath, translatedContent, "utf-8");

        res.download(translatedFilePath, `translated_${fileName}`, () => {
            fs.unlinkSync(filePath);
            fs.unlinkSync(translatedFilePath);
        });
    } catch (err) {
        res.status(500).send("Error processing file.");
    }
});

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
