// api/tmdb.js

import axios from 'axios';
import dotenv from 'dotenv'; 

dotenv.config(); 

const TMDB_API_KEY = process.env.TMDB_API_KEY; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/'; 

/**
 * Busca detalhes de um filme no TMDB.
 * @param {string} query Título do filme para buscar.
 * @param {number} [year] Ano de lançamento (opcional, para refinar a busca).
 * @returns {Promise<Object|null>} Objeto com detalhes do filme TMDB, ou null se não encontrado.
 */
async function searchMovieTMDB(query, year = null) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY não configurada no .env');
    }

    try {
        const commonParams = {
            api_key: TMDB_API_KEY,
            query: query
        };
        if (year) {
            commonParams.year = year;
        }

        // 1. Busca inicial para encontrar o filme ID (em português para o match)
        const searchResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, { 
            params: { ...commonParams, language: 'pt-BR' } 
        });
        
        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            return null; // Filme não encontrado
        }

        const movieId = searchResponse.data.results[0].id; // Pega o ID do filme mais relevante

        // 2. Busca de detalhes em português (para título, gêneros, etc.)
        const ptDetailsResponse = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
            params: { api_key: TMDB_API_KEY, language: 'pt-BR' }
        });
        const ptMovie = ptDetailsResponse.data;

        // 3. Busca de detalhes em inglês (para pôster original e sinopse potencialmente melhor)
        const enDetailsResponse = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
            params: { api_key: TMDB_API_KEY, language: 'en-US' } // Busca em inglês/original
        });
        const enMovie = enDetailsResponse.data;

        return {
            id: ptMovie.id,
            title: ptMovie.title, // Título em PT
            original_title: ptMovie.original_title,
            release_date: ptMovie.release_date,
            overview: ptMovie.overview, // Sinopse em PT
            poster_path: enMovie.poster_path, // Pôster da versão em inglês/original
            vote_average: ptMovie.vote_average, 
            vote_count: ptMovie.vote_count,     
            genres: ptMovie.genres ? ptMovie.genres.map(g => g.name) : [],
            overview_en: enMovie.overview // Sinopse em inglês, como alternativa
        };
    } catch (error) {
        console.error(`Erro ao buscar filme no TMDB para "${query}" (${year}):`, error.message);
        // Se for erro 404, pode significar que o filme não tem dados em PT/EN.
        if (error.response && error.response.status === 404) {
            return null; // Trata como não encontrado
        }
        throw new Error(`Erro ao buscar filme no TMDB: ${error.message}`);
    }
}

/**
 * Constrói a URL completa para um pôster do TMDB.
 * @param {string} posterPath O caminho relativo do pôster retornado pela API do TMDB (ex: /abcd123.jpg).
 * @param {string} size O tamanho desejado do pôster (ex: 'w500', 'original').
 * @returns {string|null} A URL completa do pôster, ou null.
 */
function getTmdbPosterUrl(posterPath, size = 'w500') {
    if (posterPath) {
        return `${TMDB_IMAGE_BASE_URL}${size}${posterPath}`;
    }
    return null;
}

export { searchMovieTMDB, getTmdbPosterUrl };