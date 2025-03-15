# 🎮 ASS Subtitle Translator (Gemini API)

A Node.js application that translates `.ass` subtitle files while keeping timestamps and formatting intact. Uses Google's **Gemini AI API** for accurate translations.

---

## 🚀 Features
👉 Upload `.ass` subtitle files  
👉 Translate subtitles while preserving timestamps and formatting  
👉 Download the translated subtitle file  
👉 Supports multiple languages  

---

## 📦 Installation

### 1️⃣ Clone the Repository
```sh
git clone https://github.com/dangnm/ASS-subtitle-translator-gemini.git
cd ASS-subtitle-translator-gemini
```

### 2️⃣ Install Dependencies
```sh
npm install
```

### 3️⃣ Set Up Environment Variables
Create a `.env` file in the project root and add:
```sh
GEMINI_API_KEY=your_gemini_api_key_here
```
---

## ▶️ Usage

### 1️⃣ Start the Server
Run the following command:
```sh
node server.js
```
Server will start at `http://localhost:3000`

### 2️⃣ Upload an `.ass` File
- Open your browser and go to `http://localhost:3000`
- Select and upload your subtitle file

### 3️⃣ Download Translated Subtitle
- Once translated, the file will be available for download

## 🛠 Troubleshooting

### 🔹 "Cannot find module 'dotenv'"
Run:  
```sh
npm install dotenv
```

### 🔹 "Cannot find module 'axios'"
Run:  
```sh
npm install axios
```
