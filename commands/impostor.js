// commands/impostor.js

import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 
import { getFullDiary } from '../scraper/getFullDiary.js'; // getFullDiary.js é o que busca todas as páginas
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js'; //
import { revealImpostorAnswer, createGridImage } from '../utils/formatEmbed.js'; // Importa a nova função de revelação e createGridImage
import { searchLetterboxd } from '../scraper/searchLetterboxd.js'; // Importa para buscar links Letterboxd

// Resolve __filename e __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json'); //

// Mapa para gerenciar sessões ativas de Impostor por canal
const activeImpostorGames = new Map(); // channelId -> { targetUserId, correctImpostorMovieId, timeoutId, guessedUsers: Set<userId> }

// Tempo limite para o quiz do Impostor (30 segundos)
const IMPOSTOR_TIMEOUT_MS = 30000;
const NUMBER_OF_OPTIONS = 10; // Total de filmes a serem exibidos (1 impostor + 9 amados)

/**
 * Função auxiliar para normalizar strings para comparação (útil para títulos de filmes).
 * Remove caracteres não alfanuméricos (exceto espaços), reduz múltiplos espaços para um único, e remove espaços no início/fim.
 * @param {string} str A string a ser normalizada.
 * @returns {string} A string normalizada.
 */
function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase()
              .replace(/[^a-z0-9 ]/g, '') // Mantém letras, números E espaços
              .replace(/\s+/g, ' ') // Substitui múltiplos espaços por um único espaço
              .trim(); // Remove espaços no início/fim
}

/**
 * Função auxiliar para obter o ano de forma segura a partir da data de lançamento do TMDB.
 * Retorna 'N/A' se a data for inválida ou não existir.
 * @param {string|null|undefined} releaseDate A string da data de lançamento do TMDB.
 * @returns {string} O ano como string ou 'N/A'.
 */
function getYearFromReleaseDate(releaseDate) {
    if (!releaseDate) return 'N/A';
    try {
        const date = new Date(releaseDate);
        if (isNaN(date.getTime())) { // Verifica se a data é "Invalid Date"
            return 'N/A';
        }
        return date.getFullYear().toString();
    } catch (e) {
        return 'N/A';
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('impostor')
        .setDescription(`Guess which of ${NUMBER_OF_OPTIONS} movies the user hated! (One is rated 1 star or less)`)
        .addUserOption(option =>
            option.setName('target_user')
                .setDescription('The Discord user whose Letterboxd profile will be used for the game.')
                .setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply();

        const channelId = interaction.channel.id;
        const targetDiscordUser = interaction.options.getUser('target_user');

        // Verificar se já existe um jogo ativo no canal
        if (activeImpostorGames.has(channelId)) {
            await interaction.editReply({ content: 'Já existe um jogo do Impostor ativo neste neste canal. Por favor, espere-o terminar.', ephemeral: true });
            return;
        }

        let usersData = {};
        try {
            usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8')); //
        } catch (e) {
            console.error("Error reading users.json:", e);
            await interaction.editReply({ content: 'Ocorreu um erro ao carregar dados de usuário. Tente novamente mais tarde.', ephemeral: true });
            return;
        }

        // Função auxiliar para obter o username Letterboxd
        const getLetterboxdUsername = (discordId) => {
            const userEntry = usersData[discordId]; //
            if (typeof userEntry === 'string') {
                return userEntry;
            } else if (typeof userEntry === 'object' && userEntry !== null && userEntry.letterboxd) {
                return userEntry.letterboxd; //
            }
            return null;
        };

        const targetLetterboxdUsername = getLetterboxdUsername(targetDiscordUser.id);

        if (!targetLetterboxdUsername) {
            await interaction.editReply({ content: `O usuário **${targetDiscordUser.displayName || targetDiscordUser.username}** não tem uma conta Letterboxd vinculada.`, ephemeral: true });
            return;
        }

        try {
            // Guarda a referência da primeira mensagem para edições posteriores (principalmente em caso de erro)
            const initialInteractionReply = await interaction.editReply(`Coletando dados do diário de **${targetLetterboxdUsername}**...`); 

            const diary = await getFullDiary(targetLetterboxdUsername); //

            if (!diary || diary.length === 0) {
                await initialInteractionReply.edit({ content: `Não foi possível recuperar o diário de **${targetLetterboxdUsername}** ou ele está vazio.`, ephemeral: true });
                return;
            }

            // Filtrar filmes amados (rating >= 4.0) e odiados (rating <= 1.0)
            const lovedFilms = diary.filter(entry => entry.rating >= 4.0); //
            const hatedFilms = diary.filter(entry => entry.rating <= 1.0); //

            // Precisamos de pelo menos 1 filme odiado e (NUMBER_OF_OPTIONS - 1) filmes amados
            if (hatedFilms.length < 1 || lovedFilms.length < (NUMBER_OF_OPTIONS - 1)) {
                await initialInteractionReply.edit({ content: `O diário de **${targetLetterboxdUsername}** não contém filmes suficientes (pelo menos 1 odiado e ${NUMBER_OF_OPTIONS - 1} amados) para iniciar o jogo do Impostor.`, ephemeral: true });
                return;
            }

            // Selecionar o filme impostor aleatoriamente
            const impostorMovieEntry = hatedFilms[Math.floor(Math.random() * hatedFilms.length)];

            // Selecionar (NUMBER_OF_OPTIONS - 1) filmes amados aleatoriamente
            const selectedLovedFilms = [];
            const lovedFilmSlugs = new Set(); 
            
            while (selectedLovedFilms.length < (NUMBER_OF_OPTIONS - 1) && lovedFilms.length > selectedLovedFilms.length) {
                const randomIndex = Math.floor(Math.random() * lovedFilms.length);
                const potentialLovedFilm = lovedFilms[randomIndex];
                if (potentialLovedFilm.slug !== impostorMovieEntry.slug && !lovedFilmSlugs.has(potentialLovedFilm.slug)) {
                    selectedLovedFilms.push(potentialLovedFilm);
                    lovedFilmSlugs.add(potentialLovedFilm.slug); 
                }
                if (lovedFilmSlugs.size >= lovedFilms.length && lovedFilms.length < (NUMBER_OF_OPTIONS - 1)) break;
            }
            
            if (selectedLovedFilms.length < (NUMBER_OF_OPTIONS - 1)) {
                 await initialInteractionReply.edit({ content: `Não foi possível encontrar filmes amados únicos o suficiente para **${targetDiscordUser.displayName || targetDiscordUser.username}** para iniciar o jogo do Impostor.`, ephemeral: true });
                 return;
            }

            // Combine todos os filmes (impostor + amados)
            const allGameMovieEntries = [impostorMovieEntry, ...selectedLovedFilms];
            
            // Buscar detalhes do TMDB para cada filme (necessário para sinopse/poster/ID)
            const tmdbMoviePromises = allGameMovieEntries.map(entry => searchMovieTMDB(entry.title, entry.year)); //
            const tmdbMovies = await Promise.all(tmdbMoviePromises);

            // Filtrar falhas na busca TMDB e garantir que temos todos os dados necessários
            const gameMovies = tmdbMovies.filter(m => 
                m !== null && 
                m.id && 
                m.title && 
                m.overview && 
                m.poster_path
            );
            
            if (gameMovies.length < NUMBER_OF_OPTIONS) { 
                await initialInteractionReply.edit({ content: `Não foi possível obter detalhes suficientes (título, sinopse, pôster) do TMDB para ${NUMBER_OF_OPTIONS} filmes. Tente novamente mais tarde ou escolha outro usuário.`, ephemeral: true });
                return;
            }

            // --- DEBGUANDO O MAPEAR O FILME IMPOSTOR ---
            console.log(`[Impostor Debug] Impostor from Letterboxd: Title='${impostorMovieEntry.title}', Year='${impostorMovieEntry.year}', Rating=${impostorMovieEntry.rating}`);
            console.log(`[Impostor Debug] Normalized Impostor Title: '${normalizeString(impostorMovieEntry.title)}'`);
            console.log(`[Impostor Debug] TMDB Game Movies obtained:`);
            gameMovies.forEach(m => console.log(`  - ${m.title} (${getYearFromReleaseDate(m.release_date)}) - Normalized: '${normalizeString(m.title)}'`));

            // Busque o filme impostor de forma mais robusta usando título e ano
            let impostorTmdbMovie = gameMovies.find(m => {
                const tmdbYear = getYearFromReleaseDate(m.release_date);
                const lbYear = impostorMovieEntry.year ? impostorMovieEntry.year.toString() : 'N/A';
                return normalizeString(m.title) === normalizeString(impostorMovieEntry.title) && tmdbYear === lbYear;
            });

            // Se o match primário falhar, tente apenas pelo título normalizado (menos preciso, mas pode funcionar como fallback)
            if (!impostorTmdbMovie) {
                console.warn(`[Impostor Debug] Impostor match by title+year failed. Trying by title only as fallback.`);
                impostorTmdbMovie = gameMovies.find(m => normalizeString(m.title) === normalizeString(impostorMovieEntry.title));
            }


            if (!impostorTmdbMovie) {
                console.error(`[Impostor Error] Final failure to map impostor. Original LB Entry: ${JSON.stringify(impostorMovieEntry)}. TMDB GameMovies found: ${JSON.stringify(gameMovies.map(m => ({id: m.id, title: m.title, year: getYearFromReleaseDate(m.release_date)})))}`);
                 await initialInteractionReply.edit({ content: `Erro interno: Não foi possível mapear o filme impostor para os dados do TMDB. Isso pode ocorrer por pequenas diferenças de título ou ano entre Letterboxd e TMDB, ou se a busca TMDB falhou especificamente para o filme odiado. Por favor, tente novamente.`, ephemeral: true });
                 return;
            }

            // GameMovies já contém os 10 filmes (1 impostor, 9 amados)
            // É CRUCIAL EMBARALHAR AQUI PARA QUE O IMPOSTOR NÃO SEJA SEMPRE O PRIMEIRO!
            for (let i = gameMovies.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [gameMovies[i], gameMovies[j]] = [gameMovies[j], gameMovies[i]];
            }

            const impostorCustomId = `impostor_game_${channelId}`; // ID único para o select menu

            // Criar o Select Menu com as opções de filme (10 filmes)
            const selectMenuOptions = gameMovies.map((movie, index) => ({
                label: `${index + 1}. ${movie.title}`, // REMOVIDO: (${getYearFromReleaseDate(movie.release_date)})
                value: movie.id.toString(), // Valor é o TMDB ID
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(impostorCustomId)
                .setPlaceholder('Qual desses filmes o(a) usuário(a) odiou?');

            if (selectMenuOptions.length > 0) {
                 selectMenu.addOptions(selectMenuOptions);
            } else {
                 await initialInteractionReply.edit({ content: `Não foi possível criar opções de select menu para o jogo.`, ephemeral: true });
                 return;
            }

            const actionRow = new ActionRowBuilder()
                .addComponents(selectMenu);

            // Criar o embed inicial do jogo (com sinopses e pôsteres)
            const impostorEmbed = new EmbedBuilder()
                .setColor(0xEE4B2B) // Cor vermelha para o impostor
                .setTitle(`🕵️‍♂️ The Impostor Game: Guess ${targetDiscordUser.displayName || targetDiscordUser.username}'s Hated Film! 🕵️‍♀️`)
                .setDescription(`Entre os ${NUMBER_OF_OPTIONS} filmes abaixo, um foi avaliado com **1 estrela ou menos** por **${targetDiscordUser.displayName || targetDiscordUser.username}** no Letterboxd. Os outros foram avaliados com **4 estrelas ou mais**.\n\nEscolha o impostor no menu abaixo! Você tem **uma chance**.\n`);

            // --- Remover fields e adicionar grade de pôsteres ---
            const filmsForGridAndLinks = await Promise.all(gameMovies.map(async (movie) => {
                let letterboxdFilmUrl = null;
                // Tenta encontrar o filme no Letterboxd para obter a URL
                const lbSearchResults = await searchLetterboxd(movie.title);
                const lbFilmResult = lbSearchResults.find(r => 
                    r.type === 'film' && 
                    normalizeString(r.title) === normalizeString(movie.title) &&
                    (movie.release_date ? getYearFromReleaseDate(movie.release_date) === getYearFromReleaseDate(r.year) : true) // Compara o ano de forma segura
                );

                if (lbFilmResult) {
                    letterboxdFilmUrl = `https://letterboxd.com/film/${lbFilmResult.slug}/`;
                }
                
                return {
                    title: movie.title,
                    year: getYearFromReleaseDate(movie.release_date), // O ano será útil para o createGridImage nos slugs, se for usado
                    slug: movie.id, // Será usado como fallback no createGridImage se o URL específico não for passado
                    posterUrl: getTmdbPosterUrl(movie.poster_path, 'w342'), // Tamanho maior para a grade
                    tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`, // Fallback para TMDB
                    finalUrl: letterboxdFilmUrl || `https://www.themoviedb.org/movie/${movie.id}` // Link preferencial
                };
            }));

            // Usar createGridImage para gerar a imagem da grade
            const { embed: gridEmbed, attachment: gridAttachment } = await createGridImage(
                filmsForGridAndLinks, 
                `Filmes do Jogo do Impostor para ${targetDiscordUser.displayName || targetDiscordUser.username}`, 
                5, // 5 colunas
                2  // 2 linhas (para 10 filmes)
            );

            // Substituir o embed principal pelo gridEmbed e adicionar o texto do impostor acima dele
            // O embed principal agora terá a descrição do jogo e a imagem da grade.
            // Os fields individuais serão removidos para não duplicar informações e simplificar.
            impostorEmbed.setImage(`attachment://${gridAttachment.name}`); // Define a imagem para o embed principal
            impostorEmbed.setFields([]); // Remove todos os campos, incluindo os de sinopse/ano


            const impostorMessage = await interaction.editReply({ 
                embeds: [impostorEmbed], 
                components: [actionRow], 
                files: [gridAttachment] // Anexa a imagem da grade
            });

            // Armazenar os dados do jogo no mapa de jogos ativos
            activeImpostorGames.set(channelId, {
                targetUserId: targetDiscordUser.id,
                correctImpostorMovieId: impostorTmdbMovie.id.toString(),
                timeoutId: setTimeout(async () => {
                    const resultEmbed = revealImpostorAnswer(impostorTmdbMovie, null, false); // Ninguém acertou
                    await impostorMessage.edit({ embeds: [resultEmbed], components: [] }).catch(console.error);
                    activeImpostorGames.delete(channelId);
                }, IMPOSTOR_TIMEOUT_MS),
                guessedUsers: new Set() // Para registrar quem já tentou
            });

            // 6. Coletar interações do Select Menu
            const collectorFilter = i => i.customId === impostorCustomId;
            
            const collector = impostorMessage.createMessageComponentCollector({ filter: collectorFilter, time: IMPOSTOR_TIMEOUT_MS });

            collector.on('collect', async i => {
                const selectedMovieId = i.values[0];
                const session = activeImpostorGames.get(channelId);

                if (!session) { 
                    await i.reply({ content: 'Este jogo do Impostor não está mais ativo.', ephemeral: true });
                    return;
                }

                // Verificar se o usuário já tentou (apenas uma chance por jogador)
                if (session.guessedUsers.has(i.user.id)) {
                    await i.reply({ content: 'Você já fez seu palpite neste jogo. Apenas uma chance por jogador!', ephemeral: true });
                    return;
                }
                session.guessedUsers.add(i.user.id); 

                if (selectedMovieId === session.correctImpostorMovieId) {
                    // Acertou!
                    clearTimeout(session.timeoutId);
                    activeImpostorGames.delete(channelId);

                    const resultEmbed = revealImpostorAnswer(impostorTmdbMovie, i.user, true); // Acertou
                    
                    await i.update({ embeds: [resultEmbed], components: [] }); // Atualiza a mensagem original
                    collector.stop(); // Encerra o coletor
                } else {
                    // Errou!
                    clearTimeout(session.timeoutId); // Termina o jogo
                    activeImpostorGames.delete(channelId);
                    const resultEmbed = revealImpostorAnswer(impostorTmdbMovie, i.user, false); // Errou
                    await i.update({ embeds: [resultEmbed], components: [] });
                    collector.stop();
                }
            });

            collector.on('end', async collected => {
                if (!activeImpostorGames.has(channelId)) return; 

                const session = activeImpostorGames.get(channelId);
                const resultEmbed = revealImpostorAnswer(impostorTmdbMovie, null, false); // Tempo esgotado
                
                await impostorMessage.edit({ embeds: [resultEmbed], components: [] }).catch(console.error);
                activeImpostorGames.delete(channelId);
            });

        } catch (error) {
            console.error(`Error executing /impostor command for ${targetDiscordUser.tag}:`, error);
            let errorMessage = `Ocorreu um erro ao configurar o jogo do Impostor. Detalhes: ${error.message}`;
            if (error.message.includes('Profile is Private')) {
                errorMessage = `O perfil do Letterboxd de **${targetLetterboxdUsername}** é privado. Não é possível acessar os dados.`;
            } else if (error.message.includes('User not found')) {
                errorMessage = `O usuário do Letterboxd **${targetLetterboxdUsername}** não foi encontrado.`;
            } else if (error.message.includes('Não foi possível obter detalhes suficientes')) { 
                 errorMessage = `Não foi possível encontrar filmes amados ou odiados suficientes com detalhes completos para iniciar o jogo.`;
            } else if (error.message.includes('Não foi possível mapear o filme impostor')) { 
                 errorMessage = `Não foi possível mapear o filme impostor para os dados do TMDB. Isso pode ocorrer por pequenas diferenças de título ou ano.`;
            } else if (error.message.includes('Could not connect to Letterboxd')) { 
                errorMessage = `Não foi possível conectar ao Letterboxd. Verifique a conexão do bot ou tente novamente mais tarde.`;
            }
            // Envia a mensagem de erro detalhada efemera
            await interaction.editReply({
                content: errorMessage,
                ephemeral: true 
            });
            activeImpostorGames.delete(channelId); 
        }
    }
};