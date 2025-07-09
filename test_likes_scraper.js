// test_likes_scraper.js
import getLikedFilms from './scraper/getLikedFilms.js'; // Ajuste o caminho conforme necessário

async function test() {
    try {
        const username = '157'; // Use o seu nome de usuário ou um com muitos likes
        console.log(`Iniciando teste de likes para ${username}...`);
        const likedFilms = await getLikedFilms(username);

        if (likedFilms.length > 0) {
            console.log(`Total de filmes curtidos encontrados para ${username}: ${likedFilms.length}`);
            likedFilms.forEach((film, index) => {
                console.log(`Filme ${index + 1}: ${film.title} (${film.year}) - Slug: ${film.slug} - URL: ${film.url}`);
            });
        } else {
            console.log(`Nenhum filme curtido encontrado para ${username} ou scraper falhou.`);
        }

    } catch (error) {
        console.error("Erro no teste de likes:", error.message);
    }
}

test();