// api/tmdb.js

import axios from 'axios';
import dotenv from 'dotenv'; 

dotenv.config(); // Load environment variables

const TMDB_API_KEY = process.env.TMDB_API_KEY; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/'; 

/**
 * Searches for a movie on TMDB.
 * @param {string} query The movie title to search for.
 * @param {number|null} year The release year of the movie (optional).
 * @returns {Promise<Object|null>} An object with movie details or null if not found/error.
 * @throws {Error} If TMDB_API_KEY is not configured.
 */
async function searchMovieTMDB(query, year = null) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env'); 
    }

    try {
        // Search for the movie by title and optional year
        const searchResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
            params: { api_key: TMDB_API_KEY, query, year, language: 'en-US' } 
        });
        
        // If no results or empty results, return null
        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            return null;
        }
        const movieId = searchResponse.data.results[0].id; // Get the ID of the first result

        // Fetch movie details and credits in parallel for efficiency
        const [enDetailsResponse, creditsResponse] = await Promise.all([
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
                params: { api_key: TMDB_API_KEY, language: 'en-US' } 
            }),
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}/credits`, { 
                params: { api_key: TMDB_API_KEY }
            })
        ]);

        const movie = enDetailsResponse.data;
        const credits = creditsResponse.data;
        
        // Extract directors from the crew list
        const directors = credits.crew.filter(member => member.job === 'Director').map(member => member.name);

        // Return a structured movie object
        return {
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            poster_path: movie.poster_path,
            vote_average: movie.vote_average, 
            genres: movie.genres ? movie.genres.map(g => g.name) : [],
            directors: directors || [],
            release_date: movie.release_date // ADDED: Includes release date
        };
    } catch (error) {
        console.error(`Error searching movie on TMDB for "${query}" (${year}):`, error.message); 
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
 * @throws {Error} If TMDB_API_KEY is not configured.
 */
async function searchPersonTMDB(name) {
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured in .env'); 
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/search/person`, {
            params: { api_key: TMDB_API_KEY, query: name }
        });
        return response.data.results && response.data.results.length > 0 ? response.data.results[0] : null;
    } catch (error) {
        console.error(`Error searching person on TMDB for "${name}":`, error.message); 
        return null;
    }
}

/**
 * Fetches detailed information for a person from TMDB.
 * @param {number} personId The TMDB ID of the person.
 * @returns {Promise<Object|null>} An object with detailed person information or null if not found/error.
 * @throws {Error} If TMDB_API_KEY is not configured.
 */
async function getPersonDetailsTMDB(personId) {
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured in .env'); 
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/person/${personId}`, {
            params: { api_key: TMDB_API_KEY, language: 'en-US' } 
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching person details for ID ${personId}:`, error.message); 
        return null;
    }
}

/**
 * Fetches similar movies for a given TMDB movie ID.
 * @param {number} movieId The TMDB ID of the movie.
 * @returns {Promise<Array<Object>>} An array of similar movie objects, or an empty array if none found/error.
 * @throws {Error} If TMDB_API_KEY is not configured or movieId is missing.
 */
async function getSimilarMoviesTMDB(movieId) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env');
    }
    if (!movieId) {
        throw new Error('Movie ID is required to fetch similar movies.');
    }

    try {
        const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}/similar`, {
            params: { api_key: TMDB_API_KEY, language: 'en-US' }
        });

        if (!response.data.results || response.data.results.length === 0) {
            return [];
        }

        // Map relevant movie properties
        return response.data.results.map(movie => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            poster_path: movie.poster_path,
            overview: movie.overview,
            vote_average: movie.vote_average
        }));

    } catch (error) {
        console.error(`Error fetching similar movies for TMDB ID ${movieId}:`, error.message);
        return [];
    }
}

/**
 * Fetches soundtrack details (composers and videos/trailers) for a given TMDB movie ID.
 * @param {number} movieId The TMDB ID of the movie.
 * @returns {Promise<Object|null>} An object with composers, trailer URLs, etc., or null if not found/error.
 * @throws {Error} If TMDB_API_KEY is not configured or movieId is missing.
 */
async function getMovieSoundtrackDetailsTMDB(movieId) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env');
    }
    if (!movieId) {
        throw new Error('Movie ID is required to fetch soundtrack details.');
    }

    try {
        // Fetch credits and videos in parallel
        const [creditsResponse, videosResponse] = await Promise.all([
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}/credits`, {
                params: { api_key: TMDB_API_KEY }
            }),
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}/videos`, {
                params: { api_key: TMDB_API_KEY, language: 'en-US' }
            })
        ]);

        // Filter for original music composers
        const composers = creditsResponse.data.crew
            .filter(member => member.department === 'Sound' && member.job === 'Original Music Composer')
            .map(member => member.name);

        // Filter for official trailers
        const trailers = videosResponse.data.results
            .filter(video => video.site === 'YouTube' && video.type === 'Trailer')
            .map(video => `https://www.youtube.com/watch?v=${video.key}`); // Full YouTube URL
        
        // Filter for main theme or OST clips
        const mainThemeOrOST = videosResponse.data.results
            .filter(video => video.site === 'YouTube' && (video.type === 'Clip' || video.type === 'Teaser' || video.type === 'Soundtrack'))
            .sort((a, b) => b.size - a.size) // Prioritize higher quality/size
            .map(video => `https://www.youtube.com/watch?v=${video.key}`); // Full YouTube URL


        return {
            composers: composers,
            trailers: trailers.slice(0, 3), // Limit to 3 trailers
            ost_videos: mainThemeOrOST.slice(0, 3) // Limit to 3 OST videos
        };

    } catch (error) {
        console.error(`Error fetching soundtrack details for TMDB ID ${movieId}:`, error.message);
        return null;
    }
}

/**
 * Fetches a list of genres from TMDB.
 * @returns {Promise<Array<Object>>} An array of genre objects (id, name).
 * @throws {Error} If TMDB_API_KEY is not configured.
 */
async function getTmdbGenres() {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env');
    }
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/genre/movie/list`, {
            params: { api_key: TMDB_API_KEY, language: 'en-US' }
        });
        return response.data.genres;
    } catch (error) {
        console.error(`Error fetching TMDB genres:`, error.message);
        return [];
    }
}

/**
 * Discovers movies based on various filters (year, genre, country).
 * @param {object} filters Object containing filter criteria.
 * @param {number} [filters.year] Release year of the movie.
 * @param {string} [filters.genreIds] Comma-separated TMDB genre IDs.
 * @param {string} [filters.countryCode] ISO 3166-1 country code (e.g., 'US', 'BR').
 * @param {number} [page=1] Page number for results.
 * @returns {Promise<Array<Object>>} An array of movie objects.
 * @throws {Error} If TMDB_API_KEY is not configured.
 */
async function discoverMoviesTMDB(filters = {}, page = 1) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env');
    }

    const params = {
        api_key: TMDB_API_KEY,
        language: 'en-US',
        sort_by: 'popularity.desc', // Sort by popularity in descending order
        page: page,
        'vote_count.gte': 50 // Minimum vote count to filter out less known movies
    };

    if (filters.year) {
        params.primary_release_year = filters.year;
    }
    if (filters.genreIds) {
        params.with_genres = filters.genreIds;
    }
    if (filters.countryCode) {
        params.with_origin_country = filters.countryCode;
    }

    try {
        const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, { params });
        // Map relevant movie properties from the discovery results
        return response.data.results.map(movie => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date, // ADDED: Includes release date
            overview: movie.overview,
            poster_path: movie.poster_path,
            vote_average: movie.vote_average,
            genre_ids: movie.genre_ids
        }));
    } catch (error) {
        console.error(`Error discovering movies on TMDB with filters ${JSON.stringify(filters)}:`, error.message);
        return [];
    }
}

/**
 * Searches for movies on TMDB by title and optional year.
 * @param {string} query The movie title to search for.
 * @param {number|null} year Optional: The release year to refine the search.
 * @returns {Promise<Object>} The TMDB search results object.
 * @throws {Error} If TMDB_API_KEY is not configured.
 */
async function searchMoviesTMDB(query, year = null) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env');
    }
    try {
        let url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
        if (year) {
            url += `&primary_release_year=${year}`;
        }
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Error searching movie on TMDB:', error.message);
        return { results: [] };
    }
}

// Export all functions for use in other modules
export { 
    searchMovieTMDB, 
    getTmdbPosterUrl,
    searchPersonTMDB,
    getPersonDetailsTMDB,
    getSimilarMoviesTMDB,
    getMovieSoundtrackDetailsTMDB,
    getTmdbGenres,
    discoverMoviesTMDB, 
    searchMoviesTMDB
};