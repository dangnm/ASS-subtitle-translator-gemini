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
  let translatedTexts = [];

  for (let text of texts) {
    const requestBody = {
      contents: [{
        parts: [{
          text: `Translate the following subtitle to ${targetLanguage}.
          KEEP the same structure,
          DO NOT insert more new lines
          ONLY return the translated text without any additional explanations, notes, or formatting:

${text}`
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
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
        translatedTexts.push(translatedText);
        break;

      } catch (error) {
        console.error("Batch Translation Error:", error);
        if (attempt === retries) {
          translatedTexts.push(text);
        }
      }
    }
  }

  return translatedTexts;
}

async function translateSubtitles(subtitleText, targetLang = "vi") {
  try {
    const lines = subtitleText.split("\n");
    let sections = [];
    let nonDialoguePart = [];
    let dialogueSections = [];
    let batch = [];

    let isDialogueStarted = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("Dialogue:")) {
        isDialogueStarted = true;
        batch.push(line);
        if (batch.length === 50) {
          dialogueSections.push(batch.join("\n"));
          batch = [];
        }
      } else if (!isDialogueStarted) {
        nonDialoguePart.push(line);
      }
    }

    if (batch.length > 0) {
      dialogueSections.push(batch.join("\n"));
    }

    // console.log("Last dialogue section:", dialogueSections[dialogueSections.length - 1]);
    translatedSections = await translateTextBatch(dialogueSections, targetLang);

    sections.push(nonDialoguePart.join("\n"));
    sections.push(...translatedSections);


    // console.log(sections)
    return sections;
  } catch (error) {
    console.error("Subtitle Translation Error:", error);
    return [subtitleText];
  }
}

app.post("/upload", upload.single("file"), async (req, res) => {
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const targetLang = req.body.language || "vi";

    try {
        let fileContent = fs.readFileSync(filePath, "utf-8");
        let translatedContents = await translateSubtitles(fileContent, targetLang);

        const translatedFilePath = `uploads/translated_${fileName}`;
        fs.writeFileSync(translatedFilePath, translatedContents.join("\n"), "utf-8");

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
