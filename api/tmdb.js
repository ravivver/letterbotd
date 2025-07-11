// api/tmdb.js (Version that also fetches director - Translated to English)

import axios from 'axios';
import dotenv from 'dotenv'; 

dotenv.config(); 

const TMDB_API_KEY = process.env.TMDB_API_KEY; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/'; 

/**
 * Searches for a movie on TMDB.
 * @param {string} query The movie title to search for.
 * @param {number|null} year The release year of the movie (optional).
 * @returns {Promise<Object|null>} An object with movie details or null if not found/error.
 */
async function searchMovieTMDB(query, year = null) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env'); // Translated
    }

    try {
        const searchResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
            params: { api_key: TMDB_API_KEY, query, year, language: 'en-US' } // Changed language to en-US
        });
        
        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            return null;
        }
        const movieId = searchResponse.data.results[0].id;

        // Make both calls in parallel for optimization
        const [enDetailsResponse, creditsResponse] = await Promise.all([ // Renamed ptDetailsResponse to enDetailsResponse
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
                params: { api_key: TMDB_API_KEY, language: 'en-US' } // Changed language to en-US
            }),
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}/credits`, { // Fetches credits separately
                params: { api_key: TMDB_API_KEY }
            })
        ]);

        const movie = enDetailsResponse.data; // Renamed ptMovie to movie
        const credits = creditsResponse.data; // Renamed enMovie to credits
        
        const directors = credits.crew.filter(member => member.job === 'Director').map(member => member.name); // Corrected to use credits.crew

        return {
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            poster_path: movie.poster_path, // Use the poster from the en-US details
            vote_average: movie.vote_average, 
            genres: movie.genres ? movie.genres.map(g => g.name) : [],
            directors: directors || [],
        };
    } catch (error) {
        console.error(`Error searching movie on TMDB for "${query}" (${year}):`, error.message); // Translated
        return null;
    }
}

/**
 * Constructs a TMDB poster URL.
 * @param {string} posterPath The poster path from TMDB.
 * @param {string} size The desired poster size (e.g., 'w500', 'original').
 * @returns {string|null} The full poster URL or null if posterPath is not provided.
 */
function getTmdbPosterUrl(posterPath, size = 'w500') {
    if (posterPath) {
        return `${TMDB_IMAGE_BASE_URL}${size}${posterPath}`;
    }
    return null;
}

/**
 * Searches for a person (e.g., director) on TMDB.
 * @param {string} name The person's name to search for.
 * @returns {Promise<Object|null>} An object with person details or null if not found/error.
 */
async function searchPersonTMDB(name) {
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured in .env'); // Translated
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/search/person`, {
            params: { api_key: TMDB_API_KEY, query: name }
        });
        return response.data.results && response.data.results.length > 0 ? response.data.results[0] : null;
    } catch (error) {
        console.error(`Error searching person on TMDB for "${name}":`, error.message); // Translated
        return null;
    }
}

/**
 * Fetches detailed information for a person from TMDB.
 * @param {number} personId The TMDB ID of the person.
 * @returns {Promise<Object|null>} An object with detailed person information or null if not found/error.
 */
async function getPersonDetailsTMDB(personId) {
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured in .env'); // Translated
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/person/${personId}`, {
            params: { api_key: TMDB_API_KEY, language: 'en-US' } // Changed language to en-US
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching person details for ID ${personId}:`, error.message); // Translated
        return null;
    }
}

export { 
    searchMovieTMDB, 
    getTmdbPosterUrl,
    searchPersonTMDB,
    getPersonDetailsTMDB
};
