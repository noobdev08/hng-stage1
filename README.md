# HNG Stage 1 Backend Task

This is a Node.js backend application that integrates with three external APIs (Genderize, Agify, Nationalize) to create and manage user profiles based on names.

## Project Structure

- `index.js`: Main entry point, sets up Express app and routes
- `controllers/profileController.js`: Business logic for profile operations
- `routes/profiles.js`: Route definitions for profile endpoints
- `models/database.js`: Database initialization and connection
- `package.json`: Dependencies and scripts
- `README.md`: This documentation

## Features

- **Create Profile**: POST /api/profiles - Accepts a name, fetches data from external APIs, classifies it, and stores in database. Handles duplicates.
- **Get Single Profile**: GET /api/profiles/{id} - Retrieves a profile by ID.
- **Get All Profiles**: GET /api/profiles - Retrieves all profiles with optional filtering by gender, country_id, age_group.
- **Delete Profile**: DELETE /api/profiles/{id} - Deletes a profile by ID.

## API Endpoints

### POST /api/profiles
- **Request Body**: `{ "name": "string" }`
- **Success Response (201)**: Profile created
- **Success Response (200)**: Profile already exists

### GET /api/profiles/{id}
- **Success Response (200)**: Single profile data

### GET /api/profiles
- **Query Parameters**: `gender`, `country_id`, `age_group` (case-insensitive)
- **Success Response (200)**: List of profiles

### DELETE /api/profiles/{id}
- **Success Response (204)**: No Content

## Error Handling

- 400: Missing or empty name
- 404: Profile not found
- 422: Invalid type
- 500: Server error
- 502: External API invalid response

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and set `DATABASE_URL` to your Supabase Postgres URL
4. Generate Prisma client: `npx prisma generate`
5. Push schema to the database: `npx prisma db push`
6. Start the server: `npm start`
7. The server runs on port 3000 by default, or use `PORT` environment variable.

## Deployment

Deploy to platforms like Railway, Heroku, or Vercel. Ensure CORS is enabled.

## Technologies Used

- Node.js
- Express.js
- Prisma
- Supabase (PostgreSQL)
- Axios
- UUID
- CORS