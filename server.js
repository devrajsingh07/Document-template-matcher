const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const PORT = process.env.PORT || 5000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const TEMPLATE_FILE = path.join(DATA_DIR, "templates.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
let templateCache = null;
let templateCacheModified = 0;

const CATEGORIES = {
  "research-paper": {
    label: "Research Paper",
    fileHints: ["research", "paper", "journal", "conference", "ieee", "article", "report", "project"],
    aliases: [
      "research paper",
      "journal article",
      "conference paper",
      "ieee paper",
      "review paper",
      "technical paper",
      "manuscript",
      "project report",
      "final year project report",
      "internship report",
      "technical report"
    ],
    indicators: {
      "abstract": 8,
      "keywords": 5,
      "introduction": 4,
      "literature review": 9,
      "methodology": 8,
      "proposed system": 5,
      "experiment": 5,
      "results": 6,
      "discussion": 5,
      "conclusion": 4,
      "references": 9,
      "doi": 9,
      "citation": 7,
      "journal": 7,
      "conference": 7,
      "report": 6,
      "project report": 12,
      "chapter": 4,
      "problem statement": 6,
      "objectives": 5,
      "scope": 4,
      "fig": 3,
      "table": 3
    },
    antiIndicators: {
      "curriculum vitae": 10,
      "invoice number": 12,
      "bill to": 10,
      "certificate of": 7,
      "yours sincerely": 8
    }
  },
  cv: {
    label: "CV",
    fileHints: ["cv", "resume", "biodata"],
    aliases: [
      "curriculum vitae",
      "resume",
      "professional resume",
      "fresher resume",
      "biodata",
      "cv template"
    ],
    indicators: {
      "resume": 10,
      "curriculum vitae": 12,
      "career objective": 10,
      "professional summary": 8,
      "profile": 4,
      "education": 5,
      "skills": 8,
      "technical skills": 10,
      "experience": 7,
      "internship": 8,
      "projects": 6,
      "achievements": 6,
      "certifications": 5,
      "linkedin": 8,
      "github": 6
    },
    antiIndicators: {
      "abstract": 9,
      "references": 7,
      "invoice number": 12,
      "bill to": 10,
      "certifies": 8
    }
  },
  certificate: {
    label: "Certificate",
    fileHints: ["certificate", "certification", "award"],
    aliases: [
      "certificate",
      "certificate of completion",
      "certificate of achievement",
      "internship certificate",
      "course completion certificate",
      "appreciation certificate"
    ],
    indicators: {
      "certificate": 10,
      "certifies": 10,
      "certified": 8,
      "awarded": 9,
      "presented to": 12,
      "successfully completed": 10,
      "participation": 8,
      "achievement": 8,
      "recognition": 7,
      "signature": 6,
      "organized by": 7,
      "date": 2
    },
    antiIndicators: {
      "invoice number": 12,
      "bill to": 10,
      "abstract": 8,
      "curriculum vitae": 8
    }
  },
  letter: {
    label: "Letter",
    fileHints: ["letter", "application", "request"],
    aliases: [
      "application letter",
      "formal letter",
      "request letter",
      "leave application",
      "cover letter",
      "business letter"
    ],
    indicators: {
      "dear sir": 10,
      "dear madam": 10,
      "subject": 8,
      "respected": 6,
      "yours sincerely": 12,
      "yours faithfully": 12,
      "regards": 7,
      "application": 5,
      "address": 4,
      "to the": 3
    },
    antiIndicators: {
      "abstract": 9,
      "references": 7,
      "invoice number": 12,
      "curriculum vitae": 8,
      "certificate of": 6
    }
  },
  invoice: {
    label: "Invoice",
    fileHints: ["invoice", "bill", "receipt", "payment"],
    aliases: [
      "invoice",
      "tax invoice",
      "proforma invoice",
      "cash receipt",
      "service bill",
      "payment receipt"
    ],
    indicators: {
      "invoice": 12,
      "bill to": 10,
      "invoice number": 12,
      "quantity": 8,
      "rate": 6,
      "tax": 7,
      "subtotal": 9,
      "total amount": 10,
      "payment": 7,
      "gst": 8,
      "due date": 7
    },
    antiIndicators: {
      "curriculum vitae": 10,
      "abstract": 8,
      "certificate of": 8,
      "yours sincerely": 7
    }
  }
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (req.method === "GET" && req.url === "/api/categories") {
      sendJson(res, 200, getCategoryList());
      return;
    }

    if (req.method === "GET" && req.url === "/api/templates") {
      sendJson(res, 200, readTemplates());
      return;
    }

    if (req.method === "POST" && req.url === "/api/match") {
      const upload = await readMultipartFile(req);
      const result = matchUploadedDocument(upload);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/templates") {
      const template = await readTemplatePayload(req);
      const savedTemplate = saveTemplate(template);
      sendJson(res, 201, savedTemplate);
      return;
    }

    if (req.method === "GET") {
      serveStatic(req, res);
      return;
    }

    sendJson(res, 404, { error: "Route not found" });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Something went wrong"
    });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Document template matcher running at http://localhost:${PORT}`);
  });
}

function matchUploadedDocument(upload) {
  const rawText = extractReadableText(upload.buffer, upload.fileName, upload.contentType);
  const fileHints = `${upload.fileName} ${upload.contentType}`;
  const textForMatching = normalizeText(`${fileHints} ${rawText}`);
  const classification = classifyDocument(textForMatching, fileHints);
  const templates = readTemplates();
  const sameCategoryTemplates = templates
    .filter((template) => template.category === classification.category)
    .map((template) => ({
      ...template,
      similarity: scoreTemplate(textForMatching, template, classification.category)
    }))
    .sort((first, second) => second.similarity - first.similarity);

  const savedUploadName = saveUpload(upload);

  return {
    uploadedFile: upload.fileName,
    savedAs: savedUploadName,
    detectedCategory: classification.category,
    detectedCategoryLabel: CATEGORIES[classification.category].label,
    confidence: classification.confidence,
    matchedTemplates: sameCategoryTemplates,
    message:
      sameCategoryTemplates.length > 0
        ? `Only ${CATEGORIES[classification.category].label} templates are shown.`
        : "No saved templates found for this document type."
  };
}

function classifyDocument(text, fileHints = "") {
  const normalizedHints = normalizeText(fileHints);
  const tokenSet = new Set(tokenize(text));
  const scoredCategories = Object.entries(CATEGORIES).map(([category, config]) => {
    const indicatorScore = Object.entries(config.indicators).reduce((total, [keyword, weight]) => {
      return total + countKeyword(text, keyword) * weight;
    }, 0);
    const fileHintScore = config.fileHints.reduce((total, hint) => {
      return total + (normalizedHints.includes(normalizeText(hint)) ? 12 : 0);
    }, 0);
    const aliasScore = (config.aliases || []).reduce((total, alias) => {
      return total + countPhrasePresence(text, alias) * 10;
    }, 0);
    const structureBonus = getStructureBonus(category, text);
    const patternBonus = getPatternBonus(category, text, tokenSet);
    const antiIndicatorPenalty = Object.entries(config.antiIndicators || {}).reduce((total, [keyword, weight]) => {
      return total + countKeyword(text, keyword) * weight;
    }, 0);
    const score = Math.max(0, indicatorScore + fileHintScore + aliasScore + structureBonus + patternBonus - antiIndicatorPenalty);

    return { category, score };
  });

  scoredCategories.sort((first, second) => second.score - first.score);

  const best = scoredCategories[0];
  const total = scoredCategories.reduce((sum, item) => sum + item.score, 0);

  if (!best || best.score === 0) {
    return {
      category: "research-paper",
      confidence: 35
    };
  }

  const runnerUp = scoredCategories[1] || { score: 0 };
  const margin = best.score - runnerUp.score;

  const dominance = total === 0 ? 0 : best.score / total;
  return {
    category: best.category,
    confidence: Math.min(99, Math.max(55, Math.round(dominance * 70 + Math.min(25, margin * 2))))
  };
}

function scoreTemplate(text, template, category) {
  const templateKeywords = getTemplateKeywords(template, category);
  const source = normalizeText([
    template.name,
    template.description,
    template.fileName,
    ...templateKeywords
  ].join(" "));

  const uploadedTerms = new Set(tokenize(text));
  const templateTerms = new Set(tokenize(source));
  const sharedTerms = [...templateTerms].filter((term) => uploadedTerms.has(term));
  const unionSize = new Set([...templateTerms, ...uploadedTerms]).size || 1;
  const sharedRatio = templateTerms.size === 0 ? 0 : sharedTerms.length / templateTerms.size;
  const termScore = sharedRatio * 32;
  const jaccardScore = (sharedTerms.length / unionSize) * 26;
  const keywordScore = templateKeywords.reduce((total, keyword) => {
    return total + countPhrasePresence(text, keyword) * 7;
  }, 0);
  const nameScore = countPhrasePresence(text, template.name) * 10;
  const fileNameScore = countPhrasePresence(text, template.fileName || "") * 8;
  const descriptionScore = (template.description ? phraseOverlapScore(text, template.description) : 0);
  const categoryAnchorScore = (CATEGORIES[category]?.aliases || []).reduce((total, alias) => {
    return total + (countPhrasePresence(source, alias) && countPhrasePresence(text, alias) ? 4 : 0);
  }, 0);
  const score = Math.min(100, termScore + jaccardScore + keywordScore + nameScore + fileNameScore + descriptionScore + categoryAnchorScore);

  return Math.round(score);
}

function tokenize(text) {
  return Array.from(
    new Set(
      String(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    )
  );
}

function countKeyword(text, keyword) {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) {
    return 0;
  }

  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.match(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "g"));
  return matches ? matches.length : 0;
}

function countPhrasePresence(text, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) {
    return 0;
  }

  if (text.includes(normalizedPhrase)) {
    return normalizedPhrase.split(" ").length > 1 ? 2 : 1;
  }

  const phraseTerms = tokenize(normalizedPhrase);
  if (!phraseTerms.length) {
    return 0;
  }

  const textTerms = new Set(tokenize(text));
  const shared = phraseTerms.filter((term) => textTerms.has(term)).length;
  return shared === phraseTerms.length ? 1 : 0;
}

function phraseOverlapScore(text, description) {
  const descriptionTerms = tokenize(description);
  if (!descriptionTerms.length) {
    return 0;
  }

  const textTerms = new Set(tokenize(text));
  const matched = descriptionTerms.filter((term) => textTerms.has(term)).length;
  return Math.round((matched / descriptionTerms.length) * 18);
}

function getPatternBonus(category, text, tokenSet) {
  if (category === "research-paper") {
    return ["abstract", "introduction", "methodology", "results", "conclusion", "references"]
      .filter((item) => hasPhrase(text, tokenSet, item)).length * 3;
  }

  if (category === "cv") {
    return ["education", "skills", "experience", "projects", "linkedin", "github"]
      .filter((item) => hasPhrase(text, tokenSet, item)).length * 4;
  }

  if (category === "certificate") {
    const hasRecipient = /\bawarded to\b|\bpresented to\b|\bcertifies that\b/i.test(text);
    const hasAuthority = /\bsignature\b|\bdirector\b|\bprincipal\b|\bcoordinator\b/i.test(text);
    return (hasRecipient ? 8 : 0) + (hasAuthority ? 6 : 0);
  }

  if (category === "letter") {
    const hasSalutation = /\bdear\b|\brespected\b/i.test(text);
    const hasClosing = /\byours sincerely\b|\byours faithfully\b|\bregards\b|\bthank you\b/i.test(text);
    return (hasSalutation ? 7 : 0) + (hasClosing ? 8 : 0);
  }

  if (category === "invoice") {
    const hasAmounts = /\b(?:subtotal|total|amount|balance|tax|gst)\b/i.test(text);
    const hasInvoiceMeta = /\b(?:invoice number|invoice date|bill to|qty|quantity|rate)\b/i.test(text);
    return (hasAmounts ? 4 : 0) + (hasInvoiceMeta ? 10 : 0);
  }

  return 0;
}

function hasPhrase(text, tokenSet, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) {
    return false;
  }

  if (text.includes(normalizedPhrase)) {
    return true;
  }

  return tokenize(normalizedPhrase).every((term) => tokenSet.has(term));
}

function getStructureBonus(category, text) {
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
  const hasPhone = /(?:\+91|0)?[6-9]\d{9}\b/.test(text);
  const hasCurrency = /(?:rs|inr|\$)\s?\d+|\d+\s?(?:rs|inr|\$)/i.test(text);
  const hasSectionHeaders = ["abstract", "introduction", "methodology", "results", "references"].filter((item) =>
    text.includes(item)
  ).length;
  const hasReportSections = ["project report", "chapter", "objectives", "scope", "problem statement", "conclusion"].filter(
    (item) => text.includes(item)
  ).length;
  const hasLetterGreeting = ["dear sir", "dear madam", "respected sir", "respected madam", "to,"].some((item) =>
    text.includes(item)
  );
  const hasLetterClosing = ["yours sincerely", "yours faithfully", "regards", "thank you"].some((item) =>
    text.includes(item)
  );
  const hasInvoiceLayout = ["invoice number", "bill to", "subtotal", "tax", "total"].filter((item) =>
    text.includes(item)
  ).length;
  const hasCertificateLanguage = ["presented to", "awarded", "certifies", "successfully completed"].filter((item) =>
    text.includes(item)
  ).length;
  const hasCvSections = ["education", "skills", "experience", "projects"].filter((item) => text.includes(item)).length;

  if (category === "research-paper" && hasSectionHeaders >= 3) {
    return 18;
  }
  if (category === "research-paper" && hasReportSections >= 2) {
    return 16;
  }
  if (category === "cv" && hasEmail && hasPhone && hasCvSections >= 2) {
    return 20;
  }
  if (category === "invoice" && hasInvoiceLayout >= 2 && (hasCurrency || text.includes("invoice"))) {
    return 18;
  }
  if (category === "certificate" && hasCertificateLanguage >= 2) {
    return 18;
  }
  if (category === "letter" && hasLetterGreeting && hasLetterClosing) {
    return 18;
  }
  return 0;
}

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\x20-\x7E\s]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9@.$\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReadableText(buffer, fileName = "", contentType = "") {
  const extension = path.extname(String(fileName || "")).toLowerCase();

  if (extension === ".docx" || contentType.includes("wordprocessingml")) {
    const docxText = extractDocxText(buffer);
    if (docxText) {
      return docxText;
    }
  }

  if (extension === ".pdf" || contentType.includes("pdf")) {
    const pdfText = extractPdfText(buffer);
    if (pdfText) {
      return pdfText;
    }
  }

  return extractFallbackText(buffer);
}

function extractDocxText(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const xmlText = entries
      .filter((entry) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(entry.entryName))
      .map((entry) => zip.readAsText(entry))
      .join(" ");

    return normalizeExtractedText(
      xmlText
      .replace(/<w:tab\/>/g, " ")
      .replace(/<w:br\/>/g, " ")
      .replace(/<\/w:p>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
    );
  } catch {
    return "";
  }
}

function extractPdfText(buffer) {
  const source = buffer.toString("latin1");
  const chunks = [];
  const matcher = /\((?:\\.|[^()\\])+\)/g;
  let match;

  while ((match = matcher.exec(source)) !== null) {
    const cleaned = match[0]
      .slice(1, -1)
      .replace(/\\r|\\n|\\t/g, " ")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
      .replace(/\\\\/g, "\\");

    if (/[A-Za-z]{3,}/.test(cleaned)) {
      chunks.push(cleaned);
    }
  }

  const hexChunks = [];
  const hexMatcher = /<([0-9A-Fa-f\s]{8,})>/g;
  while ((match = hexMatcher.exec(source)) !== null) {
    const hex = match[1].replace(/\s+/g, "");
    if (hex.length % 2 === 0) {
      try {
        hexChunks.push(Buffer.from(hex, "hex").toString("utf8"));
      } catch {
        continue;
      }
    }
  }

  return normalizeExtractedText(`${chunks.join(" ")} ${hexChunks.join(" ")} ${extractPrintableSegments(source)}`);
}

function extractFallbackText(buffer) {
  const utfText = buffer.toString("utf8");
  const latinText = buffer.toString("latin1");
  return normalizeExtractedText(`${utfText} ${latinText} ${extractPrintableSegments(latinText)}`);
}

function extractPrintableSegments(text) {
  const matches = String(text).match(/[A-Za-z0-9@.$:/,&()\-]{3,}(?:\s+[A-Za-z0-9@.$:/,&()\-]{2,})*/g);
  return matches ? matches.join(" ") : "";
}

function normalizeExtractedText(text) {
  return String(text)
    .replace(/[^\x20-\x7E\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTemplateKeywords(template, category) {
  const storedKeywords = Array.isArray(template.keywords) ? template.keywords.filter(Boolean) : [];
  if (storedKeywords.length) {
    return storedKeywords;
  }

  return Array.from(
    new Set([
      ...tokenize(template.name || ""),
      ...tokenize(template.description || ""),
      ...tokenize(template.fileName || ""),
      ...Object.keys(CATEGORIES[category]?.indicators || {}).slice(0, 6)
    ])
  );
}

function saveUpload(upload) {
  const safeName = path.basename(upload.fileName || "uploaded-document");
  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension).replace(/[^a-z0-9-_]+/gi, "-");
  const fileName = `${baseName || "document"}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${extension}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), upload.buffer);
  return fileName;
}

function readTemplates() {
  const stats = fs.statSync(TEMPLATE_FILE);
  if (templateCache && templateCacheModified === stats.mtimeMs) {
    return templateCache;
  }

  templateCache = JSON.parse(fs.readFileSync(TEMPLATE_FILE, "utf8"));
  templateCacheModified = stats.mtimeMs;
  return templateCache;
}

function saveTemplate(payload) {
  const templates = readTemplates();
  const category = String(payload.category || "").trim();

  if (!CATEGORIES[category]) {
    throw httpError(400, "Invalid category.");
  }

  const template = {
    id: templates.length ? Math.max(...templates.map((item) => item.id)) + 1 : 1,
    name: String(payload.name || "").trim(),
    category,
    description: String(payload.description || "").trim(),
    fileName: String(payload.fileName || "template-file").trim(),
    keywords: String(payload.keywords || "")
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean)
  };

  if (!template.name) {
    throw httpError(400, "Template name is required.");
  }

  templates.push(template);
  fs.writeFileSync(TEMPLATE_FILE, JSON.stringify(templates, null, 2));
  templateCache = templates;
  templateCacheModified = fs.statSync(TEMPLATE_FILE).mtimeMs;
  return template;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "are",
  "was",
  "were",
  "has",
  "have",
  "your",
  "you",
  "our",
  "all",
  "can",
  "will",
  "into",
  "than",
  "then",
  "there",
  "their",
  "template",
  "document",
  "file"
]);

async function readTemplatePayload(req) {
  const body = await readBody(req);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw httpError(400, "Invalid JSON body.");
  }
}

async function readMultipartFile(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.+)$/);

  if (!boundaryMatch) {
    throw httpError(400, "Upload must use multipart/form-data.");
  }

  const body = await readBody(req);
  const boundary = `--${boundaryMatch[1]}`;
  const parts = body.toString("binary").split(boundary);

  for (const part of parts) {
    if (!part.includes('name="document"')) {
      continue;
    }

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      continue;
    }

    const header = part.slice(0, headerEnd);
    const fileNameMatch = header.match(/filename="([^"]+)"/);
    const contentTypeMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
    const contentStart = headerEnd + 4;
    const contentEnd = part.lastIndexOf("\r\n");
    const contentBinary = part.slice(contentStart, contentEnd);
    const buffer = Buffer.from(contentBinary, "binary");

    if (!buffer.length) {
      throw httpError(400, "Uploaded file is empty.");
    }

    return {
      fileName: fileNameMatch ? path.basename(fileNameMatch[1]) : "uploaded-document",
      contentType: contentTypeMatch ? contentTypeMatch[1] : "application/octet-stream",
      buffer
    };
  }

  throw httpError(400, 'No file found. Use the field name "document".');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > 10 * 1024 * 1024) {
        reject(httpError(413, "File is too large. Maximum size is 10 MB."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendJson(res, 404, { error: "File not found" });
    return;
  }

  const extension = path.extname(filePath);
  const type = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json"
  }[extension] || "application/octet-stream";

  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(filePath).pipe(res);
}

function getCategoryList() {
  return Object.entries(CATEGORIES).map(([value, config]) => ({
    value,
    label: config.label
  }));
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  });

  if (statusCode === 204) {
    res.end();
    return;
  }

  res.end(JSON.stringify(data, null, 2));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  classifyDocument,
  scoreTemplate,
  extractReadableText,
  matchUploadedDocument
};
