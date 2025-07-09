// test_favorites.js
import getFavorites from './scraper/getFavorites.js'; // Ajuste o caminho conforme necessário

async function test() {
    try {
        const username = 'gvnxzn'; // Use o nome de usuário que tem favoritos
        console.log(`Iniciando teste de favoritos para ${username}...`);
        const favorites = await getFavorites(username);

        if (favorites.length > 0) {
            console.log(`Total de filmes favoritos encontrados para ${username}: ${favorites.length}`);
            favorites.forEach((film, index) => {
                console.log(`Filme ${index + 1}: ${film.title} (${film.year}) - Slug: ${film.slug} - URL: ${film.url}`);
            });
        } else {
            console.log(`Nenhum filme favorito encontrado para ${username} ou scraper falhou.`);
        }

    } catch (error) {
        console.error("Erro no teste de favoritos:", error.message);
    }
}

test();