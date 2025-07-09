// scraper/getProfileStats.js

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapeia as estatísticas e informações gerais do perfil de um usuário do Letterboxd.
 * @param {string} username O nome de usuário do Letterboxd.
 * @returns {Promise<Object>} Um objeto contendo estatísticas do perfil (filmes assistidos, etc.) e as tags.
 * Retorna null ou lança erro se o perfil não for encontrado ou for privado.
 */
async function getProfileStats(username) {
    if (!username) {
        throw new Error('Nome de usuário do Letterboxd é obrigatório.');
    }

    const url = `https://letterboxd.com/${username}/`;
    console.log(`[Scraper - Profile] Buscando estatísticas do perfil para ${username} na URL: ${url}`);

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

        // --- Verificações de Erro na Página ---
        const pageTitle = $('title').text();
        const mainContent = $('#content').text();

        if (mainContent.includes('Sorry, we can’t find the page you’ve requested.')) {
            throw new Error('Usuário Letterboxd não encontrado.');
        }

        if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
            throw new Error('Perfil Letterboxd é privado. Não é possível acessar as estatísticas.');
        }

        if (response.status === 404) {
            throw new Error('A página do Letterboxd retornou um erro 404 inesperado.');
        }
        // --- Fim das Verificações de Error ---

        const stats = {
            totalFilmsWatched: 'N/A',
            filmsThisYear: 'N/A',
            following: 'N/A',
            followers: 'N/A',
            watchlistCount: 'N/A',
            tagsList: [], // Alterado de tagsCount para tagsList (Array de strings)
            userAvatarUrl: null,
            profileUrl: url
        };

        // --- EXTRAIR AVATAR ---
        const avatarImg = $('div.profile-avatar span.avatar img');
        if (avatarImg.length) {
            stats.userAvatarUrl = avatarImg.attr('src');
        } else {
            console.log("[Scraper - Profile] Aviso: Avatar não encontrado com o seletor atual.");
        }

        // --- EXTRAIR ESTATÍSTICAS PRINCIPAIS (Films, This year, Following, Followers) ---
        const profileStatsDiv = $('div.profile-stats.js-profile-stats');
        if (profileStatsDiv.length) {
            const filmsWatchedElement = profileStatsDiv.find('h4.profile-statistic a[href$="/films/"] .value');
            if (filmsWatchedElement.length) stats.totalFilmsWatched = filmsWatchedElement.text().trim();

            const filmsThisYearElement = profileStatsDiv.find('h4.profile-statistic a[href*="/films/diary/for/"] .value');
            if (filmsThisYearElement.length) stats.filmsThisYear = filmsThisYearElement.text().trim();

            const followingElement = profileStatsDiv.find('h4.profile-statistic a[href$="/following/"] .value');
            if (followingElement.length) stats.following = followingElement.text().trim();

            const followersElement = profileStatsDiv.find('h4.profile-statistic a[href$="/followers/"] .value');
            if (followersElement.length) stats.followers = followersElement.text().trim();

        } else {
            console.log("[Scraper - Profile] Aviso: Div de estatísticas do perfil (profile-stats) não encontrada.");
        }

        // --- EXTRAIR WATCHLIST COUNT ---
        const watchlistSection = $('section.watchlist-aside');
        if (watchlistSection.length) {
            const watchlistCountElement = watchlistSection.find('a.all-link');
            if (watchlistCountElement.length) stats.watchlistCount = watchlistCountElement.text().trim();
        } else {
            console.log("[Scraper - Profile] Aviso: Seção Watchlist não encontrada.");
        }

        // --- EXTRAIR TAGS (Os Nomes das Tags) ---
        // Baseado em: <section class="section"> ... <ul class="tags clear"> <li> <a href="..."> qb </a> </li> </ul>
        const tagsSection = $('section:has(h3.section-heading a[href$="/tags/"])');
        if (tagsSection.length) {
            const tagElements = tagsSection.find('ul.tags li a');
            if (tagElements.length) {
                tagElements.each((i, el) => {
                    stats.tagsList.push($(el).text().trim());
                });
            } else {
                console.log("[Scraper - Profile] Aviso: Nenhuma tag encontrada dentro da seção de tags.");
            }
        } else {
            console.log("[Scraper - Profile] Aviso: Seção Tags não encontrada.");
        }

        console.log(`[Scraper - Profile] Estatísticas para ${username}:`, stats);

        return stats;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Não foi possível conectar ao Letterboxd. Verifique sua conexão com a internet.');
        }
        if (error.message.includes('Perfil Letterboxd é privado') || error.message.includes('Usuário Letterboxd não encontrado')) {
            throw error;
        }
        console.error(`Erro inesperado ao raspar perfil do usuário ${username}:`, error.message);
        throw new Error(`Ocorreu um erro inesperado ao buscar o perfil de ${username}. Tente novamente mais tarde. Detalhes: ${error.message}`);
    }
}

export default getProfileStats;