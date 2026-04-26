# Document Template Matcher Node.js

This is a separate Node.js version of the corrected project idea. It does not disturb the existing Python/FastAPI project.

## Project idea

The system stores templates in categories such as:

- Research Paper
- CV
- Certificate
- Letter
- Invoice

When a user uploads a document, the backend detects the document type using document keywords and returns only the templates from the same category.

Examples:

- Upload a research paper: only research paper templates are shown.
- Upload a CV: only CV templates are shown.
- Upload a certificate: only certificate templates are shown.

## Run

```bash
cd document-template-node
npm start
```

Open:

```text
http://localhost:5000
```

## API

### Match uploaded document

```text
POST /api/match
```

Multipart form field:

```text
document
```

### List templates

```text
GET /api/templates
```

### Add template

```text
POST /api/templates
```

Multipart form fields:

```text
name
category
description
templateFile
```

## Note

This version uses simple keyword-based classification with lightweight DOCX text extraction. For a stronger final-year version, you can later replace the classifier with ML/NLP and use a dedicated parser for PDF and DOC files.
