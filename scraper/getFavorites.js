import axios from 'axios';
import * as cheerio from 'cheerio';

async function getFavorites(username) {
    if (!username) {
        throw new Error('Letterboxd username is required.');
    }

    const url = `https://letterboxd.com/${username}/`;
    const favoriteFilms = [];

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 300 || status === 404;
            },
        });

        const $ = cheerio.load(response.data);

        const pageTitle = $('title').text();
        const mainContent = $('#content').text();

        if (mainContent.includes('Sorry, we can’t find the page you’ve requested.')) {
            throw new Error('Letterboxd user not found.');
        }
        if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
            throw new Error('Letterboxd profile is private. Cannot access favorites.');
        }
        if (response.status === 404) {
            throw new Error('The Letterboxd page returned an unexpected 404 error.');
        }

        const favoritesSection = $('#favourites, section:has(h3.section-heading:contains("Favorite films"))');
        if (!favoritesSection.length) {
            console.log('Debug Favorites: Section for favorites not found.');
            return [];
        }

        // NOVO SELETOR CORRIGIDO: Busca pelo item da lista que tem o atributo data-item-slug 
        // ou a classe favourite-production-poster-container
        const favoriteFilmElements = favoritesSection.find('.favourite-production-poster-container'); 

        if (!favoriteFilmElements.length) {
            console.log('Debug Favorites: No favorite film elements found. Favorites section might be empty or selectors are incorrect.');
            return [];
        }

        favoriteFilmElements.slice(0, 4).each((i, element) => {
            const entry = $(element);
            
            // Procura o componente React que contém os metadados (slug, nome)
            const reactComponent = entry.find('.react-component[data-item-slug]').first();

            if (reactComponent.length === 0) {
                 console.log(`Debug Favorites ${i}: React component data not found.`);
                 return true; 
            }

            const filmSlug = reactComponent.attr('data-item-slug') || null;
            const currentFilmName = reactComponent.attr('data-item-name') || 'N/A';
            let filmTitle = 'N/A';
            let filmYear = null;

            // Extrai Título e Ano do atributo data-item-name (Ex: "The Double (2013)")
            if (currentFilmName !== 'N/A') {
                const match = currentFilmName.match(/^(.*)\s\((\d{4})\)$/);
                if (match) {
                    filmTitle = match[1].trim();
                    filmYear = parseInt(match[2]);
                } else {
                    filmTitle = currentFilmName.trim();
                }
            } 
            
            const filmUrlLetterboxd = filmSlug ? `https://letterboxd.com/film/${filmSlug}/` : 'N/A';

            if (filmSlug) { 
                favoriteFilms.push({
                    title: filmTitle, 
                    year: filmYear,   
                    slug: filmSlug,   
                    url: filmUrlLetterboxd
                });
            } else {
                console.log(`Debug Favorites: Warning: Slug not found for a favorite film.`);
            }
        });

        if (favoriteFilms.length === 0) {
            console.log(`Debug: No favorite film processed for "${username}". Check if the user has at least one film set as favorite.`);
        }

        return favoriteFilms;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Could not connect to Letterboxd. Check your internet connection.');
        }
        if (error.message.includes('Profile is Private') || error.message.includes('User not found') || error.message.includes('404')) {
            throw error;
        }
        console.error(`Unexpected error scraping user favorites for ${username}:`, error.message);
        throw new Error(`An unexpected error occurred while fetching ${username}'s favorite movies. Please try again later. Details: ${error.message}`);
    }
}

export default getFavorites;