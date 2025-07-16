// commands/familymatch.js

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 
import { getFullDiary } from '../scraper/getFullDiary.js';
import { discoverMoviesTMDB, getTmdbGenres, getTmdbPosterUrl } from '../api/tmdb.js';
import { createMovieEmbed } from '../utils/formatEmbed.js'; 

// Resolve __filename e __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

// Mapa para gerenciar sessões ativas de Family Match por canal
const activeFamilyMatches = new Map(); // channelId -> { ownerId, participants: Set<DiscordUser>, messageId, timeoutId }

// Tempo limite para a fila (1 minuto = 60000 ms)
const QUEUE_TIMEOUT_MS = 60000; 
const MIN_PARTICIPANTS = 2; // Mínimo de participantes para iniciar a busca de filme (owner + 1)
const MAX_PARTICIPANTS = 5; // Máximo de participantes para o Family Match

// Função auxiliar para normalizar strings para comparação (útil para títulos de filmes)
function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, ''); // Remove não alfanuméricos e minúsculas
}

export default {
    data: new SlashCommandBuilder()
        .setName('familymatch')
        .setDescription('Starts a group movie recommendation session.'),
    
    async execute(interaction) {
        await interaction.deferReply();

        const channelId = interaction.channel.id;
        const ownerId = interaction.user.id;

        // 1. Verificar se já existe uma sessão ativa no canal
        if (activeFamilyMatches.has(channelId)) {
            await interaction.editReply({ content: 'Já existe uma sessão de Family Match ativa neste canal. Por favor, espere-a terminar ou feche-a.', ephemeral: true });
            return;
        }

        // 2. Criar os botões de interação
        const joinButton = new ButtonBuilder()
            .setCustomId('familymatch_join')
            .setLabel('Entrar na Fila')
            .setStyle(ButtonStyle.Primary);

        const closeButton = new ButtonBuilder()
            .setCustomId('familymatch_close')
            .setLabel('Fechar Fila')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(joinButton, closeButton);

        // 3. Criar e enviar a mensagem inicial da fila
        const queueEmbed = new EmbedBuilder()
            .setColor(0x0099FF) // Azul
            .setTitle('🎬 Family Match: Fila Aberta! 🍿')
            .setDescription(`**${interaction.user.displayName || interaction.user.username}** abriu uma fila para encontrar um filme para o grupo!\n\n` +
                            `Clique em "Entrar na Fila" para participar.\n` +
                            `A fila será fechada automaticamente em 1 minuto ou quando ${MAX_PARTICIPANTS} pessoas entrarem.\n\n` +
                            `**Participantes (1/${MAX_PARTICIPANTS}):**\n` +
                            `• ${interaction.user.displayName || interaction.user.username} (Iniciador)`);

        const queueMessage = await interaction.editReply({ 
            embeds: [queueEmbed], 
            components: [row] 
        });

        // 4. Inicializar a sessão no mapa de sessões ativas
        const participants = new Set();
        participants.add(interaction.user); // Adiciona o iniciador como primeiro participante

        const timeoutId = setTimeout(async () => {
            // Lógica para quando o tempo limite expirar
            const session = activeFamilyMatches.get(channelId);
            if (session) {
                if (session.participants.size < MIN_PARTICIPANTS) {
                    await queueMessage.delete().catch(console.error); // Tenta deletar a mensagem da fila
                    await interaction.followUp({ 
                        content: `A sessão de Family Match no canal ${interaction.channel.name} expirou por falta de participantes (${session.participants.size} de ${MIN_PARTICIPANTS} necessários).`, 
                        ephemeral: true 
                    }).catch(console.error);
                } else {
                    // Se houver participantes suficientes, iniciar a busca de filme
                    await findAndRecommendMovie(interaction, session.participants, queueMessage);
                }
                activeFamilyMatches.delete(channelId); // Remove a sessão do mapa
            }
        }, QUEUE_TIMEOUT_MS);

        activeFamilyMatches.set(channelId, {
            ownerId: ownerId,
            participants: participants,
            messageId: queueMessage.id,
            timeoutId: timeoutId
        });

        console.log(`[FamilyMatch] Sessão iniciada no canal ${channelId} por ${interaction.user.tag}.`);
    }
};

/**
 * Lida com o clique no botão 'Entrar na Fila'.
 * @param {ButtonInteraction} interaction A interação do botão.
 */
export async function handleJoinButton(interaction) {
    await interaction.deferUpdate(); // Acknowledge the button click immediately

    const channelId = interaction.channel.id;
    const session = activeFamilyMatches.get(channelId);

    if (!session) {
        await interaction.followUp({ content: 'Esta sessão de Family Match não está mais ativa.', ephemeral: true });
        return;
    }

    if (session.participants.has(interaction.user)) {
        await interaction.followUp({ content: 'Você já está nesta fila!', ephemeral: true });
        return;
    }

    if (session.participants.size >= MAX_PARTICIPANTS) {
        await interaction.followUp({ content: 'A fila de Family Match já está cheia!', ephemeral: true });
        return;
    }

    session.participants.add(interaction.user); // Adiciona o usuário aos participantes
    console.log(`[FamilyMatch] ${interaction.user.tag} entrou na fila no canal ${channelId}.`);

    // Atualizar a mensagem da fila
    const currentParticipantsList = Array.from(session.participants).map(u => `• ${u.displayName || u.username}`).join('\n');
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setDescription(
            `**${interaction.guild.members.cache.get(session.ownerId)?.displayName || 'Alguém'}** abriu uma fila para encontrar um filme para o grupo!\n\n` +
            `Clique em "Entrar na Fila" para participar.\n` +
            `A fila será fechada automaticamente em 1 minuto ou quando ${MAX_PARTICIPANTS} pessoas entrarem.\n\n` +
            `**Participantes (${session.participants.size}/${MAX_PARTICIPANTS}):**\n` +
            currentParticipantsList
        );

    await interaction.message.edit({ embeds: [updatedEmbed] });

    // Se a fila atingir o máximo, iniciar o jogo
    if (session.participants.size === MAX_PARTICIPANTS) {
        clearTimeout(session.timeoutId); // Cancela o timeout da fila
        activeFamilyMatches.delete(channelId); // Remove a sessão do mapa
        await findAndRecommendMovie(interaction, session.participants, interaction.message);
    }
}

/**
 * Lida com o clique no botão 'Fechar Fila'.
 * @param {ButtonInteraction} interaction A interação do botão.
 */
export async function handleCloseButton(interaction) {
    await interaction.deferUpdate(); // Acknowledge the button click immediately

    const channelId = interaction.channel.id;
    const userId = interaction.user.id;
    const session = activeFamilyMatches.get(channelId);

    if (!session) {
        await interaction.followUp({ content: 'Esta sessão de Family Match não está mais ativa.', ephemeral: true });
        return;
    }

    if (session.ownerId !== userId) {
        await interaction.followUp({ content: 'Apenas o iniciador da fila pode fechá-la.', ephemeral: true });
        return;
    }

    clearTimeout(session.timeoutId); // Cancela o timeout da fila
    activeFamilyMatches.delete(channelId); // Remove a sessão do mapa
    console.log(`[FamilyMatch] Sessão fechada no canal ${channelId} por ${interaction.user.tag}.`);

    if (session.participants.size < MIN_PARTICIPANTS) {
        await interaction.message.edit({ 
            embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setDescription('A fila de Family Match foi fechada, mas não havia participantes suficientes para encontrar um filme.')],
            components: [] // Remove os botões
        });
        await interaction.followUp({ content: 'A fila foi fechada, mas não havia participantes suficientes para encontrar um filme.', ephemeral: true });
    } else {
        await findAndRecommendMovie(interaction, session.participants, interaction.message);
    }
}

// --- Lógica de busca e recomendação de filme ---
async function findAndRecommendMovie(interaction, participants, queueMessage) {
    await queueMessage.edit({ 
        embeds: [EmbedBuilder.from(queueMessage.embeds[0]).setDescription('Fila fechada! Buscando o filme ideal para o grupo... Isso pode levar um tempo.')],
        components: [] // Remove os botões
    });

    console.log(`[FamilyMatch] Iniciando busca de filme para ${participants.size} participantes no canal ${interaction.channel.id}.`);
    
    let usersData = {};
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8')); //
    } catch (e) {
        console.error("Error reading users.json in findAndRecommendMovie:", e);
        await queueMessage.edit({ content: 'Ocorreu um erro ao carregar dados de usuário. Tente novamente mais tarde.', components: [] });
        return;
    }

    const letterboxdUsernames = [];
    const missingLbUsers = [];
    const allUserDiaries = []; // Armazenará os diários de todos os participantes com conta Letterboxd

    for (const user of participants) {
        const userEntry = usersData[user.id]; //
        let lbUsername = null;
        if (typeof userEntry === 'string') {
            lbUsername = userEntry;
        } else if (typeof userEntry === 'object' && userEntry !== null && userEntry.letterboxd) {
            lbUsername = userEntry.letterboxd; //
        }

        if (lbUsername) {
            letterboxdUsernames.push(lbUsername);
            try {
                const diary = await getFullDiary(lbUsername); //
                if (diary && diary.length > 0) {
                    allUserDiaries.push({ username: lbUsername, diary: diary });
                } else {
                    console.warn(`[FamilyMatch] Diary for ${lbUsername} is empty or could not be fetched.`);
                }
            } catch (diaryError) {
                console.error(`[FamilyMatch] Error fetching diary for ${lbUsername}:`, diaryError);
                // Não adicionamos à lista de diários, mas o processo pode continuar para outros
            }
        } else {
            missingLbUsers.push(user.displayName || user.username);
        }
    }

    // Se menos participantes têm conta Letterboxd do que o mínimo, encerra.
    if (allUserDiaries.length < MIN_PARTICIPANTS) {
        let msg = `Não foi possível encontrar um filme ideal. É necessário que pelo menos ${MIN_PARTICIPANTS} participantes tenham contas Letterboxd vinculadas.`;
        if (missingLbUsers.length > 0) {
            msg += `\nUsuários sem conta Letterboxd vinculada ou diário vazio: ${missingLbUsers.join(', ')}.`;
        }
        await queueMessage.edit({ content: msg, components: [] });
        return;
    }

    // --- Coletar todos os filmes já assistidos pelo grupo ---
    const allWatchedNormalizedTitles = new Set();
    const genreCounts = new Map(); // Para contar a frequência de gêneros
    const allGenres = await getTmdbGenres(); //
    const genreMap = new Map(allGenres.map(g => [g.id, g.name]));

    for (const userDiary of allUserDiaries) {
        userDiary.diary.forEach(entry => {
            if (entry.title) {
                allWatchedNormalizedTitles.add(normalizeString(entry.title)); //
            }
        });
    }

    // --- Buscar filmes candidatos ---
    let recommendedMovie = null;
    let currentPage = 1;
    const maxPagesToSearch = 5; // Limita a busca a X páginas para não sobrecarregar a API

    while (!recommendedMovie && currentPage <= maxPagesToSearch) {
        const candidates = await discoverMoviesTMDB({
            sortBy: 'popularity.desc',
            voteCountGte: 50, // Garante que sejam filmes razoavelmente populares
            page: currentPage
        }); //

        if (!candidates || candidates.length === 0) break;

        for (const candidate of candidates) {
            const normalizedCandidateTitle = normalizeString(candidate.title);
            
            // Verifica se o filme já foi assistido por qualquer um do grupo
            const isAlreadyWatched = allWatchedNormalizedTitles.has(normalizedCandidateTitle);
            
            if (!isAlreadyWatched) {
                // Encontramos um filme que ninguém assistiu!
                recommendedMovie = candidate;
                break;
            }
        }
        currentPage++;
    }

    // --- Apresentar o resultado ---
    if (recommendedMovie) {
        const posterUrl = getTmdbPosterUrl(recommendedMovie.poster_path, 'w500'); //
        const genreNames = recommendedMovie.genre_ids ? recommendedMovie.genre_ids.map(id => genreMap.get(id) || 'Unknown Genre') : [];

        const participantsUsernames = Array.from(participants).map(u => u.displayName || u.username);
        
        // Podemos usar createMovieEmbed para exibir o filme
        const embed = createMovieEmbed(recommendedMovie, posterUrl, genreNames, `https://www.themoviedb.org/movie/${recommendedMovie.id}`); 
        
        embed.setTitle(`🎥 Family Match: Your Ideal Movie! 🍿`);
        embed.setDescription(`Here's a movie recommendation for the group:\n\n${embed.data.description}`);
        embed.addFields(
            { name: 'Participants', value: participantsUsernames.join(', '), inline: false },
            { name: 'Why this movie?', value: 'This movie is a popular choice that none of the participants have watched yet.', inline: false }
        );

        await queueMessage.edit({ embeds: [embed], components: [] });
    } else {
        await queueMessage.edit({ 
            content: `Não foi possível encontrar um filme ideal para o grupo entre as ${maxPagesToSearch} páginas de filmes populares que ninguém assistiu. Tente com outros participantes ou critérios.`, 
            components: [] 
        });
    }
}