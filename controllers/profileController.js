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
    const { gender, country_id, age_group } = req.query;
    
    const filter = {};

    if (gender) {
        filter.gender = { equals: gender, mode: 'insensitive' };
    }
    if (country_id) {
        filter.country_id = { equals: country_id, mode: 'insensitive' };
    }
    if (age_group) {
        filter.age_group = { equals: age_group, mode: 'insensitive' };
    }

    try {
        const profiles = await prisma.profile.findMany({
            where: filter,
            select: {
                id: true,
                name: true,
                gender: true,
                age: true,
                age_group: true,
                country_id: true,
                created_at: true
            }
        });

        return res.status(200).json({
            status: "success",
            count: profiles.length,
            data: profiles
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
};

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