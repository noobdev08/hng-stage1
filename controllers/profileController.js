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

export async function getAllProfiles(req, res) {
  try {
    let { 
      page = 1, limit = 10, sort_by = 'created_at', order = 'desc',
      gender, age_group, country_id, min_age, max_age, 
      min_gender_probability, min_country_probability 
    } = req.query;

    page = parseInt(page);
    limit = Math.min(parseInt(limit), 50);

    const validSortFields = ['age', 'gender_probability', 'country_probability', 'created_at'];
    const finalSortBy = validSortFields.includes(sort_by) ? sort_by : 'created_at';

    const where = {
      gender: gender ? { equals: gender, mode: 'insensitive' } : undefined,
      age_group: age_group ? { equals: age_group, mode: 'insensitive' } : undefined,
      country_id: country_id ? { equals: country_id, mode: 'insensitive' } : undefined,
      AND: [
        min_age ? { age: { gte: parseInt(min_age) } } : {},
        max_age ? { age: { lte: parseInt(max_age) } } : {}
      ].filter(obj => Object.keys(obj).length > 0),
      gender_probability: min_gender_probability ? { gte: parseFloat(min_gender_probability) } : undefined,
      country_probability: min_country_probability ? { gte: parseFloat(min_country_probability) } : undefined
    };

    const [total, data] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { [finalSortBy]: order === 'asc' ? 'asc' : 'desc' }
      })
    ]);

    res.status(200).json({ status: "success", page, limit, total, data });
  } catch (error) {
    res.status(422).json({ status: "error", message: "Invalid query parameters" });
    }
}

export async function searchProfiles(req, res) {
  try {
    const { q } = req.query; 
    if (!q || q.trim() === "") {
        return res.status(400).json({ status: "error", message: "Missing query" });
    }

    const query = q.toLowerCase();
    const filters = {};

    if (query.includes('female')) filters.gender = 'female';
    else if (query.includes('male')) filters.gender = 'male';

    if (query.includes('young')) {
      filters.min_age = "16"; 
      filters.max_age = "24"; 
    }
    
    if (query.includes('adult')) filters.age_group = 'adult';
    if (query.includes('teenager')) filters.age_group = 'teenager';
    if (query.includes('senior')) filters.age_group = 'senior';

    const aboveMatch = query.match(/above\s+(\d+)/);
    if (aboveMatch) filters.min_age = (parseInt(aboveMatch[1]) + 1).toString(); 

    const countries = { nigeria: 'NG', kenya: 'KE', uganda: 'UG', tanzania: 'TZ' };
    for (const [name, id] of Object.entries(countries)) {
      if (query.includes(name)) filters.country_id = id;
    }

    if (Object.keys(filters).length === 0) {
      return res.status(400).json({ status: "error", message: "Unable to interpret query" });
    }

    req.query = { ...req.query, ...filters };
    
    return getAllProfiles(req, res);

  } catch (error) {
    console.error("Search Error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
}