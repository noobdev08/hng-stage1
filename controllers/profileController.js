import axios from 'axios';
import { v7 as uuidv7 } from 'uuid';
import prisma from '../models/prismaClient.js';

function getAgeGroup(age) {
  if (age <= 12) return 'child';
  if (age <= 19) return 'teenager';
  if (age <= 59) return 'adult';
  return 'senior';
}

const COUNTRIES = {
  NG: 'Nigeria', KE: 'Kenya', UG: 'Uganda',
  TZ: 'Tanzania', ZA: 'South Africa', GH: 'Ghana',
  EG: 'Egypt', MA: 'Morocco', TN: 'Tunisia',
  AO: 'Angola', MZ: 'Mozambique', ZW: 'Zimbabwe',
  BW: 'Botswana', ZM: 'Zambia', NA: 'Namibia',
  RW: 'Rwanda', BI: 'Burundi', CD: 'DR Congo',
  CG: 'Republic of the Congo', GA: 'Gabon', GQ: 'Equatorial Guinea',
  CM: 'Cameroon', TD: 'Chad', CF: 'Central African Republic',
  SS: 'South Sudan', ER: 'Eritrea', DJ: 'Djibouti',
  SO: 'Somalia', ET: 'Ethiopia', SD: 'Sudan',
  LY: 'Libya', DZ: 'Algeria', EH: 'Western Sahara',
  MR: 'Mauritania', SN: 'Senegal', GM: 'Gambia',
  GN: 'Guinea', GW: 'Guinea-Bissau', SL: 'Sierra Leone',
  LR: 'Liberia', CI: 'Ivory Coast', BF: 'Burkina Faso',
  ML: 'Mali', NE: 'Niger', BJ: 'Benin',
  TG: 'Togo', MG: 'Madagascar', MU: 'Mauritius',
  CV: 'Cape Verde', MW: 'Malawi', MK: 'North Macedonia',
  FR: 'France', DE: 'Germany', GB: 'United Kingdom',
  US: 'United States', IN: 'India', BR: 'Brazil',
  AU: 'Australia',
};

const COUNTRY_NAME_TO_ID = Object.fromEntries(
  Object.entries(COUNTRIES).map(([id, name]) => [name.toLowerCase(), id])
);

function getCountryName(countryId) {
  return COUNTRIES[countryId] || 'Unknown';
}


export async function getExternalData(name) {
  const [genderRes, ageRes, nationRes] = await Promise.all([
    axios.get(`https://api.genderize.io?name=${name}`, { timeout: 8000 }),
    axios.get(`https://api.agify.io?name=${name}`, { timeout: 8000 }),
    axios.get(`https://api.nationalize.io?name=${name}`, { timeout: 8000 }),
  ]);

  const genderize = genderRes.data;
  const agify = ageRes.data;
  const nationalize = nationRes.data;

  if (!genderize.gender || genderize.count === 0)
    throw new Error('Genderize returned an invalid response');
  if (agify.age === null)
    throw new Error('Agify returned an invalid response');
  if (!nationalize.country || nationalize.country.length === 0)
    throw new Error('Nationalize returned an invalid response');

  const topCountry = nationalize.country.reduce((prev, cur) =>
    prev.probability > cur.probability ? prev : cur
  );

  return {
    gender: genderize.gender,
    gender_probability: genderize.probability,
    sample_size: genderize.count,
    age: agify.age,
    age_group: getAgeGroup(agify.age),
    country_id: topCountry.country_id,
    country_probability: topCountry.probability,
  };
}

function buildWhere(params) {
  const {
    gender, age_group, country_id,
    min_age, max_age,
    min_gender_probability, min_country_probability,
  } = params;

  const and = [];

  if (min_age !== undefined) and.push({ age: { gte: parseInt(min_age) } });
  if (max_age !== undefined) and.push({ age: { lte: parseInt(max_age) } });

  return {
    ...(gender && { gender: { equals: gender, mode: 'insensitive' } }),
    ...(age_group && { age_group: { equals: age_group, mode: 'insensitive' } }),
    ...(country_id && { country_id: { equals: country_id, mode: 'insensitive' } }),
    ...(min_gender_probability && { gender_probability: { gte: parseFloat(min_gender_probability) } }),
    ...(min_country_probability && { country_probability: { gte: parseFloat(min_country_probability) } }),
    ...(and.length && { AND: and }),
  };
}

export async function getAllProfiles(req, res) {
  try {
    let {
      page = '1', limit = '10',
      sort_by = 'created_at', order = 'desc',
      gender, age_group, country_id,
      min_age, max_age,
      min_gender_probability, min_country_probability,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 50);

    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return res.status(422).json({ status: 'error', message: 'Invalid query parameters' });
    }

    const VALID_SORT = ['age', 'gender_probability', 'created_at'];
    if (!VALID_SORT.includes(sort_by)) {
      return res.status(422).json({ status: 'error', message: 'Invalid query parameters' });
    }

    const numericFields = { min_age, max_age, min_gender_probability, min_country_probability };
    for (const [key, val] of Object.entries(numericFields)) {
      if (val !== undefined && isNaN(parseFloat(val))) {
        return res.status(422).json({ status: 'error', message: 'Invalid query parameters' });
      }
    }

    const where = buildWhere({
      gender, age_group, country_id,
      min_age, max_age,
      min_gender_probability, min_country_probability,
    });

    const [total, data] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        orderBy: { [sort_by]: order === 'asc' ? 'asc' : 'desc' },
        take: limitNum,
        skip: (pageNum - 1) * limitNum,
      }),
    ]);

    return res.status(200).json({
      status: 'success',
      page: pageNum,
      limit: limitNum,
      total,
      data: data.map(formatProfile),
    });

  } catch (error) {
    console.error('getAllProfiles error:', error);
    return res.status(422).json({ status: 'error', message: 'Invalid query parameters' });
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
      return res.status(400).json({ 
        status: "error", 
        message: "Unable to interpret query"
      });
    }

    req.query = Object.assign({}, req.query, filters);
    
    return getAllProfiles(req, res);

  } catch (error) {
    console.error("Search Crash:", error);
    return res.status(400).json({ status: "error", message: "Unable to interpret query" });
  }
}

export async function createProfile(req, res) {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ status: 'error', message: 'Missing or empty name' });
    }

    const trimmedName = name.trim();

    const existing = await prisma.profile.findUnique({ where: { name: trimmedName } });
    if (existing) {
      return res.status(200).json({ status: 'success', message: 'Profile already exists', data: formatProfile(existing) });
    }

    const externalData = await getExternalData(trimmedName);

    const newProfile = await prisma.profile.create({
      data: {
        id: uuidv7(),
        name: trimmedName,
        gender: externalData.gender,
        gender_probability: externalData.gender_probability,
        age: externalData.age,
        age_group: externalData.age_group,
        country_id: externalData.country_id,
        country_name: getCountryName(externalData.country_id),
        country_probability: externalData.country_probability,
        created_at: new Date(),
      },
    });

    return res.status(201).json({ status: 'success', data: formatProfile(newProfile) });

  } catch (error) {
    if (error.message?.includes('returned an invalid response')) {
      return res.status(502).json({ status: 'error', message: error.message });
    }
    console.error('createProfile error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}

export async function getProfile(req, res) {
  try {
    const { id } = req.params;
    const profile = await prisma.profile.findUnique({ where: { id } });

    if (!profile) {
      return res.status(404).json({ status: 'error', message: 'Profile not found' });
    }

    return res.status(200).json({ status: 'success', data: formatProfile(profile) });

  } catch (error) {
    console.error('getProfile error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}

export async function deleteProfile(req, res) {
  try {
    const { id } = req.params;
    const profile = await prisma.profile.findUnique({ where: { id } });

    if (!profile) {
      return res.status(404).json({ status: 'error', message: 'Profile not found' });
    }

    await prisma.profile.delete({ where: { id } });
    return res.status(204).send();

  } catch (error) {
    console.error('deleteProfile error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}

function formatProfile(p) {
  return {
    id: p.id,
    name: p.name,
    gender: p.gender,
    gender_probability: p.gender_probability,
    age: p.age,
    age_group: p.age_group,
    country_id: p.country_id,
    country_name: p.country_name,
    country_probability: p.country_probability,
    created_at: p.created_at instanceof Date
      ? p.created_at.toISOString()
      : p.created_at,
  };
}