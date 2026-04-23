# Insighta Labs: Intelligence Query Engine (Stage 2)

This system is an upgraded Demographic Intelligence Engine designed to help marketing and growth teams slice, sort, and query large-scale user profile data.

## 🚀 Features
- **Advanced Filtering**: Combine parameters like gender, age ranges, and confidence scores.
- **Dynamic Sorting**: Order results by `age`, `created_at`, or `gender_probability`.
- **Smart Pagination**: Controlled data retrieval with `page` and `limit` parameters (capped at 50 per page).
- **Natural Language Search**: Query data using plain English (e.g., "young males from nigeria").

---

## 🧠 Natural Language Parsing (NLP) Approach

The `/api/profiles/search` endpoint uses a **Rule-Based Tokenization** engine to translate human language into structured database filters. Since AI/LLMs are restricted for this assessment, the following logic was implemented:

### 1. Tokenization & Normalization
The input string (`q`) is converted to lowercase and split into individual word tokens. Punctuation is removed to ensure "Nigeria," and "Nigeria" are treated identically.

### 2. Keyword Mapping
The parser identifies "trigger words" and maps them to specific database columns:
* **Gender**: Words like `male`, `males` map to `gender=male`.
* **Age Groups**: Keywords like `adult`, `teenager`, or `senior` map to their respective `age_group` fields.
* **The "Young" Logic**: As per requirements, the keyword `young` is a special case that maps to a range of **16–24** years (`min_age=16`, `max_age=24`).
* **Geography**: Common country names (e.g., "Nigeria", "Kenya", "Angola") are detected and mapped to their corresponding ISO `country_id` (e.g., `NG`, `KE`, `AO`).

### 3. Comparison Extraction (Regex)
The engine uses Regular Expressions to detect numeric thresholds.
* **Pattern**: `/(?:above|over|older than)\s+(\d+)/`
* **Example**: "females above 30" extracts `30` and applies a `min_age=31` filter.

### 4. Logic Aggregation
All detected filters are merged into a single Prisma `where` clause. This ensures that a query like "young males from nigeria" correctly applies three simultaneous conditions (AND logic).

---

## ⚠️ Limitations & Edge Cases

* **Synonym Support**: The parser is strict. It recognizes "males" but may not recognize "guys" unless explicitly added to the dictionary.
* **Complex Conjunctions**: The engine currently supports `AND` logic only. It cannot process `OR` logic (e.g., "males from Nigeria OR Kenya").
* **Negation**: The parser does not handle negative queries like "people not from Kenya."
* **Typo Sensitivity**: Since this is a rule-based system without fuzzy matching, misspelled keywords will result in an "Unable to interpret query" error.

---

## 🛠 Tech Stack
- **Runtime**: Node.js
- **ORM**: Prisma
- **Database**: PostgreSQL (Supabase)
- **ID Standard**: UUID v7 (Time-ordered)
- **CORS**: Enabled (`Access-Control-Allow-Origin: *`)

---

## 📖 API Documentation

### Get All Profiles
`GET /api/profiles`
**Filters**: `gender`, `age_group`, `country_id`, `min_age`, `max_age`, `min_gender_probability`, `min_country_probability`.

### Search Profiles
`GET /api/profiles/search?q=young males from nigeria`

---

## ⚙️ Setup
1. `npm install`
2. `npx prisma migrate dev`
3. `node seed.js` (Seeds 2026 profiles)