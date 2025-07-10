// api/tmdb.js (Versão que também busca o diretor)

import axios from 'axios';
import dotenv from 'dotenv'; 

dotenv.config(); 

const TMDB_API_KEY = process.env.TMDB_API_KEY; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/'; 

async function searchMovieTMDB(query, year = null) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY não configurada no .env');
    }

    try {
        const searchResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
            params: { api_key: TMDB_API_KEY, query, year, language: 'pt-BR' }
        });
        
        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            return null;
        }
        const movieId = searchResponse.data.results[0].id;

        // Fazemos as duas chamadas em paralelo para otimizar
        const [ptDetailsResponse, enDetailsResponse] = await Promise.all([
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
                params: { api_key: TMDB_API_KEY, language: 'pt-BR', append_to_response: 'credits' }
            }),
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
                params: { api_key: TMDB_API_KEY, language: 'en-US' }
            })
        ]);

        const ptMovie = ptDetailsResponse.data;
        const enMovie = enDetailsResponse.data;
        
        const directors = ptMovie.credits.crew.filter(member => member.job === 'Director').map(member => member.name);

        return {
            id: ptMovie.id,
            title: ptMovie.title,
            overview: ptMovie.overview,
            // Prioriza o pôster em inglês/original, se não houver, usa o em português
            poster_path: enMovie.poster_path || ptMovie.poster_path, 
            vote_average: ptMovie.vote_average, 
            genres: ptMovie.genres ? ptMovie.genres.map(g => g.name) : [],
            directors: directors || [],
        };
    } catch (error) {
        console.error(`Erro ao buscar filme no TMDB para "${query}" (${year}):`, error.message);
        return null;
    }
}

// O resto do arquivo permanece o mesmo...

function getTmdbPosterUrl(posterPath, size = 'w500') {
    if (posterPath) {
        return `${TMDB_IMAGE_BASE_URL}${size}${posterPath}`;
    }
    return null;
}

async function searchPersonTMDB(name) {
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY não configurada no .env');
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/search/person`, {
            params: { api_key: TMDB_API_KEY, query: name }
        });
        return response.data.results && response.data.results.length > 0 ? response.data.results[0] : null;
    } catch (error) {
        console.error(`Erro ao buscar pessoa no TMDB por "${name}":`, error.message);
        return null;
    }
}

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

export { 
    searchMovieTMDB, 
    getTmdbPosterUrl,
    searchPersonTMDB,
    getPersonDetailsTMDB
};