# Insighta Labs: Intelligence Query Engine (Stage 2)

A Demographic Intelligence API built for marketing, product, and growth teams to filter, sort, paginate, and query large-scale user profile data — including natural language search.

---

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express
- **ORM**: Prisma
- **Database**: PostgreSQL (Supabase)
- **ID Standard**: UUID v7 (time-ordered)
- **CORS**: Enabled (`Access-Control-Allow-Origin: *`)

---

## Setup

```bash
npm install
npx prisma migrate dev
node seed.js        # Seeds all 2026 profiles (safe to re-run — no duplicates)
```

---

## API Reference

### Get All Profiles
`GET /api/profiles`

Supports filtering, sorting, and pagination in a single request.

**Filter parameters:**

| Parameter               | Type   | Description                        |
|------------------------|--------|------------------------------------|
| `gender`               | string | `male` or `female`                 |
| `age_group`            | string | `child`, `teenager`, `adult`, `senior` |
| `country_id`           | string | ISO 2-letter code (e.g. `NG`, `KE`) |
| `min_age`              | number | Minimum age (inclusive)            |
| `max_age`              | number | Maximum age (inclusive)            |
| `min_gender_probability`  | float | Minimum gender confidence score    |
| `min_country_probability` | float | Minimum country confidence score   |

**Sorting:**
- `sort_by` → `age` | `created_at` | `gender_probability` (default: `created_at`)
- `order` → `asc` | `desc` (default: `desc`)

**Pagination:**
- `page` — default: `1`
- `limit` — default: `10`, max: `50`

**Example:**
```
GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10
```

**Response (200):**
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": [
    {
      "id": "019dbd17-9998-7b04-9a8b-ef07a1ca2175",
      "name": "Emmanuel Touré",
      "gender": "male",
      "gender_probability": 0.71,
      "age": 38,
      "age_group": "adult",
      "country_id": "NG",
      "country_name": "Nigeria",
      "country_probability": 0.51,
      "created_at": "2026-04-23T12:00:00.000Z"
    }
  ]
}
```

---

### Natural Language Search
`GET /api/profiles/search?q=<query>`

Parses a plain English query and converts it into structured filters. Pagination (`page`, `limit`) applies here too.

**Example:**
```
GET /api/profiles/search?q=young males from nigeria
GET /api/profiles/search?q=adult females from kenya&page=2&limit=20
```

---

## Natural Language Parsing Approach

The `/api/profiles/search` endpoint uses a **rule-based parser** — no AI or LLMs involved. Here's exactly how it works:

### Step 1 — Normalize
The query string is lowercased and trimmed. This means `"Nigeria"`, `"NIGERIA"`, and `"nigeria"` all resolve identically.

### Step 2 — Gender Detection
Word-boundary regex (`\bmale\b`, `\bfemale\b`) is used to avoid false matches (e.g. "female" must not accidentally match "male").

| Query contains        | Filter applied        |
|-----------------------|-----------------------|
| `male` only           | `gender=male`         |
| `female` only         | `gender=female`       |
| both `male` + `female`| no gender filter      |

The "both present" case handles queries like `"male and female teenagers above 17"` correctly — age group and age filters still apply, gender is just left open.

### Step 3 — Age Group Detection
Keywords map directly to the `age_group` column:

| Keyword               | Filter applied          |
|-----------------------|-------------------------|
| `child`, `children`   | `age_group=child`       |
| `teenager`, `teenagers` | `age_group=teenager`  |
| `adult`, `adults`     | `age_group=adult`       |
| `senior`, `seniors`   | `age_group=senior`      |

### Step 4 — "Young" Special Case
`young` is not a stored age group. It maps to an age range only:

| Keyword | Filter applied                    |
|---------|-----------------------------------|
| `young` | `min_age=16` + `max_age=24`       |

When `young` is detected, any age group keyword in the same query is ignored, and the age range takes precedence.

### Step 5 — Numeric Threshold (Regex)
Pattern: `/\babove\s+(\d+)/`

The extracted number is used directly as `min_age`, matching the spec:

| Query                  | Filter applied  |
|------------------------|-----------------|
| `"females above 30"`   | `min_age=30`    |
| `"adults above 17"`    | `min_age=17`    |

### Step 6 — Country Detection
The parser checks the query for any country name from the full supported list (~50 countries) and maps it to its ISO code. Multi-word country names (e.g. "south africa", "ivory coast") are also matched.

| Query contains         | Filter applied      |
|------------------------|---------------------|
| `nigeria`              | `country_id=NG`     |
| `kenya`                | `country_id=KE`     |
| `angola`               | `country_id=AO`     |
| `south africa`         | `country_id=ZA`     |
| `ivory coast`          | `country_id=CI`     |

Full list of supported countries includes: Nigeria, Kenya, Uganda, Tanzania, South Africa, Ghana, Egypt, Morocco, Angola, Mozambique, Zimbabwe, Zambia, Rwanda, DR Congo, Cameroon, Ethiopia, Sudan, Senegal, Mali, Niger, Benin, Togo, Sierra Leone, Ivory Coast, Gabon, Somalia, Eritrea, and more.

### Step 7 — Uninterpretable Queries
If no filters were extracted after all steps, the response is:

```json
{ "status": "error", "message": "Unable to interpret query" }
```

### Example Mappings

| Query                                    | Filters applied                                        |
|------------------------------------------|--------------------------------------------------------|
| `young males`                            | `gender=male`, `min_age=16`, `max_age=24`              |
| `females above 30`                       | `gender=female`, `min_age=30`                          |
| `people from angola`                     | `country_id=AO`                                        |
| `adult males from kenya`                 | `gender=male`, `age_group=adult`, `country_id=KE`      |
| `male and female teenagers above 17`     | `age_group=teenager`, `min_age=17`                     |
| `young males from nigeria`               | `gender=male`, `min_age=16`, `max_age=24`, `country_id=NG` |

---

## Limitations & Edge Cases

- **Synonyms not supported.** The parser recognises `male`, `female`, `adult`, `teenager`, `senior`, `child`, `young`, and `above`. Words like `"guys"`, `"women"`, `"grown-ups"`, or `"over"` will not be parsed.
- **`OR` logic is not supported.** A query like `"males from Nigeria or Kenya"` will only match Nigeria (first country found). There is no multi-country OR logic.
- **Negation is not supported.** Queries like `"people not from Kenya"` will not be interpreted correctly — the `not` is ignored and `country_id=KE` will still be applied.
- **Only `above` is recognised as a comparator.** `"over 30"` or `"older than 30"` will not extract a numeric threshold.
- **Typo sensitivity.** There is no fuzzy matching. `"nigerria"` or `"teenagr"` will not match anything.
- **`young` + age group conflict.** If a query includes both `young` and an age group keyword (e.g. `"young adults"`), the `young` range (16–24) takes precedence and the `age_group` filter is dropped.
- **Single country per query.** If multiple country names appear, the first match wins. `"males from nigeria and kenya"` will apply `country_id=NG` only.

---

## Error Reference

| Status | Meaning                        | Message                          |
|--------|--------------------------------|----------------------------------|
| 400    | Missing or empty parameter     | `"Missing or empty name"` / `"Missing query"` |
| 400    | Uninterpretable NL query       | `"Unable to interpret query"`    |
| 422    | Invalid query parameter type   | `"Invalid query parameters"`     |
| 404    | Profile not found              | `"Profile not found"`            |
| 502    | External API failure           | API-specific message             |
| 500    | Internal server error          | `"Internal server error"`        |