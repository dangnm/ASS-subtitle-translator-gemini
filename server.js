require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const upload = multer({ dest: "uploads/" });

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateText";
const API_KEY = process.env.GEMINI_API_KEY;

app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const MODEL = "gemini-2.0-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;


async function translateTextBatch(texts, targetLanguage, retries = 3) {
  let translatedTexts = [];
  let processedItems = 0;
  let totalItems = texts.length;

  for (let text of texts) {
    const requestBody = {
      contents: [{
        parts: [{
          text: `Translate the following subtitle to ${targetLanguage}.
          KEEP the same structure,
          DO NOT insert more new lines,
          DO NOT remove or modify "Dialogue:" at the beginning of a line.
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
    processedItems++;
    if (io) {
      io.emit("file_progress", {
        processed: processedItems,
        total: totalItems,
        percent: Math.round((processedItems / totalItems) * 100),
      });
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

app.post("/upload", upload.array("files", 10), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).send("No files uploaded.");
    }

    const targetLang = req.body.language || "vi";
    const outputFolder = path.join("uploads", `translated_${Date.now()}`);
    fs.mkdirSync(outputFolder, { recursive: true });

    let totalFiles = req.files.length;
    let processedFiles = 0;

    for (let file of req.files) {
        let fileContent = fs.readFileSync(file.path, "utf-8");

        // Đợi một khoảng thời gian giữa các lần gọi API để tránh rate limit
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 giây delay

        let translatedContents;
        try {
            translatedContents = await translateSubtitles(fileContent, targetLang);
        } catch (error) {
            console.error(`Error translating file ${file.originalname}:`, error);
            continue; // Bỏ qua file lỗi và tiếp tục
        }

        let translatedFilePath = path.join(outputFolder, file.originalname.replace(".ass", `.${targetLang}.ass`));
        fs.writeFileSync(translatedFilePath, translatedContents.join("\n"), "utf-8");

        processedFiles++;
        io.emit("progress", { processed: processedFiles, total: totalFiles });
    }

    // Tạo file ZIP sau khi tất cả file đã được dịch
    const zipFilePath = path.join("uploads", `${path.basename(outputFolder)}.zip`);
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(outputFolder, false);
    archive.finalize();

    output.on("close", () => {
        res.json({ downloadUrl: `/${zipFilePath}` });
    });
});

io.on("connection", (socket) => {
    console.log("Client connected");
});

server.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
