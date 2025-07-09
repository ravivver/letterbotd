// test_profile_scraper.js
import getProfileStats from './scraper/getProfileStats.js'; // Ajuste o caminho conforme necessário

async function test() {
    try {
        const username = '157'; // Use seu próprio nome de usuário do Letterboxd
        console.log(`Iniciando teste de perfil para ${username}...`);
        const profileStats = await getProfileStats(username);

        if (profileStats) {
            console.log(`Estatísticas do perfil para ${username}:`);
            console.log(profileStats);
        } else {
            console.log(`Nenhuma estatística encontrada para ${username} ou scraper falhou.`);
        }

    } catch (error) {
        console.error("Erro no teste de perfil:", error.message);
    }
}

test();