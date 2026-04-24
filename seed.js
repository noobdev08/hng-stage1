import { v7 as uuidv7 } from 'uuid';
import fs from 'fs';
import prisma from './models/prismaClient.js';

async function seed() {
  const fileData = JSON.parse(fs.readFileSync('./seed_profiles.json', 'utf8'));
  const profiles = fileData.profiles;

  console.log(`Found ${profiles.length} profiles. Starting seed...`);

  for (const p of profiles) {
    await prisma.profile.upsert({
      where: { name: p.name },
      update: {},
      create: {
        id: uuidv7(), 
        name: p.name,
        gender: p.gender,
        gender_probability: p.gender_probability,
        age: p.age,
        age_group: p.age_group,
        country_id: p.country_id,
        country_name: p.country_name,
        country_probability: p.country_probability,
        created_at: new Date(),
      },
    });
  }

  console.log("Seed successful.");
}

seed();