import axios from 'axios';
import dotenv from 'dotenv'; 

dotenv.config();

const TMDB_API_KEY = process.env.TMDB_API_KEY; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://media.themoviedb.org/t/p/'; 

async function searchMovieTMDB(query, year = null) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env'); 
    }

    try {
        const searchResponse = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
            params: { api_key: TMDB_API_KEY, query, year, language: 'en-US' } 
        });
        
        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            return null;
        }
        const movieId = searchResponse.data.results[0].id; 

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
        
        const directors = credits.crew.filter(member => member.job === 'Director').map(member => member.name);

        return {
            id: movie.id, // Adicionado o ID do TMDB
            title: movie.title,
            overview: movie.overview,
            poster_path: movie.poster_path,
            vote_average: movie.vote_average, 
            genres: movie.genres ? movie.genres.map(g => g.name) : [],
            directors: directors || [],
            release_date: movie.release_date 
        };
    } catch (error) {
        console.error(`Error searching movie on TMDB for "${query}" (${year}):`, error.message); 
        return null;
    }
}

function getTmdbPosterUrl(posterPath, size = 'w500') {
    if (posterPath) {
        return `${TMDB_IMAGE_BASE_URL}${size}${posterPath}`;
    }
    return null;
}

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

async function getMovieSoundtrackDetailsTMDB(movieId) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env');
    }
    if (!movieId) {
        throw new Error('Movie ID is required to fetch soundtrack details.');
    }

    try {
        const [creditsResponse, videosResponse] = await Promise.all([
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}/credits`, {
                params: { api_key: TMDB_API_KEY }
            }),
            axios.get(`${TMDB_BASE_URL}/movie/${movieId}/videos`, {
                params: { api_key: TMDB_API_KEY, language: 'en-US' }
            })
        ]);

        const composers = creditsResponse.data.crew
            .filter(member => member.department === 'Sound' && member.job === 'Original Music Composer')
            .map(member => member.name);

        const trailers = videosResponse.data.results
            .filter(video => video.site === 'YouTube' && video.type === 'Trailer')
            .map(video => `https://www.youtube.com/watch?v=${video.key}`);
        
        const mainThemeOrOST = videosResponse.data.results
            .filter(video => video.site === 'YouTube' && (video.type === 'Clip' || video.type === 'Teaser' || video.type === 'Soundtrack'))
            .sort((a, b) => b.size - a.size) 
            .map(video => `https://www.youtube.com/watch?v=${video.key}`);


        return {
            composers: composers,
            trailers: trailers.slice(0, 3), 
            ost_videos: mainThemeOrOST.slice(0, 3) 
        };

    } catch (error) {
        console.error(`Error fetching soundtrack details for TMDB ID ${movieId}:`, error.message);
        return null;
    }
}

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

async function discoverMoviesTMDB(filters = {}, page = 1) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env');
    }

    const params = {
        api_key: TMDB_API_KEY,
        language: 'en-US',
        sort_by: 'popularity.desc', 
        page: page,
        'vote_count.gte': 50 
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
        return response.data.results.map(movie => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date, 
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

async function getMovieQuotesTMDB(movieId) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY not configured in .env');
    }
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}/quotes`, {
            params: { api_key: TMDB_API_KEY, language: 'en-US' }
        });
        if (response.data.results && response.data.results.length > 0) {
            return response.data.results[0].content; 
        }
        return null;
    } catch (error) {
        console.error(`Error fetching quotes for TMDB ID ${movieId}:`, error.message);
        return null;
    }
}


export { 
    searchMovieTMDB, 
    getTmdbPosterUrl,
    searchPersonTMDB,
    getPersonDetailsTMDB,
    getSimilarMoviesTMDB,
    getMovieSoundtrackDetailsTMDB,
    getTmdbGenres,
    discoverMoviesTMDB, 
    searchMoviesTMDB,
    getMovieQuotesTMDB
};