// api/tmdb.js

import axios from 'axios';
import dotenv from 'dotenv'; 

dotenv.config(); 

const TMDB_API_KEY = process.env.TMDB_API_KEY; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/'; 

// --- SUAS FUNÇÕES ORIGINAIS (SEM ALTERAÇÃO) ---

async function searchMovieTMDB(query, year = null) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY não configurada no .env');
    }
    // ... (código original inalterado)
    try {
        const searchResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, { 
            params: { api_key: TMDB_API_KEY, query, year, language: 'pt-BR' } 
        });
        
        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            return null;
        }
        const movieId = searchResponse.data.results[0].id;

        const ptDetailsResponse = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
            params: { api_key: TMDB_API_KEY, language: 'pt-BR' }
        });
        const enDetailsResponse = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
            params: { api_key: TMDB_API_KEY, language: 'en-US' }
        });

        return {
            id: ptDetailsResponse.data.id,
            title: ptDetailsResponse.data.title,
            overview: ptDetailsResponse.data.overview,
            poster_path: enDetailsResponse.data.poster_path || ptDetailsResponse.data.poster_path,
            vote_average: ptDetailsResponse.data.vote_average, 
            genres: ptDetailsResponse.data.genres ? ptDetailsResponse.data.genres.map(g => g.name) : [],
        };
    } catch (error) {
        console.error(`Erro ao buscar filme no TMDB para "${query}" (${year}):`, error.message);
        return null;
    }
}

function getTmdbPosterUrl(posterPath, size = 'w500') {
    if (posterPath) {
        return `${TMDB_IMAGE_BASE_URL}${size}${posterPath}`;
    }
    return null;
}


// --- NOVAS FUNÇÕES PARA BUSCAR DIRETORES ---

/**
 * Busca por uma pessoa (diretor) no TMDB.
 * @param {string} name O nome da pessoa para buscar.
 * @returns {Promise<Object|null>} O objeto da pessoa mais relevante, ou null.
 */
async function searchPersonTMDB(name) {
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY não configurada no .env');
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/search/person`, {
            params: { api_key: TMDB_API_KEY, query: name }
        });
        // Retorna o primeiro resultado, que geralmente é o mais popular/relevante
        return response.data.results && response.data.results.length > 0 ? response.data.results[0] : null;
    } catch (error) {
        console.error(`Erro ao buscar pessoa no TMDB por "${name}":`, error.message);
        return null;
    }
}

/**
 * Busca detalhes completos de uma pessoa no TMDB.
 * @param {number} personId O ID da pessoa no TMDB.
 * @returns {Promise<Object|null>} Objeto com detalhes da pessoa, ou null.
 */
async function getPersonDetailsTMDB(personId) {
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY não configurada no .env');
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/person/${personId}`, {
            params: { api_key: TMDB_API_KEY, language: 'pt-BR' }
        });
        return response.data;
    } catch (error) {
        console.error(`Erro ao buscar detalhes da pessoa ID ${personId}:`, error.message);
        return null;
    }
}


// Exporta todas as funções, incluindo as novas
export { 
    searchMovieTMDB, 
    getTmdbPosterUrl,
    searchPersonTMDB,
    getPersonDetailsTMDB
};