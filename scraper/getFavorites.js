// scraper/getFavorites.js - VERSÃO FINAL PARA PEGAR SLUG E NOME DOS ATRIBUTOS DATA-

import axios from 'axios';
import * as cheerio from 'cheerio';

async function getFavorites(username) {
    if (!username) {
        throw new Error('Nome de usuário do Letterboxd é obrigatório.');
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

        // --- Verificações de Erro na Página ---
        const pageTitle = $('title').text();
        const mainContent = $('#content').text();

        if (mainContent.includes('Sorry, we can’t find the page you’ve requested.')) {
            throw new Error('Usuário Letterboxd não encontrado.');
        }

        if (pageTitle.includes('Profile is Private') || mainContent.includes('This profile is private')) {
            throw new Error('Perfil Letterboxd é privado. Não é possível acessar os favoritos.');
        }

        if (response.status === 404) {
            throw new Error('A página do Letterboxd retornou um erro 404 inesperado.');
        }
        // --- Fim das Verificações de Erro na Página ---

        const favoritesSection = $('#favourites');
        if (!favoritesSection.length) {
            console.log('Debug Favorites: Seção #favourites não encontrada. O usuário pode não ter favoritos.');
            return [];
        }

        const favoriteFilmElements = favoritesSection.find('.poster-list li.favourite-film-poster-container');

        if (!favoriteFilmElements.length) {
            console.log('Debug Favorites: Nenhum elemento de filme favorito (.poster-list li.favourite-film-poster-container) encontrado. A seção de favoritos pode estar vazia ou os seletores iniciais estão incorretos.');
            return [];
        }

        favoriteFilmElements.slice(0, 4).each((i, element) => {
            const entry = $(element);
            console.log(`Debug Favorites ${i}: Processando entrada...`);

            let filmTitle = 'N/A';
            let filmYear = null;
            let filmSlug = null;
            let filmUrlLetterboxd = 'N/A';

            // --- TENTATIVA PRIMÁRIA E AGRESSIVA: Encontrar data-film-slug e data-film-name ---
            // Primeiro no próprio LI
            filmSlug = entry.attr('data-film-slug') || null;
            let currentFilmName = entry.attr('data-film-name') || null;

            // Se não encontrou no LI, procurar em qualquer descendente
            if (!filmSlug || !currentFilmName) {
                const descendantWithData = entry.find('[data-film-slug], [data-film-name]').first(); // Pega o primeiro que encontrar
                if (descendantWithData.length) {
                    filmSlug = filmSlug || descendantWithData.attr('data-film-slug') || null;
                    currentFilmName = currentFilmName || descendantWithData.attr('data-film-name') || null;
                }
            }

            if (filmSlug) {
                filmUrlLetterboxd = `https://letterboxd.com/film/${filmSlug}/`;
                console.log(`Debug Favorites ${i}: Slug encontrado: ${filmSlug}`);
            } else {
                console.log(`Debug Favorites ${i}: Slug NÃO encontrado após todas as tentativas.`);
            }

            if (currentFilmName) {
                const match = currentFilmName.match(/^(.*)\s\((\d{4})\)$/);
                if (match) {
                    filmTitle = match[1].trim();
                    filmYear = parseInt(match[2]);
                    console.log(`Debug Favorites ${i}: Título/Ano de data-film-name: ${filmTitle} (${filmYear})`);
                } else {
                    filmTitle = currentFilmName.trim();
                    console.log(`Debug Favorites ${i}: Título de data-film-name (sem ano): ${filmTitle}`);
                }
            } else {
                console.log(`Debug Favorites ${i}: Atributo data-film-name NÃO encontrado.`);
            }
            // --- FIM DA EXTRAÇÃO DE ATRIBUTOS DATA- ---


            // --- FALLBACK para TÍTULO (usando alt da imagem, se necessário) ---
            if (filmTitle === 'N/A') { // Se o título ainda não foi pego de data-film-name
                const imgElement = entry.find('.film-poster img.image');
                if (imgElement.length) {
                    const altText = imgElement.attr('alt');
                    if (altText) {
                        filmTitle = altText.trim();
                        console.log(`Debug Favorites ${i}: Título extraído do alt da imagem (fallback): ${filmTitle}`);
                    }
                }
            }
            // O ano será pego do getFilmDetailsFromSlug

            // --- Log final para ver o que foi obtido para esta entrada ---
            console.log(`Debug Favorites ${i}: Resultado final (slug para próxima etapa) -> Título provisório: "${filmTitle}", Slug: "${filmSlug}", URL: "${filmUrlLetterboxd}"`);

            favoriteFilms.push({
                title: filmTitle, // Título provisório, será refinado depois
                year: filmYear,   // Ano provisório, será refinado depois
                slug: filmSlug,   // ESSENCIAL para a próxima etapa
                url: filmUrlLetterboxd
            });
        });

        if (favoriteFilms.length === 0) {
            console.log(`Debug: Nenhuma filme favorito processado para "${username}". Verifique os seletores ou se o usuário realmente tem favoritos.`);
        }

        return favoriteFilms;

    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
            throw new Error('Não foi possível conectar ao Letterboxd. Verifique sua conexão com a internet.');
        }
        if (error.message.includes('Perfil Letterboxd é privado') || error.message.includes('Usuário Letterboxd não encontrado')) {
            throw error;
        }
        console.error(`Erro inesperado ao raspar favoritos do usuário ${username}:`, error.message);
        throw new Error(`Ocorreu um erro inesperado ao buscar os filmes favoritos de ${username}. Tente novamente mais tarde. Detalhes: ${error.message}`);
    }
}

export default getFavorites;