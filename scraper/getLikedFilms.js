// scraper/getLikedFilms.js

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapeia os filmes curtidos (likes) de um usuário do Letterboxd, navegando por todas as páginas.
 * @param {string} username O nome de usuário do Letterboxd.
 * @returns {Promise<Array<Object>>} Uma array de objetos, cada um com o slug e URL do filme curtido.
 * Retorna uma array vazia se nenhum like for encontrado, o perfil for privado ou o usuário não existir.
 */
async function getLikedFilms(username) {
    if (!username) {
        throw new Error('Nome de usuário do Letterboxd é obrigatório.');
    }

    let allLikedFilms = [];
    let currentPage = 1;
    let hasNextPage = true;

    try {
        while (hasNextPage) {
            const url = `https://letterboxd.com/${username}/likes/films/page/${currentPage}/`;
            console.log(`[Scraper - Likes] Buscando filmes curtidos da página ${currentPage} para ${username}...`);

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
                if (currentPage === 1) {
                    throw new Error('Usuário Letterboxd não encontrado.');
                } else {
                    hasNextPage = false;
                    break;
                }
            }

            if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
                throw new Error('Perfil Letterboxd é privado. Não é possível acessar os filmes curtidos.');
            }

            if (response.status === 404 && currentPage === 1) {
                throw new Error('A página do Letterboxd retornou um erro 404 inesperado na primeira tentativa.');
            }
            // --- Fim das Verificações de Erro ---

            // --- NOVO SELETOR PRECISO COM BASE NO HTML FORNECIDO ---
            // Seleciona a div com as classes 'poster' e 'film-poster' que contém os atributos data-
            const likedFilmElements = $('ul.poster-list li .poster.film-poster[data-film-slug]');

            if (!likedFilmElements.length && currentPage === 1) {
                console.log(`[Scraper - Likes] Nenhuma filme curtido encontrado na página 1 para "${username}" com o seletor atual.`);
                return [];
            } else if (!likedFilmElements.length && currentPage > 1) {
                hasNextPage = false;
                break;
            }

            likedFilmElements.each((i, element) => {
                const entry = $(element); // 'entry' agora é a div com as classes 'poster film-poster' e os atributos data-

                const filmSlug = entry.attr('data-film-slug') || null;
                const filmUrlLetterboxd = filmSlug ? `https://letterboxd.com/film/${filmSlug}/` : 'N/A';

                // Usar data-film-name para obter Título e Ano
                let filmTitle = 'N/A';
                let filmYear = null;
                const dataFilmName = entry.attr('data-film-name');
                if (dataFilmName) {
                    const match = dataFilmName.match(/^(.*)\s\((\d{4})\)$/);
                    if (match) {
                        filmTitle = match[1].trim();
                        filmYear = parseInt(match[2]);
                    } else {
                        filmTitle = dataFilmName.trim(); // Se não tiver ano, pega só o nome
                    }
                } else {
                    // Fallback para alt da imagem se data-film-name não estiver presente
                    const imgElement = entry.find('img.image');
                    if (imgElement.length) {
                        filmTitle = imgElement.attr('alt') || 'N/A';
                    }
                }

                if (filmSlug) { // Só adiciona se tiver um slug válido
                    allLikedFilms.push({
                        title: filmTitle, // Agora deve vir de data-film-name ou alt
                        year: filmYear,   // Agora deve vir de data-film-name (se presente)
                        slug: filmSlug,   // Vindo de data-film-slug
                        url: filmUrlLetterboxd
                    });
                } else {
                    console.log(`[Scraper - Likes] Aviso: Slug não encontrado para um filme curtido na página ${currentPage}. Entrada: ${entry.html().substring(0, 100)}...`);
                }
            });

            currentPage++;
            const nextButton = $('.pagination .next');
            const prevButton = $('.pagination .previous');

            if (nextButton.length > 0) {
                hasNextPage = true;
            } else if (prevButton.length > 0 && nextButton.length === 0) {
                hasNextPage = false;
            } else {
                hasNextPage = false;
            }

            if (hasNextPage) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return allLikedFilms;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Não foi possível conectar ao Letterboxd. Verifique sua conexão com a internet.');
        }
        if (error.message.includes('Perfil Letterboxd é privado') || error.message.includes('Usuário Letterboxd não encontrado')) {
            throw error;
        }
        console.error(`Erro inesperado ao raspar filmes curtidos do usuário ${username}:`, error.message);
        throw new Error(`Ocorreu um erro inesperado ao buscar os filmes curtidos de ${username}. Tente novamente mais tarde. Detalhes: ${error.message}`);
    }
}

export default getLikedFilms;