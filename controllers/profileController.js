import axios from 'axios';
import { v7 as uuidv7 } from 'uuid';
import prisma from '../models/prismaClient.js'


function getAgeGroup(age) {
    if (age <= 12) return 'child';
    if (age <= 19) return 'teenager';
    if (age <= 59) return 'adult';
    return 'senior';
}

export async function getExternalData(name) {
    const [genderRes, ageRes, nationRes] = await Promise.all([
        axios.get(`https://api.genderize.io?name=${name}`),
        axios.get(`https://api.agify.io?name=${name}`),
        axios.get(`https://api.nationalize.io?name=${name}`)
    ]);

    const genderize = genderRes.data;
    const agify = ageRes.data;
    const nationalize = nationRes.data;

    if (!genderize.gender || genderize.count === 0) {
        throw new Error('Genderize returned an invalid response');
    }
    if (agify.age === null) {
        throw new Error('Agify returned an invalid response');
    }
    if (!nationalize.country || nationalize.country.length === 0) {
        throw new Error('Nationalize returned an invalid response');
    }

    const topCountry = nationalize.country.reduce((prev, current) => 
        prev.probability > current.probability ? prev : current
    );

    return {
        gender: genderize.gender,
        gender_probability: genderize.probability,
        sample_size: genderize.count,
        age: agify.age,
        age_group: getAgeGroup(agify.age),
        country_id: topCountry.country_id,
        country_probability: topCountry.probability
    };
}

export async function createProfile(req, res) {
    const { name } = req.body;

    if (name === undefined || name === null) {
        return res.status(400).json({ status: "error", message: "Missing or empty name" });
    }
    
    if (typeof name !== 'string') {
        return res.status(422).json({ status: "error", message: "Invalid type" });
    }

    
    if (name.trim() === "") {
        return res.status(400).json({ status: "error", message: "Missing or empty name" });
    }

    const trimmedName = name.trim();

    try {
        const existingProfile = await prisma.profile.findFirst({
            where: {
                name: {
                    equals: trimmedName,
                    mode: 'insensitive'
                }
            }
        });

        if (existingProfile) {
            return res.status(201).json({
                status: "success",
                message: "Profile already exists",
                data: existingProfile
            });
        }

        const data = await getExternalData(trimmedName);

        const newProfile = await prisma.profile.create({
            data: {
                id: uuidv7(),
                name: trimmedName,
                gender: data.gender,
                gender_probability: data.gender_probability,
                sample_size: data.sample_size,
                age: data.age,
                age_group: data.age_group,
                country_id: data.country_id,
                country_probability: data.country_probability,
                created_at: new Date()
            }
        });

        return res.status(201).json({
            status: "success",
            data: newProfile
        });

    } catch (error) {
        if (error.message.includes('returned an invalid response')) {
            return res.status(502).json({
                status: "error",
                message: error.message
            });
        }

        if (error.isAxiosError) {
            return res.status(502).json({
                status: "error",
                message: "Upstream server failure"
            });
        }

        console.error(error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

export async function getProfile(req, res) {
    const { id } = req.params;

    try {
        const profile = await prisma.profile.findUnique({
            where: { id }
        });

        if (!profile) {
            return res.status(404).json({
                status: "error",
                message: "Profile not found"
            });
        }

        return res.status(200).json({
            status: "success",
            data: profile
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
};

export async function getAllProfiles(req, res) {
  try {
    let { 
      page = 1, limit = 10, sort_by = 'created_at', order = 'desc',
      gender, age_group, country_id, min_age, max_age, 
      min_gender_probability, min_country_probability 
    } = req.query;

    page = parseInt(page);
    limit = Math.min(parseInt(limit), 50);

    const where = {
      gender: gender ? { equals: gender, mode: 'insensitive' } : undefined,
      age_group: age_group ? { equals: age_group, mode: 'insensitive' } : undefined,
      country_id: country_id ? { equals: country_id, mode: 'insensitive' } : undefined,
      age: {
        gte: min_age ? parseInt(min_age) : undefined,
        lte: max_age ? parseInt(max_age) : undefined
      },
      gender_probability: { gte: min_gender_probability ? parseFloat(min_gender_probability) : undefined },
      country_probability: { gte: min_country_probability ? parseFloat(min_country_probability) : undefined }
    };

    const [total, data] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { [sort_by]: order }
      })
    ]);

    res.status(200).json({ status: "success", page, limit, total, data });
  } catch (error) {
    res.status(422).json({ status: "error", message: "Invalid query parameters" });
  }
}

export async function deleteProfile (req, res) {
    const { id } = req.params;

    try {
        const deleteOp = await prisma.profile.deleteMany({
            where: { id }
        });

        if (deleteOp.count === 0) {
            return res.status(404).json({
                status: "error",    
                message: "Profile not found"
            });
        }

        return res.status(204).send();
    } catch (error) {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
};

export async function searchProfiles(req, res) {
  const { q, page = 1, limit = 10 } = req.query;
  if (!q) return res.status(400).json({ status: "error", message: "Missing query" });

  const query = q.toLowerCase();
  const filters = {};

  if (query.includes('male') && !query.includes('female')) filters.gender = 'male';
  if (query.includes('female')) filters.gender = 'female';
  if (query.includes('young')) { filters.min_age = 16; filters.max_age = 24; }
  if (query.includes('adult')) filters.age_group = 'adult';
  if (query.includes('teenager')) filters.age_group = 'teenager';
  if (query.includes('senior')) filters.age_group = 'senior';
  
  const aboveMatch = query.match(/above\s(\d+)/);
  if (aboveMatch) filters.min_age = parseInt(aboveMatch[1]) + 1;

  if (query.includes('nigeria')) filters.country_id = 'NG';
  if (query.includes('kenya')) filters.country_id = 'KE';
  if (query.includes('uganda')) filters.country_id = 'UG';

  req.query = { ...req.query, ...filters };
  return getAllProfiles(req, res);
}